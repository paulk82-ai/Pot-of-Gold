// Read-only check of the open months: each round's settings and what the cards hold. Prints no names or emails
// (the repository is public, so its Actions logs are too). Changes nothing.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
setTimeout(() => { console.log('Gave up after 4 minutes.'); process.exit(1); }, 4 * 60 * 1000).unref();
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'); if (!sa.project_id) { console.log('No secret'); process.exit(0); }
initializeApp({ credential: cert(sa) }); const db = getFirestore();
const comps = await db.collection('comps').get();
const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : v;
for (const cs of comps.docs) {
  const c = cs.data(); if (c.test) continue;
  console.log(`\n=== ${cs.id} "${c.name}" status=${c.status} format=${c.format} tee=${c.tee} holes=${JSON.stringify(c.holes)} best=${c.best} allowance=${c.allowance} rankBy=${c.rankBy} points=${c.pointsSystem} fee=${c.fee} date=${c.date} payDeadline=${c.payDeadline} updated=${c.updatedAt || ''}`);
  (c.rounds || []).forEach(r => console.log(`  round n=${r.n} ${r.from}..${r.to} format=${r.format} tee=${r.tee} holes=${JSON.stringify(r.holes)} allowance=${r.allowance} opens=${ms(r.opens)} closes=${ms(r.closes)} closedAt=${ms(r.closedAt) || ''}`));
  const cards = (await cs.ref.collection('cards').get()).docs.map(d => d.data());
  const by = {}; cards.forEach(k => { const n = String(k.round); (by[n] = by[n] || []).push(k); });
  Object.entries(by).forEach(([n, ks]) => {
    const keys = {}; ks.forEach(k => Object.keys(k.scores || {}).forEach(h => { keys[h] = (keys[h] || 0) + 1; }));
    const filled = ks.map(k => Object.values(k.scores || {}).filter(v => v === 'P' || (typeof v === 'number' && v > 0)).length);
    console.log(`  cards round ${n}: ${ks.length} cards; holes filled per card: ${filled.sort((a, b) => a - b).join(',')}; hole keys used: ${JSON.stringify(keys)}; shots set by hand: ${ks.filter(k => k.shots != null).length}`);
  });
  const ents = await cs.ref.collection('entries').count().get(); console.log(`  entries: ${ents.data().count}`);
}
process.exit(0);
