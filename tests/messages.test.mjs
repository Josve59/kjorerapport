import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage, readPackage, mergeThread, unread, markRead, unsent, refLabel, cleanMessage, packageName, studentOverview, sortStudents, filterStudents, isPackage } from '../js/messages.js';
import { forgetStudent, activeStudents, students } from '../js/modes.js';

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
  list.push({ name: 'Emma', email: 'emma@example.com' }, { name: 'Jonas' }, { name: 'Sara', archived: { at: '2026-11-01', reason: 'lappen' } });
  const drives = [drive('e1', 'Emma', 1, 60), drive('e2', 'Emma', 3, 62), drive('j1', 'Jonas', 20, 90), ...list.slice(0, 50).map((s, i) => drive('x' + i, s.name, i % 7, 85))];
  const threads = { Jonas: [{ id: 'q', from: 'elev', at: '2026-11-13T10:00:00Z', text: 'Spørsmål' }] };
  const ov = studentOverview(drives, list, threads, now);
  const emma = ov.find(x => x.name === 'Emma'), jonas = ov.find(x => x.name === 'Jonas');
  assert.equal(emma.avg, 61); assert.ok(emma.flags.some(f => f.id === 'score'));
  assert.equal(jonas.newMsgs, 1); assert.ok(jonas.flags.some(f => f.id === 'idle'), 'ikke kjørt på 20 dager');
  const sorted = sortStudents(ov.filter(x => !x.archived), 'need');
  assert.equal(sorted[0].name, 'Jonas', 'ny melding først'); assert.equal(sorted[1].name, 'Emma');
  assert.equal(sortStudents(ov, 'name')[0].name, 'Elev 00');
  assert.equal(filterStudents(ov, 'emm').length, 1);
  assert.equal(filterStudents(ov, 'E1@EX').length, 1, 'søk på e-post');
});

test('elev som har fått lappen: arkiv og sletting (0.18.0)', () => {
  const s = { students: [{ name: 'Emma' }, { name: 'Sara', archived: { at: '2026-11-01', reason: 'lappen' } }], activeStudent: 'Emma',
    lessons: { Emma: '2026-11-01', Sara: '2026-10-01' }, homework: { Emma: { focus: [] } }, messages: { Emma: [{ id: 'a' }] }, theory: { Emma: {} } };
  assert.deepEqual(activeStudents(s).map(x => x.name), ['Emma']);
  assert.equal(students(s).length, 2);
  const out = forgetStudent(s, 'Emma');
  assert.deepEqual(out.students.map(x => x.name), ['Sara']);
  assert.ok(!('Emma' in out.lessons) && !('Emma' in out.messages) && !('Emma' in out.homework) && !('Emma' in out.theory));
  assert.equal(out.lessons.Sara, '2026-10-01');
  assert.equal(out.activeStudent, '', 'ingen aktiv elev igjen (Sara er arkivert)');
});
