import type { Plugin } from 'vite';
import type { VercelRequest, VercelResponse } from '../api/_types.js';

const ROUTES = new Set(['testchange', 'ai-ocr', 'ai-cropdetect', 'ai-solution', 'ai-variant',
  'ai-image', 'ai-generate', 'ai-figure', 'ai-figure-detect', 'figure-render', 'ai-exam-analysis', 'ai-exam-commentary', 'ai-exam-v4']);

/** Vercel API를 로컬에서도 같은 인증·검증 경로로 실행한다. 서버 키는 Node에만 둔다. */
export const localApiPlugin = (): Plugin => ({
  name: 'mathgen-local-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const route = url.pathname.match(/^\/api\/([a-z-]+)$/)?.[1];
      if (!route || !ROUTES.has(route)) return next();
      const address = req.socket.remoteAddress;
      const host = req.headers.host ?? '';
      const origin = req.headers.origin;
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '');
      const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
      if (!local || !localHost || (origin && origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      const request = Object.assign(req, { query: Object.fromEntries(url.searchParams), cookies: {} }) as VercelRequest;
      const response = Object.assign(res, {
        status(code: number) { res.statusCode = code; return response; },
        json(data: unknown) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return response; },
        send(data: string | Buffer) { res.end(data); return response; },
      }) as unknown as VercelResponse;
      try {
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 12 * 1024 * 1024) { response.status(413).json({ error: '요청 크기가 너무 큽니다.' }); return; }
            chunks.push(Buffer.from(chunk));
          }
          try { request.body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { response.status(400).json({ error: '요청 JSON이 올바르지 않습니다.' }); return; }
        }
        const api = await server.ssrLoadModule(route === "figure-render" ? "/scripts/figure/localRender.ts" : `/api/${route}.ts`);
        await api.default(request, response);
      } catch {
        if (!res.headersSent) response.status(500).json({ error: '로컬 데이터 연결에 실패했습니다.' });
        else res.end();
      }
    });
  },
});
