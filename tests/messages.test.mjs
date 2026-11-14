import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage, readPackage, mergeThread, unread, markRead, unsent, refLabel, cleanMessage, packageName, studentOverview, sortStudents, filterStudents, isPackage, matchStudent, newPersonId } from '../js/messages.js';
import { cleanResult } from '../js/db.js';
import { forgetStudent, activeStudents, archivedStudents, students } from '../js/modes.js';

const drive = (id, driver, daysAgo, overall, extra = {}) => ({ id, driver, startedAt: new Date(Date.UTC(2026, 10, 14) - daysAgo * 86400000).toISOString(),
  result: { overall, stats: { duration: 1800, km: 20 }, points: [{ t: 0, lat: 63.4, lon: 10.4 }, { t: 1, lat: 63.401, lon: 10.4 }], events: [] }, ...extra });

test('meldingspakke: elev til lærer og tilbake (0.18.0)', () => {
  const d = drive('d1', 'Emma', 1, 82);
  const msg = { id: 'm1', from: 'elev', at: '2026-11-14T10:00:00.000Z', text: 'Hvordan var rundkjøringen?', ref: { driveId: 'd1', kind: 'hendelse', t: 754, lat: 63.4, lon: 10.4, label: 'Brå bremsing', startedAt: d.startedAt } };
  const pkg = buildPackage({ from: { role: 'elev', name: 'Emma' }, messages: [msg], drives: [d], appVersion: '0.18.0' });
  assert.ok(isPackage(pkg));
  const back = readPackage(JSON.parse(JSON.stringify(pkg)));
  assert.equal(back.from.name, 'Emma'); assert.equal(back.from.role, 'elev');
  assert.equal(back.messages[0].ref.t, 754); assert.equal(back.messages[0].text, msg.text);
  assert.equal(back.drives.length, 1, 'turen kommer med');
  assert.ok(!('input' in back.drives[0]), 'ingen rådata fra sensorene');
  // Læreren svarer med lekser
  const reply = readPackage(JSON.parse(JSON.stringify(buildPackage({ from: { role: 'laerer', name: 'Kari' }, to: 'Emma', messages: [{ id: 'm2', from: 'laerer', text: 'Bra! Se tidligere.' }], homework: { focus: ['roundabout'], note: 'Øv på Moholt', setAt: '2026-11-14' } }))));
  assert.equal(reply.messages[0].from, 'laerer'); assert.equal(reply.homework.focus[0], 'roundabout'); assert.equal(reply.homework.from, 'Kari');
  assert.throws(() => readPackage({ kind: 'noe annet' }), /ikke en melding/);
  assert.throws(() => readPackage({ ...pkg, v: 99 }), /nyere versjon/);
});

test('samtalen: ingen doble, uleste og usendte', () => {
  const a = cleanMessage({ id: 'a', from: 'elev', at: '2026-11-14T10:00:00Z', text: 'Hei' });
  const b = cleanMessage({ id: 'b', from: 'laerer', at: '2026-11-14T11:00:00Z', text: 'Hei!' });
  let t = mergeThread([{ ...a, sent: false }], [b, b]);
  assert.equal(t.length, 2); assert.equal(t[1].id, 'b');
  assert.equal(unread(t, 'elev'), 1); assert.equal(unsent(t, 'elev').length, 1);
  t = markRead(t, 'elev');
  assert.equal(unread(t, 'elev'), 0);
  assert.equal(cleanMessage({ text: '   ' }), null, 'tom melding uten tur');
});

test('hva meldingen gjelder, i vanlige ord', () => {
  assert.match(refLabel({ kind: 'strekning', t: 200, tTo: 465, startedAt: '2026-11-14T10:00:00Z' }), /strekningen 3:20–7:45/);
  assert.match(refLabel({ kind: 'hendelse', t: 754, label: 'Brå bremsing', startedAt: '2026-11-14T10:00:00Z' }), /brå bremsing ved 12:34/);
  assert.match(refLabel({ kind: 'tur' }), /hele turen/);
  assert.equal(packageName('Ørjan Åsen', new Date('2026-11-14T10:00:00Z')), 'kjorerapport-melding-orjan-asen-2026-11-14.json');
});

test('elevoversikt: 50 elever, søk, sortering og hvem som trenger oppfølging', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  const list = Array.from({ length: 50 }, (_, i) => ({ name: `Elev ${String(i).padStart(2, '0')}`, email: `e${i}@example.com` }));
  list.push({ name: 'Emma', email: 'emma@example.com' }, { name: 'Jonas' });
  const drives = [drive('e1', 'Emma', 1, 60), drive('e2', 'Emma', 3, 62), drive('j1', 'Jonas', 20, 90), ...list.slice(0, 50).map((s, i) => drive('x' + i, s.name, i % 7, 85))];
  const threads = { Jonas: [{ id: 'q', from: 'elev', at: '2026-11-13T10:00:00Z', text: 'Spørsmål' }] };
  const ov = studentOverview(drives, list, threads, now);
  const emma = ov.find(x => x.name === 'Emma'), jonas = ov.find(x => x.name === 'Jonas');
  assert.equal(emma.avg, 61); assert.ok(emma.flags.some(f => f.id === 'score'));
  assert.equal(jonas.newMsgs, 1); assert.ok(jonas.flags.some(f => f.id === 'idle'), 'ikke kjørt på 20 dager');
  const sorted = sortStudents(ov, 'need');
  assert.equal(sorted[0].name, 'Jonas', 'ny melding først'); assert.equal(sorted[1].name, 'Emma');
  assert.equal(sortStudents(ov, 'name')[0].name, 'Elev 00');
  assert.equal(filterStudents(ov, 'emm').length, 1);
  assert.equal(filterStudents(ov, 'E1@EX').length, 1, 'søk på e-post');
});

