// One-off repair (20 Nov 2026): Rounds of the November month (1 and 2, then 3) were saved on holes 1–14 by mistake; the month
// plays 1–13 and 18. Puts each back to the month's holes, only if it is still on exactly 1–14. Touches nothing else.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
setTimeout(() => { console.log('Gave up after 4 minutes.'); process.exit(1); }, 4 * 60 * 1000).unref();
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }); const db = getFirestore();
const ref = db.doc('comps/DszDl0w6ZcZHXcvS8nbD'); const W = [1,2,3,4,5,6,7,8,9,10,11,12,13,14].join();
await db.runTransaction(async tx => {
  const c = (await tx.get(ref)).data(); const rounds = (c.rounds || []).map(r => Object.assign({}, r)); let n = 0;
  rounds.forEach(r => { if (Array.isArray(r.holes) && r.holes.join() === W) { r.holes = null; n++; console.log(`Round ${r.n}: holes 1–14 -> ${c.holes.join(',')}`); } });
  if (n) tx.update(ref, { rounds }); else console.log('Nothing to change.');
});
process.exit(0);
