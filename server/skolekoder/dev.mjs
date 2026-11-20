/* Skolekode-serveren lokalt på Macen (0.27.0), til testing før den ligger hos Cloudflare. Samme kode (worker.js), med
   lagringen i en fil i stedet for Cloudflare KV.
   Bruk: node server/skolekoder/dev.mjs [port]   (standard 8787)
   Nøklene og admin-hemmeligheten leses fra .local-test/skolekoder/ (lages av «node tools/skolekoder.mjs nokler»). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.local-test/skolekoder');
const port = Number(process.argv[2]) || 8787;

/* KV i en fil: get/put/list som i Cloudflare */
export function fileKV(file) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* ny */ }
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); };
  return {
    async get(k) { return k in data ? data[k].value : null; },
    // Turer fra testere (0.27.5) er binære: lagres som base64 i fila
    async put(k, value, opts = {}) { data[k] = typeof value === 'string' ? { value, metadata: opts.metadata || null } : { b64: Buffer.from(value).toString('base64'), metadata: opts.metadata || null }; save(); },
    async getWithMetadata(k) { const d = data[k]; if (!d) return { value: null, metadata: null }; return { value: d.b64 ? new Uint8Array(Buffer.from(d.b64, 'base64')).buffer : d.value, metadata: d.metadata }; },
    async delete(k) { delete data[k]; save(); },
    async list({ prefix = '', cursor } = {}) {
      const keys = Object.keys(data).filter(k => k.startsWith(prefix)).sort().map(name => ({ name, metadata: data[name].metadata }));
      return { keys, list_complete: true, cursor: null };
    }
  };
}

const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return null; } };
const env = { CODES: fileKV(path.join(dir, 'dev-kv.json')), ADMIN_SECRET: read('admin.txt'), SIGN_KEY: read('privat.jwk.json') };
if (!env.ADMIN_SECRET || !env.SIGN_KEY) { console.error('Mangler nøkler: kjør først «node tools/skolekoder.mjs nokler».'); process.exit(1); }

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body });
  const r = await worker.fetch(request, env, {});
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`Skolekoder lokalt på http://localhost:${port}`));
