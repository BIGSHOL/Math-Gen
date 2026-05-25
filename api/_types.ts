/**
 * Vercel Function 의 핸들러 타입. `@vercel/node` 설치 후 그것으로 교체 가능.
 *
 * Vercel runtime 의 *실제 인터페이스* — req: Node IncomingMessage 확장 (body
 * 자동 parse, query 자동 parse 등), res: ServerResponse 확장 (status / json /
 * send 헬퍼).
 *
 * 인라인 정의 이유: 의존성 추가 (npm install --save-dev @vercel/node) 회피.
 * Phase 5a 의 의존성 변경 최소화. 진행 후 *공식 패키지 설치 + import 교체*.
 */
export interface VercelRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
  end(body?: unknown): VercelResponse;
  setHeader(name: string, value: string | string[]): VercelResponse;
}
