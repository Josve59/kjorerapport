/* Testelever til trafikklærervisningen (0.12.0): tre elever med øvingsturer laget av demoturen, så elevlisten,
   profilene og leksene kan prøves før delingen med elevene finnes. Turene får id «test-…» og kan fjernes igjen. */
import { makeDemo } from './analysis.js';
import { importDrive, listDrives, deleteDrive } from './db.js';

export const TEST_STUDENTS = [
  // navn, antall turer, hvor brå (1 = som demoturen), hvor mange dager siden første tur
  { name: 'Emma', email: 'emma@example.com', n: 7, k: [1.25, 0.75], days: 40 },
  { name: 'Jonas', email: 'jonas@example.com', n: 4, k: [1.35, 1.1], days: 20 },
  { name: 'Sara', email: 'sara@example.com', n: 9, k: [1.0, 0.7], days: 60 }
];

export async function createTestDrives(now = Date.now()) {
  let made = 0;
  for (const [si, st] of TEST_STUDENTS.entries()) {
    for (let i = 0; i < st.n; i++) {
      const id = `test-${st.name.toLowerCase()}-${i}`;
      const f = st.n > 1 ? i / (st.n - 1) : 1;
      const k = st.k[0] + (st.k[1] - st.k[0]) * f;   // eldre turer brå, nyere mykere
      const seed = 31 + si * 50 + i * 3;
      const parts = [0, 1].map(r => makeDemo(seed + r * 100, { yaw: 0.6, pitch: 0.3 }));
      const input = { loc: [], gyro: [], grav: [], acc: [] };
      let t0 = 0;
      for (const p of parts) { for (const key of ['loc', 'gyro', 'grav', 'acc']) for (const x of p[key]) input[key].push({ ...x, t: x.t + t0 }); t0 += p.gyro[p.gyro.length - 1].t + 0.1; }
      input.acc = input.acc.map(a => ({ ...a, x: a.x * k * 0.8, y: a.y * k * 0.8, z: a.z * k * 0.8 }));
      input.gyro = input.gyro.map(a => ({ ...a, x: a.x * k, y: a.y * k, z: a.z * k }));
      const day = st.days * (1 - f);
      const at = new Date(now - day * 86400000);
      at.setHours(i % 3 === 0 ? 18 : 15, (i * 17) % 60, 0, 0);
      const r = await importDrive({ drive: { id, startedAt: at.toISOString(), driver: st.name, imported: false }, input }, { keepId: true });
      if (!r.skipped) made++;
    }
  }
  return made;
}

export async function removeTestDrives() {
  for (const d of await listDrives()) if (String(d.id).startsWith('test-')) await deleteDrive(d.id);
}
