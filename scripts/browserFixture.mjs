// Self-contained test fixture. No Vite/dev process, real AI calls or credentials.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

export async function startBrowserFixture(entries, env = {}) {
  const assets = new Map();
  // Match Vite's browser-only SDK stubs; these Node tools are never part of OCR requests.
  const sdkStubs = { 'fs-util': 'fs-util.mjs', skills: 'agent-toolset-skills.mjs', node: 'agent-toolset-node.mjs' };
  const plugin = { name: 'browser-sdk-stubs', setup(build) {
    build.onResolve({ filter: /^node:/ }, args => ({ path: args.path, namespace: 'node-browser-external' }));
    build.onLoad({ filter: /.*/, namespace: 'node-browser-external' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
    build.onResolve({ filter: /(?:fs-util|skills|node)(?:\.m?js)?$/ }, args => {
      if (!`${args.importer}/${args.path}`.replaceAll('\\', '/').includes('@anthropic-ai/sdk/tools/agent-toolset/')) return;
      const key = args.path.split('/').at(-1).replace(/\.m?js$/, '');
      if (sdkStubs[key]) return { path: path.resolve('src/services/ai/_browser-stubs', sdkStubs[key]) };
    });
  } };
  for (const [route, entry] of Object.entries(entries)) {
    const result = await build({ entryPoints: [entry], bundle: true, write: false, outfile: 'fixture.js',
      platform: 'browser', format: 'esm', logLevel: 'silent',
      plugins: [plugin],
      loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
      define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, VITE_SUPABASE_ENABLED: 'false', ...env }),
        'process.env.NODE_ENV': '"development"' },
    });
    for (const file of result.outputFiles) assets.set(file.path.endsWith('.css') ? `${route}.css` : route, file.text);
  }
  const css = await postcss([tailwind()]).process(await readFile('src/styles/globals.css', 'utf8'), { from: 'src/styles/globals.css' });
  assets.set('/fixture.css', css.css);
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
    if (new URL(req.url, 'http://fixture.local').pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const styles = [...assets.keys()].filter(key => key.endsWith('.css')).map(key => `<link rel="stylesheet" href="${key}">`).join('');
      res.end(`<!doctype html><html lang="ko"><meta charset="utf-8">${styles}<title>Browser regression fixture</title><body><div id="root"></div></body></html>`);
    } else if (assets.has(req.url)) {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(req.url));
    } else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