test('elev som har fått lappen slettes helt (0.18.2)', () => {
  const s = { students: [{ name: 'Emma' }, { name: 'Jonas' }], activeStudent: 'Emma', drivers: ['Emma'],
    lessons: { Emma: '2026-11-01', Jonas: '2026-10-01' }, homework: { Emma: { focus: [] } }, messages: { Emma: [{ id: 'a' }] }, theory: { Emma: {} },
    teacherNotes: { Emma: 'notat' }, curriculum: { Emma: {} }, calib: { Emma: {} } };
  const out = forgetStudent(s, 'Emma');
  assert.deepEqual(out.students.map(x => x.name), ['Jonas']);
  assert.deepEqual(out.drivers, [], 'heller ikke i den gamle førerlisten');
  for (const k of ['lessons', 'homework', 'messages', 'theory', 'teacherNotes', 'curriculum', 'calib']) assert.ok(!('Emma' in out[k]), k);
  assert.equal(out.lessons.Jonas, '2026-10-01', 'de andre elevene er urørt');
  assert.equal(out.activeStudent, 'Jonas');
  assert.ok(!JSON.stringify(out).includes('Emma'), 'navnet finnes ingen steder i innstillingene');
});

test('arkiverte elever fra 0.18.0–0.18.1 finnes og telles ikke som aktive', () => {
  const s = { students: [{ name: 'Emma' }, { name: 'Sara', archived: { at: '2026-11-01', reason: 'lappen' } }] };
  assert.deepEqual(activeStudents(s).map(x => x.name), ['Emma']);
  assert.deepEqual(archivedStudents(s), ['Sara']);
  assert.equal(students(s).length, 2);
  assert.deepEqual(archivedStudents({ students: [{ name: 'Emma' }] }), []);
});

test('eleven kjennes igjen på ID eller navn uten store/små bokstaver (0.18.3)', () => {
  const id = newPersonId();
  assert.match(id, /^p[a-z0-9]{16}$/);
  const list = [{ name: 'Emma' }, { name: 'Jonas', ids: ['pabcdefabcdef1234'] }, { name: 'Sara H.' }];
  assert.equal(matchStudent(list, { name: 'emma' }), 'Emma', 'samme navn, liten forbokstav');
  assert.equal(matchStudent(list, { name: 'Jonas2', id: 'pabcdefabcdef1234' }), 'Jonas', 'ID-en vinner over navnet');
  assert.equal(matchStudent(list, { name: 'Sara' }), null, 'et annet navn: læreren velger');
  assert.equal(matchStudent(list, { name: 'Jonas', id: 'pzzzzzzzzzzzzzzzz' }), null, 'samme navn, men en annen elev (ny ID)');
  assert.equal(matchStudent(list, { name: 'Jonas' }), 'Jonas', 'eldre versjon uten ID');
  assert.equal(matchStudent(list, { name: '' }), null);
});

test('pakken har elevens ID og teori, men bare fra eleven (0.18.3)', () => {
  const pkg = buildPackage({ from: { role: 'elev', name: 'Emma', id: 'pabcdefabcdef1234' }, messages: [{ id: 'm1', from: 'elev', text: 'Hei', at: '2026-11-14T10:00:00+01:00' }], theory: { taken: 3 } });
  const p = readPackage(JSON.parse(JSON.stringify(pkg)));
  assert.equal(p.from.id, 'pabcdefabcdef1234');
  assert.deepEqual(p.theory, { taken: 3 });
  assert.equal(p.messages[0].at, '2026-11-14T09:00:00.000Z', 'tiden lagres som UTC, så samtalen sorteres riktig');
  const bad = readPackage({ ...pkg, from: { role: 'elev', name: 'X', id: '<script>' } });
  assert.equal(bad.from.id, '', 'ugyldig ID tas ikke med');
  assert.equal(readPackage({ ...pkg, from: { role: 'laerer', name: 'Kari' } }).theory, null, 'teori fra læreren brukes ikke');
});

test('«Venter på svar» når siste melding er fra eleven (0.18.3)', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  const ov = studentOverview([], [{ name: 'Emma' }, { name: 'Jonas' }], {
    Emma: [{ id: 'a', from: 'elev', at: '2026-11-13T10:00:00Z', read: true }],
    Jonas: [{ id: 'b', from: 'elev', at: '2026-11-13T10:00:00Z', read: true }, { id: 'c', from: 'laerer', at: '2026-11-13T11:00:00Z' }] }, now);
  const emma = ov.find(x => x.name === 'Emma'), jonas = ov.find(x => x.name === 'Jonas');
  assert.ok(emma.awaiting && emma.flags.some(f => f.id === 'reply'));
  assert.ok(!jonas.awaiting, 'læreren har svart');
  assert.ok(emma.need > jonas.need);
});

test('analyse fra en fil gjøres trygg før den lagres (0.18.3)', () => {
  const r = cleanResult({ points: [{ t: 0, lat: 63.4, lon: 10.4 }, { t: 1, lat: 63.401, lon: 10.4 }, { t: 'x' }],
    events: [{ n: '1"><img src=x onerror=alert(1)>', kind: 'brake" onclick="x', t: 5 }, null], overall: 250 });
  assert.equal(r.points.length, 2, 'ødelagte punkter fjernes');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].n, 1, 'hendelsesnummeret er et tall');
  assert.equal(r.events[0].kind, 'brake', 'ukjent type blir brå bremsing');
  assert.equal(r.overall, 100);
  assert.deepEqual(Object.keys(r.scores), ['brake', 'accel', 'turn', 'smooth']);
  assert.equal(cleanResult({ points: [{ t: 0, lat: 1, lon: 1 }] }), null, 'for lite data');
  assert.equal(cleanResult(null), null);
});
