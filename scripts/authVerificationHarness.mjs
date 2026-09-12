import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await mkdir('.checks.local', { recursive: true });
const output = path.resolve('.checks.local/auth-verification.local.mjs');
await build({ entryPoints: ['api/_jwt.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'auth-fixture', setup(build) {
  build.onResolve({ filter: /\/_supabase\.js$/ }, () => ({ path: 'auth-client', namespace: 'fixture' }));
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getServiceClient = () => globalThis.fixtureAuthClient;', loader: 'js' }));
} }] });
const oldMode = process.env.VITE_TESTCHANGE_ENABLED;
process.env.VITE_TESTCHANGE_ENABLED = 'true';
try {
  const { resolveAuth, requireAuth } = await import(pathToFileURL(output).href);
  let calls = 0, mode = 'transient';
  globalThis.fixtureAuthClient = { auth: { getUser: async () => {
    calls++;
    if (mode === 'hang') return new Promise(() => {});
    const status = mode === 'transient' ? calls === 1 ? 504 : 200 : mode === 'denied' ? 401 : 504;
    return status === 200 ? { data: { user: { id: 'verified-user' } }, error: null } : { data: { user: null }, error: { status } };
  } } };
  const req = { headers: { authorization: 'Bearer test-only' } };
  const verified = await Promise.all([resolveAuth(req), resolveAuth(req)]);
  assert.equal(calls, 2); assert.ok(verified.every(result => result.userId === 'verified-user'));
  console.log('PASS Concurrent auth checks share one bounded retry after a 504');
  calls = 0; mode = 'denied';
  assert.equal((await resolveAuth(req)).userId, null); assert.equal(calls, 1);
  console.log('PASS Invalid credentials remain unauthorized and are not retried');
  const response = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  calls = 0; mode = 'unavailable';
  assert.equal(await requireAuth(req, response), null); assert.equal(calls, 2); assert.equal(response.statusCode, 503); assert.equal(response.headers['Retry-After'], '3');
  console.log('PASS Persistent auth outage returns 503 with retry guidance and no authorization bypass');
  mode = 'hang'; calls = 0;
  const native = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => native(fn, ms === 8000 ? 5 : ms, ...args);
  try { assert.equal((await resolveAuth(req)).unavailable, true); assert.equal(calls, 2); }
  finally { globalThis.setTimeout = native; }
  console.log('PASS A hung verification is bounded and fails closed');
} finally {
  if (oldMode === undefined) delete process.env.VITE_TESTCHANGE_ENABLED; else process.env.VITE_TESTCHANGE_ENABLED = oldMode;
  delete globalThis.fixtureAuthClient;
  await unlink(output);
}
