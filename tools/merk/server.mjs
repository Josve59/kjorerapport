// Merkesiden for feltlinjer (1.0.5): en liten server på Macen som viser veibildene og lagrer linjene eieren godkjenner.
// Bildene og etikettene ligger i .local-test/ (ikke i git) og forlater aldri Macen.
//   node tools/merk/server.mjs .local-test/veibilder/<økt> [port]     → http://localhost:8790
// Forslagene lages først med tools/merk/forslag.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || '');
const port = Number(process.argv[3] || process.env.PORT || 8790);
const merk = dir + '-merk';
const forslagFil = path.join(merk, 'forslag.json');
if (!fs.existsSync(forslagFil)) { console.error('Finner ikke forslagene. Kjør først: node tools/merk/forslag.mjs ' + dir); process.exit(1); }
// Forslagene leses på nytt når fila endres (Claudes gjennomgang tas inn mens serveren går)
let forslag = null, byId = new Map(), mtime = 0;
const load = () => {
  const t = fs.statSync(forslagFil).mtimeMs;
  if (t === mtime) return;
  forslag = JSON.parse(fs.readFileSync(forslagFil, 'utf8')); byId = new Map(forslag.frames.map(f => [f.id, f])); mtime = t;
};
load();
const okId = id => /^f\d{5}$/.test(id) && byId.has(id);
const etikettFil = id => path.join(merk, id + '.json');
const les = id => { try { return JSON.parse(fs.readFileSync(etikettFil(id), 'utf8')); } catch { return null; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer((req, res) => {
  try { load(); } catch { /* beholder forrige versjon */ }
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (req.method === 'GET' && (p === '/' || p === '/merk.js' || p === '/merk.css')) {
    const f = path.join(here, p === '/' ? 'index.html' : p.slice(1));
    return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)]);
  }
  if (req.method === 'GET' && p === '/api/sett') {
    return send(res, 200, { session: forslag.session, frames: forslag.frames.map(f => {
      const e = les(f.id);
      return { id: f.id, kmh: f.kmh, dark: f.dark, status: e ? e.status : null, n: e ? e.lines.length : f.lines.length };
    }) });
  }
  let m = p.match(/^\/api\/bilde\/(f\d{5})$/);
  if (req.method === 'GET' && m && okId(m[1])) {
    const f = byId.get(m[1]);
    let road = [];
    try { const meta = JSON.parse(fs.readFileSync(path.join(dir, f.id + '.json'), 'utf8')); road = meta.lanes.road || []; } catch { /* uten veikanter */ }
    return send(res, 200, { ...f, w: 720, h: 1280, road, etikett: les(f.id) });
  }
  m = p.match(/^\/img\/(f\d{5})\.jpg$/);
  if (req.method === 'GET' && m && okId(m[1])) return send(res, 200, fs.readFileSync(path.join(dir, m[1] + '.jpg')), 'image/jpeg');
  m = p.match(/^\/api\/etikett\/(f\d{5})$/);
  if (req.method === 'POST' && m && okId(m[1])) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 200000) req.destroy(); });
    req.on('end', () => {
      try {
        const e = JSON.parse(body);
        if (!['ok', 'hopp'].includes(e.status) || !Array.isArray(e.lines)) return send(res, 400, { error: 'feil format' });
        // Bare tall: linjer med minst to noder i bildet
        const lines = e.lines.map(l => ({ pts: (l.pts || []).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))
          .map(([x, y]) => [Math.round(Math.max(0, Math.min(720, x)) * 10) / 10, Math.round(Math.max(0, Math.min(1280, y)) * 10) / 10]) }))
          .filter(l => l.pts.length >= 2);
        const out = { id: m[1], status: e.status, lines, at: new Date().toISOString(), fra: e.fra || null };
        fs.writeFileSync(etikettFil(m[1]), JSON.stringify(out));
        return send(res, 200, out);
      } catch { return send(res, 400, { error: 'feil format' }); }
    });
    return;
  }
  send(res, 404, { error: 'fant ikke' });
}).listen(port, '127.0.0.1', () => console.log(`Merkesiden: http://localhost:${port}  (${forslag.frames.length} bilder fra ${forslag.session})`));
