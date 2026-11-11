// Golfers' phone reminders for Pot of Gold, sent through Firebase Cloud Messaging.
// Run by .github/workflows/reminders.yml (GitHub Actions) a few times each evening; it works out the Irish time itself:
//   7pm (eve):   "Round N opens tomorrow", to everyone with reminders on. Golfers whose entry isn't paid are told
//                it's due by midnight (the payment deadline is the night before each round).
//   9pm (nudge): "Your card isn't finished", to anyone who started a card today that isn't complete, signed and sent.
// Each is sent once a day (pushLog/{date}_{kind} records it). Golfers turn reminders on in the app (Me page); their
// phone tokens and choices are in push/{uid}. Needs the FIREBASE_SERVICE_ACCOUNT secret (a Firebase service account key).
// MODE=test sends a test message to the organisers only.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const sa = (() => { try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'); } catch (_) { return {}; } })();
if (!sa.project_id) { console.log('No FIREBASE_SERVICE_ACCOUNT secret yet, so nothing was sent.'); process.exit(0); }
initializeApp({ credential: cert(sa) });
const db = getFirestore(); const fcm = getMessaging();
const APP = process.env.APP_URL || 'https://paulk82-ai.github.io/Pot-of-Gold/';
const TZ = 'Europe/Dublin';
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
const dayOf = d => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nice = iso => { const d = new Date(iso + 'T12:00:00Z'); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : Number(v) || 0;

const now = new Date(); const today = dayOf(now); const hour = Number(parts(now).hour);
const forced = String(process.env.MODE || '').trim();
const mode = forced || (hour === 19 || hour === 20 ? 'eve' : hour === 21 || hour === 22 ? 'nudge' : '');
if (!mode) { console.log(`It's ${hour}:00 in Ireland: no reminders due.`); process.exit(0); }
const logRef = db.doc(`pushLog/${today}_${mode}`);
if (mode !== 'test' && !forced && (await logRef.get()).exists) { console.log(`Already sent today's ${mode} reminders.`); process.exit(0); }

const [compsSnap, pushSnap, settingsSnap, adminsSnap] = await Promise.all([
  db.collection('comps').where('status', '==', 'open').get(), db.collection('push').get(), db.doc('config/settings').get(), db.doc('config/admins').get()]);
const settings = settingsSnap.exists ? settingsSnap.data() : {};
const admins = new Set(((adminsSnap.exists ? adminsSnap.data().emails : []) || []).map(e => String(e).toLowerCase()));
const fee = c => Number(c.fee ?? settings.fee ?? 10);
// One entry per golfer, all their phones together.
const byGolfer = new Map();
pushSnap.docs.forEach(d => { const x = d.data(); if (!x || !Array.isArray(x.tokens) || !x.tokens.length) return;
  const key = x.golferId || ('uid:' + d.id); const o = byGolfer.get(key) || { tokens: [], prefs: { eve: true, nudge: true }, refs: [], admin: false };
  x.tokens.forEach(t => { if (!o.tokens.includes(t)) o.tokens.push(t); }); Object.assign(o.prefs, x.prefs || {}); o.refs.push(d.ref);
  if (admins.has(String(x.email || '').toLowerCase())) o.admin = true; byGolfer.set(key, o); });

const out = [];
if (mode === 'test') {
  byGolfer.forEach((o, gid) => { if (o.admin) out.push({ gid, title: 'Pot of Gold test', body: 'Reminders are working on this phone.', tag: 'test' }); });
}
for (const cs of compsSnap.docs) {
  const c = cs.data(); if (c.test || mode === 'test') continue; const rounds = c.rounds || [];
  if (mode === 'eve') {
    const r = rounds.find(x => x.from === addDays(today, 1)); if (!r) continue;
    const E = new Map((await cs.ref.collection('entries').get()).docs.map(d => [d.id, d.data()]));
    byGolfer.forEach((o, gid) => { if (o.prefs.eve === false || gid.startsWith('uid:')) return; const e = E.get(gid);
      const unpaid = e && !e.paid && !e.claimed && !(e.letPlay && e.letPlay[String(r.n)]) && c.payDeadline !== false;
      const body = !e ? `${c.name}: round ${r.n} is on ${nice(r.from)}. Not entered yet? €${fee(c)} covers the month, and your best rounds count.`
        : unpaid ? `Your €${fee(c)} entry isn't paid. Pay by midnight tonight to play round ${r.n}, then tap I've paid in the app.`
        : `${c.name}: round ${r.n} is on ${nice(r.from)}. Tap Start my round before you tee off.`;
      out.push({ gid, title: unpaid ? `Round ${r.n} tomorrow: entry due tonight` : `Round ${r.n} opens tomorrow`, body, tag: `eve-${cs.id}-${r.n}` }); });
  }
  if (mode === 'nudge') {
    const r = rounds.find(x => x.from <= today && today <= (x.to || x.from)); if (!r) continue;
    const holes = (Array.isArray(r.holes) && r.holes.length ? r.holes : c.holes || []).length || 18;
    const photoReq = settings.photoRequired !== false;
    const cards = await cs.ref.collection('cards').where('round', '==', r.n).get();
    cards.docs.forEach(d => { const k = d.data(); const o = byGolfer.get(k.golferId); if (!o || o.prefs.nudge === false) return;
      if (!k.startedAt || dayOf(new Date(ms(k.startedAt))) !== today) return;           // started today
      if (k.deadline && ms(k.deadline) < now.getTime()) return;                         // already locked
      const filled = Object.values(k.scores || {}).filter(v => v === 'P' || (typeof v === 'number' && v > 0)).length;
      const marked = !!((k.signed === true || k.approved === true) && String(k.marker || '').trim());
      const sent = !photoReq || !!(k.photoAt || k.photoOk);
      if (filled >= holes && marked && sent) return;
      const what = filled < holes ? `${filled} of ${holes} holes are in` : !marked ? "Your marker isn't added or ticked yet" : "The photo of your card hasn't been sent yet";
      out.push({ gid: k.golferId, title: `Your round ${r.n} card isn't finished`, body: `${what}. Finish it and send it to the organiser before midnight, or it won't count.`, tag: `nudge-${cs.id}-${r.n}` }); });
  }
}

let sent = 0, failed = 0; const dead = new Set();
for (const m of out) {
  const o = byGolfer.get(m.gid); if (!o || !o.tokens.length) continue;
  const res = await fcm.sendEachForMulticast({ tokens: o.tokens, webpush: { headers: { Urgency: 'high', TTL: '7200' }, data: { title: m.title, body: m.body, tag: m.tag, url: APP }, fcmOptions: { link: APP } } });
  res.responses.forEach((x, i) => { if (x.success) sent++; else { failed++; const code = x.error && x.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') dead.add(o.tokens[i]); } });
}
// Phones that have uninstalled the app or turned notifications off: tidy their tokens away.
if (dead.size) await Promise.all(pushSnap.docs.filter(d => (d.data().tokens || []).some(t => dead.has(t))).map(d => d.ref.update({ tokens: FieldValue.arrayRemove(...[...dead].filter(t => (d.data().tokens || []).includes(t))) })));
if (mode !== 'test') await logRef.set({ at: Date.now(), mode, messages: out.length, sent, failed });
console.log(`${mode}: ${out.length} reminder${out.length === 1 ? '' : 's'}, ${sent} delivered to phones, ${failed} failed, ${dead.size} old token${dead.size === 1 ? '' : 's'} removed.`);
