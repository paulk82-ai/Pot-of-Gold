// Pot of Gold — installable monthly golf competition app (played at Rathsallagh).
// Data lives in Firebase (or in this browser in sample mode). See README.md for setup.
'use strict';

const CFG = window.RGC_CONFIG || {};
const PARAMS = new URLSearchParams(location.search);
const CONFIGURED = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId);
const SAMPLE = PARAMS.has('sample');

/* ---------- Course & rules ---------- */
const COURSE = {
  parM:[5,4,4,3,4,5,3,4,4, 4,5,4,3,4,4,5,3,4],
  siM:[13,2,15,11,9,6,17,4,7, 1,10,12,18,14,8,5,16,3],
  parL:[5,4,4,3,4,5,3,4,4, 5,5,4,3,4,4,5,3,4],
  siL:[15,1,13,11,9,5,17,7,3, 10,4,14,12,18,8,6,16,2]
};
// Men's tees. Ladies always play off the red tees with the ladies' rating (RED below).
const TEES = { white:{name:'White', cr:70.3, slope:125, par:72}, blue:{name:'Blue', cr:71.7, slope:127, par:72}, black:{name:'Black', cr:74.0, slope:132, par:72}, red:{name:'Red', cr:69.9, slope:120, par:72} };
const RED = {name:'Red', cr:72.2, slope:122, par:73};
const FORMATS = {
  stableford:{name:'Stableford', short:'Stableford', better:'high'},
  medal:{name:'Stroke play (nett)', short:'Medal', better:'low'},
  gross:{name:'Stroke play (gross)', short:'Gross', better:'low'},
  parbogey:{name:'v Par', short:'v Par', better:'high'}
};
const DEFAULTS = { fee:10, revtag:'paul3d7qv', points:[5,4,3,2], entryPoint:1, prize:[60,40], allowance:95, tee:'white', rounds:4, best:3, bands:[10,20], cutWin:[1,2,3], cutRun:[0.5,1,1.5], riseBy:0.5, riseAfter:2, hcpMax:54 };
// Entries are paid through Revolut only: in the Revolut app, or by debit card on the Revolut payment page.
const METHODS = {revolut:'Revolut', card:'Card (Revolut)'};

/* ---------- State ---------- */
let be = null;
const D = { golfers:{}, comps:{}, entries:{}, cards:{}, members:{}, requests:{}, settings:null, admins:undefined, adminCode:undefined, member:undefined, myReq:undefined };
const S = {
  phase:'boot', user:null, myGid:null, isAdmin:false, view:'home', compId:null, compTab:'entries', boardSel:'month',
  card:null, activeHole:null, playerId:null, season:String(new Date().getFullYear()), sheet:null, loaded:{},
  adminHash:null, pin:null, changing:false, golferTab:'list', hcpSynced:false, leagueTab:'month', leagueMonth:null, pinRemember:true, courseOpen:false, adminRole:false, golferMode:false, installEvt:null, signinMode:'signin', busy:false
};
let MEMO = {}, CONFIRM_FN = null, unsubs = [], SCAN_CTL = null, SCAN_PENDING = null, PHOTO_PENDING = null;
const cardTimers = {};

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const range = (a,b) => Array.from({length:Math.max(0, b-a+1)}, (_,i)=>a+i);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON3 = MONTHS.map(m=>m.slice(0,3));
const DOW3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const byName = (a,b) => String(a.name).localeCompare(String(b.name));
function euro(n){ const v = Math.round((Number(n)||0)*100)/100; return '€' + (Number.isInteger(v) ? v : v.toFixed(2)); }
function parseDate(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s||''); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
function dParts(s){ const d = parseDate(s); return d ? {dow:DOW3[d.getDay()], day:d.getDate(), mon:MON3[d.getMonth()], month:MONTHS[d.getMonth()], year:d.getFullYear()} : {dow:'', day:'–', mon:'', month:'', year:''}; }
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(s, n){ const d = parseDate(s); d.setDate(d.getDate() + n); return iso(d); }
function ord(n){ const s=['th','st','nd','rd'], v=n%100; return n + (s[(v-20)%10] || s[v] || s[0]); }
function fmtHi(hi){ if (hi === null || hi === undefined || hi === '' || !isFinite(hi)) return '–'; const v = Number(hi); return v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1); }
function parseHi(v){ v = String(v == null ? '' : v).trim().replace(',', '.'); if (!v) return null; let neg = false; if (v[0] === '+') { neg = true; v = v.slice(1); } const n = parseFloat(v); if (!isFinite(n)) return null; return neg ? -n : n; }
function num(v, d){ const n = parseFloat(v); return isFinite(n) ? n : d; }
function toPar(n){ return n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n); }
function pbStr(n){ return n === 0 ? 'Level' : n > 0 ? '+' + n : '−' + Math.abs(n); }
function toParDec(v){ const r = Math.round(v*100)/100; return r === 0 ? 'E' : (r > 0 ? '+' : '−') + Math.abs(r).toFixed(2); }
function firstName(name){ return String(name || '').trim().split(/\s+/)[0] || ''; }
function initials(name){ return String(name||'?').split(/\s+/).map(w => w.replace(/[^\p{L}]/gu, '')).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || '?'; }
function normEmail(e){ return String(e || '').trim().toLowerCase(); }
function newId(){ return be ? be.newId() : Math.random().toString(36).slice(2, 12); }
function cfg(){
  const s = D.settings || {}; const c = s.course || {};
  const okArr = (a, d) => Array.isArray(a) && a.length === 18 && a.every(x => isFinite(x)) ? a.map(Number) : d;
  return Object.assign({}, DEFAULTS, s, {
    revtag: s.revtag || DEFAULTS.revtag,
    bands: Array.isArray(s.bands) && s.bands.length === 2 && s.bands.every(x => isFinite(x)) && Number(s.bands[0]) < Number(s.bands[1]) ? s.bands.map(Number) : DEFAULTS.bands,
    cutWin: Array.isArray(s.cutWin) && s.cutWin.length === 3 && s.cutWin.every(x => isFinite(x)) ? s.cutWin.map(Number) : DEFAULTS.cutWin,
    cutRun: Array.isArray(s.cutRun) && s.cutRun.length === 3 && s.cutRun.every(x => isFinite(x)) ? s.cutRun.map(Number) : DEFAULTS.cutRun,
    points: Array.isArray(s.points) && s.points.length ? s.points.map(Number) : DEFAULTS.points,
    prize: Array.isArray(s.prize) && s.prize.length ? s.prize.map(Number) : DEFAULTS.prize,
    entryPoint: isFinite(s.entryPoint) ? Number(s.entryPoint) : DEFAULTS.entryPoint,
    course: { parM: okArr(c.parM, COURSE.parM), siM: okArr(c.siM, COURSE.siM), parL: okArr(c.parL, COURSE.parL), siL: okArr(c.siL, COURSE.siL) }
  });
}
function gName(gid){ const g = D.golfers[gid]; return g ? g.name : 'Unknown golfer'; }
function sortedGolfers(){ return Object.values(D.golfers).sort(byName); }
function inSeason(c, season){ return season === 'all' || String(c.date||'').slice(0,4) === season; }
function seasonList(){ const ys = new Set(Object.values(D.comps).map(c => String(c.date||'').slice(0,4)).filter(Boolean)); ys.add(String(new Date().getFullYear())); return [...ys].sort().reverse(); }

/* ---------- Rounds (weekends, Friday to Sunday) ---------- */
function compRounds(c){ return Array.isArray(c.rounds) && c.rounds.length ? c.rounds : [{n:1, from:c.date, to:c.date}]; }
function compBest(c){ const n = compRounds(c).length; return Math.min(n, Math.max(1, Number(c.best) || n)); }
// A round's own settings: format, tees, holes and allowance, falling back to the month's.
function rcfg(c, n){
  const r = compRounds(c).find(x => x.n === n) || {};
  const allow = r.allowance !== null && r.allowance !== undefined && r.allowance !== '' && isFinite(r.allowance) ? Number(r.allowance) : (isFinite(c.allowance) ? Number(c.allowance) : 95);
  return {id:c.id, n, name:c.name, status:c.status, format: r.format || c.format || 'stableford', tee: r.tee || c.tee || 'white', holes: Array.isArray(r.holes) && r.holes.length ? r.holes : (c.holes || range(1,18)), allowance: allow};
}
function roundsVary(c){ const rs = compRounds(c).map(r => rcfg(c, r.n)); const a = rs[0]; return rs.some(x => x.format !== a.format || x.tee !== a.tee || x.holes.join() !== a.holes.join() || x.allowance !== a.allowance); }
// Same format and number of holes every round: the month adds up that format. Otherwise it adds up Stableford points.
function monthMode(c){ const rs = compRounds(c).map(r => rcfg(c, r.n)); const f = rs[0].format, n = rs[0].holes.length; return rs.every(x => x.format === f && x.holes.length === n) ? {mixed:false, format:f} : {mixed:true, format:'stableford'}; }
function unitFor(format){ return format === 'stableford' ? 'pts' : format === 'medal' ? 'nett' : format === 'gross' ? 'gross' : ''; }
function firstFriday(y, m){ const d = new Date(y, m, 1); d.setDate(1 + ((5 - d.getDay() + 7) % 7)); return d; }
function defaultFirstFri(){ const now = new Date(); let f = firstFriday(now.getFullYear(), now.getMonth()); if (iso(f) < iso(now) && addDays(iso(f), 2) < iso(now)) f = firstFriday(now.getFullYear(), now.getMonth() + 1); return iso(f); }
function weekendRounds(firstFri, count){ return range(1, count).map(i => { const from = addDays(firstFri, 7*(i-1)); return {n:i, from, to:addDays(from, 2)}; }); }
function roundState(r){ const t = iso(new Date()); return t < r.from ? 'upcoming' : t > r.to ? 'played' : 'open'; }
function roundOpenNow(c, n){ const r = compRounds(c).find(x => x.n === n); return !!r && roundState(r) === 'open'; }
function currentRound(c){ const rs = compRounds(c); const o = rs.find(r => roundState(r) === 'open'); if (o) return o.n; const p = rs.filter(r => roundState(r) === 'played'); return p.length ? p[p.length-1].n : rs[0].n; }
function roundLabel(r){ const a = dParts(r.from), b = dParts(r.to); if (r.from === r.to) return `${a.dow} ${a.day} ${a.mon}`; return `${a.dow} ${a.day}${a.mon !== b.mon ? ' ' + a.mon : ''} – ${b.dow} ${b.day} ${b.mon}`; }
function shortRange(r){ const a = dParts(r.from), b = dParts(r.to); return a.mon === b.mon ? `${a.day}–${b.day} ${a.mon}` : `${a.day} ${a.mon}–${b.day} ${b.mon}`; }

/* ---------- Data access ---------- */
function entriesFor(cid){ return Object.values(D.entries).filter(e => e.compId === cid && D.golfers[e.golferId]); }
function entryOf(cid, gid){ return D.entries[cid + '/' + gid] || null; }
function cardOf(cid, round, gid){ return D.cards[`${cid}/${round}_${gid}`] || null; }
function compFee(c){ return Number(c && c.fee != null ? c.fee : cfg().fee) || 0; }
function revUrl(){ return 'https://revolut.me/' + encodeURIComponent(cfg().revtag); }
function payRef(c, g){ return `${dParts(c.date).mon} comp - ${g ? g.name : ''}`; }
function shortDay(ms){ const d = new Date(ms); return isFinite(d) ? `${DOW3[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}` : ''; }
function payState(e){ return !e ? 'none' : e.paid ? 'paid' : e.claimed ? 'claimed' : 'unpaid'; }
function claimText(e){ return `Says paid${e.claimMethod && METHODS[e.claimMethod] ? ' by ' + METHODS[e.claimMethod] : ''}${e.claimedAt ? ' · ' + shortDay(e.claimedAt) : ''}`; }

/* ---------- Handicaps & scoring ---------- */
function parsFor(g){ const c = cfg().course; const L = g && g.gender === 'L'; return {par: L ? c.parL : c.parM, si: L ? c.siL : c.siM}; }
function defaultShots(g, comp, hi){
  hi = hi === undefined ? snapHcp(g) : hi;
  if (!g || hi === null || hi === '' || !isFinite(hi)) return 0;
  const t = g.gender === 'L' ? RED : (TEES[comp.tee] || TEES.white);
  const ch = Number(hi) * t.slope / 113 + (t.cr - t.par);
  const ph = ch * (isFinite(comp.allowance) ? Number(comp.allowance) : 95) / 100;
  return Math.round(ph * (comp.holes || []).length / 18);
}
function cardHi(card, g){ return card && card.hi !== null && card.hi !== undefined && isFinite(card.hi) ? Number(card.hi) : snapHcp(g); }
function cardShots(card, comp, g){ return card && card.shots !== null && card.shots !== undefined && card.shots !== '' && isFinite(card.shots) ? Number(card.shots) : defaultShots(g, comp, cardHi(card, g)); }
function allocShots(holes, si, total){
  const res = {}; holes.forEach(h => res[h] = 0);
  const n = holes.length; if (!n || !total) return res;
  const ranked = [...holes].sort((a,b) => si[a-1] - si[b-1]);
  const t = Math.abs(total), base = Math.floor(t/n), extra = t % n, sign = total > 0 ? 1 : -1;
  (sign > 0 ? ranked : ranked.slice().reverse()).forEach((h,i) => { res[h] = sign * (base + (i < extra ? 1 : 0)); });
  return res;
}
// A card counts once it's complete and the paper card is signed by a marker (anyone).
// The player adds the marker's name and ticks that it's signed. Older cards used markerId/approved.
function markerName(card){ return card ? String(card.marker || (card.markerId ? gName(card.markerId) : '') || '').trim() : ''; }
function isSigned(card){ return !!card && (card.signed === true || card.approved === true); }
function markedOK(card){ return isSigned(card) && !!markerName(card); }
function signText(card){
  const m = markerName(card);
  if (markedOK(card)) return `Signed by ${m}`;
  if (m) return `Marker ${m} · not ticked as signed yet`;
  return isSigned(card) ? "Add your marker's name" : 'Not signed by a marker yet';
}
// Golfers tap "Start my round" before teeing off. The card must then be entered and ticked as signed
// by midnight that day; after that it locks and can't be changed (the organiser can still fix or delete it).
function msOf(t){ return typeof t === 'number' ? t : t && typeof t.toMillis === 'function' ? t.toMillis() : t && isFinite(t.seconds) ? t.seconds * 1000 : null; }
function endOfDay(ms){ const d = new Date(ms); d.setHours(24, 0, 0, 0); return d.getTime(); }
function roundCloses(c, n){ const r = compRounds(c).find(x => x.n === n); if (!r) return Infinity; const m = msOf(r.closes); return m != null ? m : parseDate(addDays(r.to, 1)).getTime(); }
function cardStarted(card){ return !!(card && card.startedAt); }
function cardLocked(card){ return !!(card && card.deadline && Date.now() >= card.deadline); }
function whenText(ms){ const d = new Date(ms); return `${DOW3[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function deadlineText(card){ if (!card || !card.deadline) return ''; const d = new Date(card.deadline - 1); const today = iso(new Date()) === iso(d); return today ? 'midnight tonight' : `midnight ${DOW3[d.getDay()]}`; }
// The fields a card keeps when it's saved (older cards are converted to the new fields).
function cardBase(cid, round, gid){
  const prev = cardOf(cid, round, gid) || {}; const g = D.golfers[gid];
  const out = {compId:cid, golferId:gid, round, marker: markerName(prev), signed: isSigned(prev), scores: Object.assign({}, prev.scores || {}), hi: prev.hi != null ? prev.hi : snapHcp(g), shots: prev.shots != null ? prev.shots : null};
  if (prev.scanned) out.scanned = true;
  if (prev.startedAt) { out.startedAt = prev.startedAt; out.deadline = prev.deadline; }
  return out;
}
function scoreCard(comp, round, gid){
  const g = D.golfers[gid]; const card = cardOf(comp.id, round, gid);
  const rc = rcfg(comp, round);
  const {par, si} = parsFor(g); const holes = rc.holes;
  const total = cardShots(card, rc, g); const alloc = allocShots(holes, si, total);
  const scores = (card && card.scores) || {};
  let gross = 0, runNett = 0, runPar = 0, pts = 0, pb = 0, filled = 0, pickups = 0, parSum = 0;
  const rows = holes.map(h => {
    const p = par[h-1], s = si[h-1], sh = alloc[h], v = scores[h];
    const r = {h, par:p, si:s, shots:sh, g:v, nett:null, pts:null, pb:null};
    parSum += p;
    if (v === 'P') { filled++; pickups++; r.pts = 0; r.pb = -1; }
    else if (typeof v === 'number' && v > 0) { filled++; gross += v; runPar += p; r.nett = v - sh; runNett += r.nett; r.pts = Math.max(0, 2 + p - r.nett); r.pb = r.nett < p ? 1 : r.nett === p ? 0 : -1; }
    if (r.pts != null) pts += r.pts; if (r.pb != null) pb += r.pb;
    return r;
  });
  const complete = holes.length > 0 && filled === holes.length;
  const stroke = rc.format === 'medal' || rc.format === 'gross';
  const marked = markedOK(card);
  const nr = stroke && pickups > 0;
  return {comp, rc, round, gid, golfer:g, card, rows, total, gross, runNett, runPar, pts, pb, filled, complete, nr, pickups, parSum, marked, valid: complete && !nr && marked};
}
function metric(comp, rows){
  switch (comp.format) {
    case 'parbogey': return rows.reduce((a,r) => a + (r.pb || 0), 0);
    case 'medal': return rows.reduce((a,r) => a + (r.nett == null ? 99 : r.nett), 0);
    case 'gross': return rows.reduce((a,r) => a + (typeof r.g === 'number' ? r.g : 99), 0);
    default: return rows.reduce((a,r) => a + (r.pts || 0), 0);
  }
}
const higher = c => (FORMATS[c.format] || FORMATS.stableford).better === 'high';
function cbSegments(n){ return [Math.ceil(n/2), Math.round(n/3), Math.round(n/6), 1].filter(k => k > 0); }
function cbKeys(comp, sc){ return [metric(comp, sc.rows)].concat(cbSegments(sc.rows.length).map(n => metric(comp, sc.rows.slice(-n)))); }
function cardStatus(sc){ const c = sc.card; const late = cardLocked(c);
  if (!c || (!sc.filled && !cardStarted(c))) return 'No card';
  if (!sc.filled) return late ? 'Missed: nothing entered by midnight' : `Started ${whenText(c.startedAt)}`;
  if (!sc.complete) return (late ? 'Missed: ' : '') + 'Thru ' + sc.filled; if (sc.nr) return 'NR';
  if (!sc.marked) return late ? 'Missed: not signed by midnight' : 'Not signed'; return ''; }
function cardValueText(sc){
  const c = sc.rc;
  if (c.format === 'medal') return String(sc.runNett);
  if (c.format === 'gross') return String(sc.gross);
  if (c.format === 'parbogey') return pbStr(sc.pb);
  return String(sc.pts);
}
function roundBoard(comp, n){
  const key = `rb:${comp.id}:${n}`; if (MEMO[key]) return MEMO[key];
  const rc = rcfg(comp, n); const hi = higher(rc);
  const all = entriesFor(comp.id).map(e => scoreCard(comp, n, e.golferId));
  const ranked = all.filter(sc => sc.valid);
  ranked.forEach(sc => sc.keys = cbKeys(rc, sc));
  const cmp = (a,b) => { for (let i = 0; i < a.keys.length; i++) { const d = b.keys[i] - a.keys[i]; if (d) return hi ? d : -d; } return 0; };
  ranked.sort((a,b) => cmp(a,b) || byName(a.golfer, b.golfer));
  let pos = 0; ranked.forEach((sc,i) => { if (i === 0 || cmp(ranked[i-1], sc) !== 0) pos = i + 1; sc.pos = pos; });
  ranked.forEach((sc,i) => { const p = ranked[i-1], q = ranked[i+1]; sc.tied = (p && p.pos === sc.pos) || (q && q.pos === sc.pos); sc.onCb = !sc.tied && ((p && p.keys[0] === sc.keys[0]) || (q && q.keys[0] === sc.keys[0])); });
  const rest = all.filter(sc => !sc.valid).sort((a,b) => b.filled - a.filled || byName(a.golfer, b.golfer));
  return (MEMO[key] = {ranked, rest});
}
function leaderboard(comp){
  const key = 'lb:' + comp.id; if (MEMO[key]) return MEMO[key];
  const k = cfg(); const rs = compRounds(comp); const best = compBest(comp); const mm = monthMode(comp); const mf = {format: mm.format}; const hi = higher(mf); const final = comp.status === 'final';
  const rows = entriesFor(comp.id).map(e => {
    const cards = rs.map(r => scoreCard(comp, r.n, e.golferId));
    // Mixed formats: a complete, marked card counts in Stableford points even if it was a no return in its own round.
    const ok = sc => mm.mixed ? (sc.complete && sc.marked) : sc.valid;
    cards.forEach(sc => { sc.counts = ok(sc); });
    const valid = cards.filter(ok).map(sc => ({sc, v: metric(mf, sc.rows)}));
    valid.sort((a,b) => hi ? b.v - a.v : a.v - b.v);
    const counted = valid.slice(0, best);
    const countedNs = new Set(counted.map(x => x.sc.round));
    const total = counted.reduce((a,x) => a + x.v, 0);
    const last = counted.slice().sort((a,b) => b.sc.round - a.sc.round)[0];
    return {entry:e, gid:e.golferId, golfer:D.golfers[e.golferId], cards, counted, countedNs, count:counted.length, total, keys: last ? cbKeys(mf, last.sc) : [], parSum: counted.reduce((a,x) => a + x.sc.runPar, 0), started: cards.some(c => c.filled > 0)};
  });
  const ranked = rows.filter(r => r.count > 0);
  const cmp = (a,b) => { if (b.count !== a.count) return b.count - a.count; if (a.total !== b.total) return hi ? b.total - a.total : a.total - b.total; for (let i = 0; i < Math.min(a.keys.length, b.keys.length); i++) { const d = b.keys[i] - a.keys[i]; if (d) return hi ? d : -d; } return 0; };
  ranked.sort((a,b) => cmp(a,b) || byName(a.golfer, b.golfer));
  let pos = 0; ranked.forEach((r,i) => { if (i === 0 || cmp(ranked[i-1], r) !== 0) pos = i + 1; r.pos = pos; });
  ranked.forEach((r,i) => { const p = ranked[i-1], q = ranked[i+1]; r.tied = (p && p.pos === r.pos) || (q && q.pos === r.pos); r.onCb = !r.tied && ((p && p.count === r.count && p.total === r.total) || (q && q.count === r.count && q.total === r.total)); });
  const rest = rows.filter(r => r.count === 0).sort((a,b) => byName(a.golfer, b.golfer));
  rest.forEach(r => r.status = final ? 'No counting cards' : r.started ? 'Cards in progress' : 'No cards yet');
  rows.forEach(r => { r.points = k.entryPoint; r.prize = 0; });
  ranked.forEach(r => { if (r.pos <= k.points.length) r.points = Math.max(k.points[r.pos-1], k.entryPoint); });
  const st = compStats(comp);
  for (let i = 0; i < ranked.length;) { const p = ranked[i].pos; const grp = ranked.filter(r => r.pos === p); const cov = st.prizes.slice(p-1, p-1+grp.length).reduce((a,b) => a+b, 0); grp.forEach(r => r.prize = cov / grp.length); i += grp.length; }
  return (MEMO[key] = {ranked, rest, all: ranked.concat(rest), stats: st, best, rounds: rs, mode: mm});
}
function monthText(r, comp){
  if (!r.count) return '–';
  if (monthMode(comp).format === 'parbogey') return pbStr(r.total);
  return String(r.total);
}
function monthUnit(comp){ return unitFor(monthMode(comp).format); }
function compStats(c){
  const es = entriesFor(c.id); const k = cfg();
  const fee = Number(c.fee != null ? c.fee : k.fee) || 0;
  const paid = es.filter(e => e.paid).length; const pot = paid * fee;
  return {entries: es.length, paid, pot, fee, prizes: k.prize.map(p => pot * (Number(p)||0) / 100)};
}
function league(season){
  const key = 'lg:' + season; if (MEMO[key]) return MEMO[key];
  const rows = {};
  Object.values(D.comps).filter(c => c.status === 'final' && inSeason(c, season)).forEach(comp => {
    leaderboard(comp).all.forEach(r => {
      const o = rows[r.gid] || (rows[r.gid] = {id:r.gid, pts:0, played:0, wins:0, seconds:0, top4:0, won:0});
      o.played++; o.pts += r.points; o.won += r.prize || 0;
      if (r.pos === 1) o.wins++; if (r.pos === 2) o.seconds++; if (r.pos && r.pos <= 4) o.top4++;
    });
  });
  const list = Object.values(rows).filter(r => D.golfers[r.id]);
  const c2 = (a,b) => b.pts - a.pts || b.wins - a.wins || b.seconds - a.seconds;
  list.sort((a,b) => c2(a,b) || byName(D.golfers[a.id], D.golfers[b.id]));
  let pos = 0; list.forEach((r,i) => { if (i === 0 || c2(list[i-1], r) !== 0) pos = i + 1; r.pos = pos; });
  return (MEMO[key] = list);
}
function playerStats(gid, season){
  const out = {counts:{eagle:0, birdie:0, par:0, bogey:0, double:0, pickup:0}, holes:0, byPar:{3:[],4:[],5:[]}, perHole:{}, months:[], bests:{}, cards:0};
  Object.values(D.comps).filter(c => inSeason(c, season)).sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).forEach(c => {
    if (!entryOf(c.id, gid)) return;
    const lb = leaderboard(c); const row = lb.all.find(r => r.gid === gid);
    compRounds(c).forEach(r => {
      const sc = scoreCard(c, r.n, gid); if (!sc.filled) return;
      out.cards++;
      sc.rows.forEach(x => {
        if (x.g === 'P') { out.counts.pickup++; out.holes++; return; }
        if (typeof x.g !== 'number') return;
        out.holes++; const d = x.g - x.par;
        out.counts[d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double']++;
        (out.byPar[x.par] || (out.byPar[x.par] = [])).push(x.g);
        (out.perHole[x.h] || (out.perHole[x.h] = [])).push(d);
      });
      if (sc.complete) {
        const n = sc.rows.length; const b = out.bests[n] || (out.bests[n] = {pts:null, gross:null, nett:null});
        if (b.pts === null || sc.pts > b.pts) b.pts = sc.pts;
        if (!sc.pickups) { if (b.gross === null || sc.gross < b.gross) b.gross = sc.gross; if (b.nett === null || sc.runNett < b.nett) b.nett = sc.runNett; }
      }
    });
    if (row) out.months.push({comp:c, row, tied: row.pos ? lb.ranked.filter(x => x.pos === row.pos).length > 1 : false});
  });
  const avgs = Object.entries(out.perHole).filter(([,a]) => a.length >= 2).map(([h,a]) => ({h:+h, avg:a.reduce((x,y)=>x+y,0)/a.length, n:a.length})).sort((a,b) => a.avg - b.avg || a.h - b.h);
  out.bestHole = avgs[0] || null; out.worstHole = avgs.length > 1 ? avgs[avgs.length-1] : null;
  return out;
}

/* ---------- Competition handicaps: winner cut, runner-up cut, rise after months without a cut ---------- */
const r1 = x => Math.round(x * 10) / 10;
// Cuts depend on the golfer's handicap at the time: lower handicaps are cut less.
function hcpRules(){ const k = cfg(); return {bands: k.bands, win: k.cutWin, second: k.cutRun, rise: num(k.riseBy, 0.5), after: Math.max(1, Math.round(num(k.riseAfter, 2))), max: num(k.hcpMax, 54)}; }
function bandOf(R, hcp){ return hcp < R.bands[0] ? 0 : hcp < R.bands[1] ? 1 : 2; }
function bandLabels(R){ const f = x => String(x).replace(/\.0$/, ''); return [`Under ${f(R.bands[0])}`, `${f(R.bands[0])} to ${f(r1(R.bands[1] - 0.1))}`, `${f(R.bands[1])} and over`]; }
function fmtChange(x){ return (x > 0 ? '+' : '−') + Math.abs(x).toFixed(1).replace(/\.0$/, ''); }
// Worked out fresh from every finalised month, oldest first, so reopening or editing a month corrects itself.
function hcpLedger(){
  if (MEMO.ledger) return MEMO.ledger;
  const R = hcpRules(); const L = {};
  Object.values(D.golfers).forEach(g => { const b = g.hi === null || g.hi === undefined || g.hi === '' || !isFinite(g.hi) ? null : Number(g.hi); L[g.id] = {base:b, current:b, events:[], streak:0, played:0}; });
  Object.values(D.comps).filter(c => c.status === 'final').sort((a,b) => String(a.date||'').localeCompare(String(b.date||''))).forEach(c => {
    leaderboard(c).all.forEach(r => {
      const l = L[r.gid]; if (!l || l.base === null) return;
      l.played++; let change = 0, reason = '';
      const band = bandOf(R, l.current);
      if (r.pos === 1) { change = -R.win[band]; reason = `Won ${c.name}`; l.streak = 0; }
      else if (r.pos === 2) { change = -R.second[band]; reason = `Runner-up in ${c.name}`; l.streak = 0; }
      else { l.streak++; if (l.streak >= R.after) { change = R.rise; reason = `No cut in ${R.after} months (to ${c.name})`; l.streak = 0; } }
      if (change) { const before = l.current; l.current = r1(Math.min(R.max, before + change)); const real = r1(l.current - before); if (real) l.events.push({compId:c.id, date:c.date, name:c.name, change:real, reason, before, after:l.current}); }
    });
  });
  Object.values(L).forEach(l => { l.toRise = R.after - l.streak; });
  return (MEMO.ledger = L);
}
function curHcp(gid){ const l = hcpLedger()[gid]; return l ? l.current : null; }
// The handicap a new card is played off (kept on the golfer record so the security rules can check it).
function snapHcp(g){ return g ? (g.hcp !== undefined && g.hcp !== null ? g.hcp : (g.hi !== undefined ? g.hi : null)) : null; }
function riseText(gid, short){
  const l = hcpLedger()[gid]; const R = hcpRules(); if (!l || l.base === null) return '';
  const n = l.toRise; const open = Object.values(D.comps).filter(c => c.status !== 'final').sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  if (short) return n === 1 ? `+${R.rise} next month` : `+${R.rise} in ${n} months`;
  const next = open[0] ? open[0].name : 'the next month';
  return n === 1 ? `Goes up ${R.rise} after ${next} unless ${gid === S.myGid ? 'you win' : 'they win'} or finish runner-up.` : `Goes up ${R.rise} after ${n} more months without a cut.`;
}
function hcpOps(){
  const L = hcpLedger(); const ops = [];
  Object.values(D.golfers).forEach(g => { const l = L[g.id]; if (!l || l.base === null) return; if (snapHcp(g) !== l.current) ops.push({path:`golfers/${g.id}`, data: Object.assign({}, g, {hcp:l.current})}); });
  return ops;
}
async function syncHandicaps(){ if (!S.adminRole) return; const ops = hcpOps(); if (ops.length) { ops.forEach(o => localSet(o.path, o.data)); await batch(ops); } }
function previewHcp(cid, status){
  const before = hcpLedger(); const c = D.comps[cid]; const saved = c.status;
  c.status = status; MEMO = {}; const after = hcpLedger(); c.status = saved; MEMO = {};
  return Object.keys(after).map(gid => ({gid, from: before[gid] && before[gid].current, to: after[gid].current})).filter(x => x.from !== null && x.from !== x.to);
}

/* ---------- Who can do what (mirrors firestore.rules) ---------- */
// Players enter their own card (Friday to Sunday); the organiser can enter any card.
function canEnter(cid, round, gid){
  const c = D.comps[cid]; if (!c) return false;
  if (S.isAdmin) return true;
  const card = cardOf(cid, round, gid);
  return !!(S.myGid && gid === S.myGid && c.status === 'open' && roundOpenNow(c, round) && entryOf(cid, S.myGid) && cardStarted(card) && !cardLocked(card));
}
function canStart(cid, round){
  const c = D.comps[cid]; const card = cardOf(cid, round, S.myGid);
  return !!(c && S.myGid && c.status === 'open' && roundOpenNow(c, round) && entryOf(cid, S.myGid) && !cardStarted(card) && !(card && card.scores && Object.keys(card.scores).length));
}
function errText(e){
  const code = e && e.code || '';
  if (code === 'permission-denied' || /permission/i.test(e && e.message || '')) return (e && e.message && !/Missing or insufficient/i.test(e.message)) ? e.message : "That isn't allowed. You can enter your own card while the round is open (Friday to Sunday).";
  if (code === 'unavailable') return "You're offline. It will save when you're back online.";
  return 'Something went wrong. Check your connection and try again.';
}
function noId(data){ if (data && Object.prototype.hasOwnProperty.call(data, 'id')) { data = Object.assign({}, data); delete data.id; } return data; }
async function put(path, data){ try { await be.set(path, noId(data)); return true; } catch (e) { toast(errText(e)); return false; } }
async function drop(path){ try { await be.del(path); return true; } catch (e) { toast(errText(e)); return false; } }
async function batch(ops){ try { await be.batch(ops.map(o => o.del ? o : Object.assign({}, o, {data: noId(o.data)}))); return true; } catch (e) { toast(errText(e)); return false; } }
function localSet(path, data){
  const s = path.split('/');
  if (s[0] === 'golfers') D.golfers[s[1]] = Object.assign({}, data, {id:s[1]});
  else if (s[0] === 'comps' && s.length === 2) D.comps[s[1]] = Object.assign({}, data, {id:s[1]});
  else if (s[0] === 'comps' && s[2] === 'cards') D.cards[`${s[1]}/${s[3]}`] = Object.assign({}, data, {id:s[3]});
  else if (s[0] === 'comps' && s[2] === 'entries') D.entries[`${s[1]}/${s[3]}`] = Object.assign({}, data, {id:s[3], compId:s[1]});
  MEMO = {};
}

/* ---------- Boot, sign-in, subscriptions ---------- */
async function boot(){
  render();
  if (!CONFIGURED && !SAMPLE) { S.phase = 'setup'; render(); return; }
  try {
    const mod = SAMPLE ? await import('./backend-mock.js') : await import('./backend-firebase.js');
    be = await mod.init(CFG);
  } catch (e) {
    console.error(e); S.phase = 'error'; S.bootError = String(e && e.message || e); render(); return;
  }
  if (SAMPLE && be._store && !Object.keys(be._store()).length) be._seed(sampleData());
  be.onAuth(u => onUser(u));
}
function stopData(){ unsubs.forEach(f => { try { f(); } catch (_) {} }); unsubs = []; }
function onUser(u){
  stopData();
  Object.assign(D, { golfers:{}, comps:{}, entries:{}, cards:{}, members:{}, requests:{}, settings:null, admins:undefined, adminCode:undefined, member:undefined, myReq:undefined });
  S.loaded = {}; S.user = u; S.myGid = null; S.isAdmin = false; S.adminRole = false; MEMO = {};
  if (!u) { S.phase = 'signin'; render(); return; }
  if (!u.emailVerified) { S.phase = 'verify'; render(); return; }
  S.phase = 'checking'; render();
  const err = e => { console.warn(e); if (S.phase === 'checking') { S.phase = 'nomember'; render(); } };
  unsubs.push(be.watch('config/admins', d => { D.admins = d ? d.data : null; resolveRole(); }, err));
  unsubs.push(be.watch('members/' + u.email, d => { D.member = d ? d.data : null; resolveRole(); }, () => { D.member = null; resolveRole(); }));
  // A request to join, if this email isn't on the golfer list yet.
  unsubs.push(be.watch('requests/' + u.email, d => { D.myReq = d ? d.data : null; if (S.phase === 'nomember') render(); }, () => { D.myReq = null; }));
}
// S.adminRole: really an organiser. S.isAdmin: showing the organiser's screens (off in golfer view).
function applyMode(){ S.isAdmin = S.adminRole && !(S.golferMode && S.myGid); }
function setMode(golfer){
  S.golferMode = !!golfer; try { localStorage.setItem('rgc-golfer-view', golfer ? '1' : '0'); } catch (_) {}
  applyMode(); closeSheetQuiet(); S.card = null; S.compId = null; S.playerId = null; S.view = 'home'; MEMO = {}; top(); render();
}
function resolveRole(){
  if (D.admins === undefined || D.member === undefined) return;
  const email = S.user.email;
  const wasAdmin = S.adminRole, wasGid = S.myGid;
  S.adminRole = !!(D.admins && (D.admins.emails || []).includes(email));
  S.myGid = D.member ? D.member.golferId : null;
  try { S.golferMode = localStorage.getItem('rgc-golfer-view') === '1'; } catch (_) {}
  applyMode();
  if (!S.adminRole && !S.myGid) { S.phase = D.admins ? 'nomember' : 'bootstrap'; stopDataOnly(); render(); return; }
  if (S.phase !== 'app' || wasAdmin !== S.adminRole || wasGid !== S.myGid) { S.phase = 'app'; startData(); }
  render();
}
let dataUnsubs = [];
function stopDataOnly(){ dataUnsubs.forEach(f => { try { f(); } catch (_) {} }); dataUnsubs = []; }
function startData(){
  stopDataOnly();
  const err = e => { console.warn(e); toast('Some data could not load. Pull to refresh or reopen the app.'); };
  const coll = (path, key) => dataUnsubs.push(be.watch(path, docs => { D[key] = {}; docs.forEach(d => D[key][d.id] = Object.assign({}, d.data, {id:d.id})); S.loaded[key] = true; MEMO = {}; render(); }, err));
  const group = (name, key) => dataUnsubs.push(be.watchGroup(name, docs => { D[key] = {}; docs.forEach(d => { const s = d.path.split('/'); const cid = s[1]; D[key][cid + '/' + d.id] = Object.assign({}, d.data, {id:d.id, compId:cid}); }); S.loaded[key] = true; MEMO = {}; render(); }, err));
  coll('golfers', 'golfers'); coll('comps', 'comps');
  if (S.adminRole) { const wait = setInterval(() => { if (S.loaded.golfers && S.loaded.comps && S.loaded.entries && S.loaded.cards && S.loaded.settings) { clearInterval(wait); if (!S.hcpSynced) { S.hcpSynced = true; syncHandicaps(); } } }, 800); dataUnsubs.push(() => clearInterval(wait)); }
  group('entries', 'entries'); group('cards', 'cards');
  dataUnsubs.push(be.watch('config/settings', d => { D.settings = d ? d.data : null; S.loaded.settings = true; MEMO = {}; render(); }, err));
  if (S.adminRole) {
    dataUnsubs.push(be.watch('config/admin', d => { D.adminCode = d ? d.data : null; restoreAdmin(); S.loaded.adminCode = true; render(); }, () => { D.adminCode = null; S.loaded.adminCode = true; render(); }));
    dataUnsubs.push(be.watch('members', docs => { D.members = {}; docs.forEach(d => D.members[d.id] = d.data); render(); }, () => {}));
    dataUnsubs.push(be.watch('requests', docs => { D.requests = {}; docs.forEach(d => D.requests[d.id] = d.data); render(); }, () => {}));
  }
}

/* ---------- Rendering ---------- */
let rq = false, deferred = false;
function render(){ if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; doRender(); }); }
const ICONS = {
  comps:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3"/><path d="M7 4h10l-2.5 3.5L17 11H7"/><path d="M4 21h9"/></svg>',
  table:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"/><path d="M5 20v-6h4v6"/><path d="M10 20V8h4v12"/><path d="M15 20v-4h4v4"/></svg>',
  league:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"/><path d="M5 20v-6h4v6"/><path d="M10 20V8h4v12"/><path d="M15 20v-4h4v4"/></svg>',
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  me:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>',
  golfers:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><path d="M15.5 14.2c2.2.1 4 1.6 4.5 4.3"/></svg>',
  admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8h3.5l2-3h6l2 3h3.5v11h-17z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  group:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><path d="M15.5 14.2c2.2.1 4 1.6 4.5 4.3"/></svg>',
  share:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>'
};
function doRender(){
  const ae = document.activeElement; const main = $('#main');
  if (ae && ae.matches && ae.matches('input:not([type=checkbox]):not([type=radio]),select,textarea') && main.contains(ae)) { deferred = true; return; }
  MEMO = {};
  $('#acct').innerHTML = S.user && S.phase === 'app' ? `<button class="acct" data-act="account" aria-label="Account">${esc(initials(S.myGid ? gName(S.myGid) : (S.user.name || S.user.email)))}</button>` : '';
  $('#role').textContent = SAMPLE ? 'Sample' : S.isAdmin ? 'Organiser' : S.myGid ? 'Golfer' : '';
  $('#role').hidden = !(S.phase === 'app' || SAMPLE);
  const banner = $('#banner');
  banner.hidden = !SAMPLE && !S.updateReady;
  if (S.updateReady) banner.innerHTML = `<div class="wrap"><span>A new version of the app is ready.</span><button data-act="reload">Update now</button></div>`;
  else if (SAMPLE) banner.innerHTML = `<div class="wrap"><span>Sample data, kept on this phone only.</span>${CONFIGURED ? '<a href="./">Open the real league</a>' : ''}</div>`;
  const inApp = S.phase === 'app';
  // Golfers: Home, Table, Me, Golfers. Organisers: Home, Table, Comps (running months and payments), Golfers, Admin.
  const tabs = S.isAdmin ? [['home','Home'],['table','Table'],['comps','Comps'],['golfers','Golfers'],['admin','Admin']]
    : [['home','Home'],['table','Table']].concat(S.myGid ? [['me','Me']] : [], [['golfers','Golfers']]);
  if (S.view === 'league') S.view = 'table';
  if ((S.view === 'admin' || S.view === 'comps') && !S.isAdmin) S.view = 'home';
  if (S.view === 'me' && !S.myGid) S.view = 'home';
  const fresh = inApp && S.loaded.cards ? newActivity() : 0;
  try { if (navigator.setAppBadge) { if (fresh) navigator.setAppBadge(fresh); else navigator.clearAppBadge(); } } catch (_) {}
  $('#tabsIn').innerHTML = inApp ? tabs.map(([k,l]) => `<button class="tab" data-act="tab" data-v="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${l}</span>${k === 'home' && fresh ? `<i class="tbadge">${fresh > 9 ? '9+' : fresh}</i>` : ''}</button>`).join('') : '';
  let html;
  if (S.phase === 'boot' || S.phase === 'checking') html = '<p class="loading">Loading…</p>';
  else if (S.phase === 'error') html = viewError();
  else if (S.phase === 'setup') html = viewSetupNeeded();
  else if (S.phase === 'signin') html = viewSignin();
  else if (S.phase === 'verify') html = viewVerify();
  else if (S.phase === 'nomember') html = viewNoMember();
  else if (S.phase === 'bootstrap') html = viewBootstrap();
  else if (!(S.loaded.golfers && S.loaded.comps && S.loaded.entries && S.loaded.cards)) html = '<p class="loading">Loading the league…</p>';
  else html = S.card ? viewCard() : nudgeHtml() + mainHtml();
  main.innerHTML = html;
  const kp = !!main.querySelector('.keypad');
  document.body.classList.toggle('with-keypad', kp);
  $('#tabs').hidden = kp || !inApp;
}
function mainHtml(){
  if (S.view === 'table') return viewTable();
  if (S.view === 'me') return viewMe();
  if (S.view === 'golfers') return S.playerId ? viewPlayer() : viewGolfers();
  if (S.view === 'admin') return viewAdmin();
  if (S.view === 'comps') return S.compId ? viewComp() : viewComps();
  return viewHome();
}
function backBtn(label, act){ return `<button class="back" data-act="${act}">${ICONS.back}${esc(label)}</button>`; }
function chipsFor(c){
  const k = cfg(); const rs = compRounds(c); const best = rs.length > 1 ? `<span class="chip">Best ${compBest(c)} of ${rs.length}</span>` : ''; const fee = `<span class="chip">${euro(c.fee != null ? c.fee : k.fee)} entry</span>`;
  if (roundsVary(c)) { const fs = [...new Set(rs.map(r => (FORMATS[rcfg(c, r.n).format] || FORMATS.stableford).short))]; return `<span class="chip">${esc(fs.join(' · '))}</span><span class="chip">Varies by round</span>${best}${fee}`; }
  const rc = rcfg(c, rs[0].n); const t = TEES[rc.tee] || TEES.white;
  return `<span class="chip">${esc((FORMATS[rc.format]||FORMATS.stableford).short)}</span><span class="chip">${rc.holes.length} holes</span>${best}<span class="chip">${t.name} tees</span>${fee}`;
}

/* ----- Signed-out screens ----- */
function viewError(){ return `<section class="empty"><span class="eyebrow">Couldn't start</span><h2>The app couldn't load</h2><p class="hint">Check your internet connection and reopen the app. (${esc(S.bootError || '')})</p></section>`; }
function viewSetupNeeded(){
  return `<section class="empty"><span class="eyebrow">Almost there</span><h2>Connect the app to Firebase</h2><p class="hint">This copy of the app hasn't been linked to its Firebase project yet. Follow the setup guide, then reload.</p><a class="btn primary" href="?sample=1">Try it with sample data</a></section>`;
}
function viewSignin(){
  if (SAMPLE) {
    const ids = [['organiser@example.com','Organiser (admin)']].concat(sampleGolfers().map(g => [g[3], g[0]]), [['newgolfer@example.com','Someone new (not on the list yet)']]);
    return `<section class="signin"><span class="eyebrow">Sample league</span><h1>Sign in as…</h1><p class="hint">Pick someone to see the app from their side. In the real app everyone signs in with their own Google account or email.</p>
      <ul class="list">${ids.map(([e,n]) => `<li><button class="row" data-act="sampleSignin" data-email="${esc(e)}"><span class="avatar">${esc(initials(n))}</span><span class="row-main"><span class="row-title">${esc(n)}</span><span class="row-sub">${esc(e)}</span></span><span></span></button></li>`).join('')}</ul></section>`;
  }
  const up = S.signinMode === 'signup';
  return `<section class="signin">
    <span class="eyebrow">Welcome</span><h1>${up ? 'Create your account' : 'Sign in'}</h1>
    <p class="hint">Use the email address the organiser has for you. That's how the app knows which golfer you are.</p>
    <button class="btn block gbtn" data-act="google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.2V7.2H2.2a11 11 0 0 0 0 9.8l3.6-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.2L5.8 10C6.7 7.3 9.1 5.4 12 5.4z"/></svg>Continue with Google</button>
    <div class="or"><span>or with email</span></div>
    <form data-form="${up ? 'signup' : 'signin'}" class="stack">
      <label class="field"><span>Email</span><input type="email" id="si-email" name="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input type="password" id="si-pw" name="pw" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <button class="btn primary block" type="submit" ${S.busy ? 'disabled' : ''}>${up ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="signin-links">${up ? '<button class="textbtn" data-act="signinMode" data-v="signin">I already have an account</button>' : '<button class="textbtn" data-act="signinMode" data-v="signup">Create an account</button><button class="textbtn" data-act="forgot">Forgot password</button>'}</div>
  </section>`;
}
function viewVerify(){
  return `<section class="signin"><span class="eyebrow">One more step</span><h1>Check your email</h1><p class="hint">We sent a link to <b>${esc(S.user.email)}</b>. Tap it to confirm your address, then come back here.</p>
    <button class="btn primary block" data-act="verified">I've confirmed my email</button><button class="btn block" data-act="resendVerify">Send the link again</button><button class="textbtn" data-act="signout">Use a different account</button></section>`;
}
function viewNoMember(){
  const r = D.myReq;
  if (r) return `<section class="signin"><span class="eyebrow">Request sent</span><h1>Waiting for the organiser</h1><p class="hint">You asked to join as <b>${esc(r.name)}</b>${r.hi != null ? `, handicap ${esc(fmtHi(r.hi))}` : ''}. The app opens by itself as soon as the organiser lets you in, so you can leave this screen and come back.</p>
    <p class="hint">Signed in as <b>${esc(S.user.email)}</b>.</p>
    <button class="btn block" data-act="recheck">Check again</button><button class="textbtn" data-act="cancelReq">Cancel my request</button><button class="textbtn" data-act="signout">Sign out</button></section>`;
  return `<section class="signin"><span class="eyebrow">Not on the list yet</span><h1>Ask to join</h1><p class="hint">You're signed in as <b>${esc(S.user.email)}</b>, which isn't on the golfer list yet. Send your details and the organiser will let you in.</p>
    <form data-form="joinReq" class="stack">
      <label class="field"><span>Your name</span><input type="text" id="jr-name" name="name" autocomplete="name" maxlength="60" value="${esc(S.user.name || '')}" required></label>
      <label class="field"><span>Handicap index</span><input type="text" id="jr-hi" name="hi" inputmode="decimal" placeholder="e.g. 14.2"></label>
      <div class="field"><span>Card</span><div class="radios">${radio('jgender','M',"Men's", true)}${radio('jgender','L',"Ladies' (red)", false)}</div></div>
      <button class="btn primary block" type="submit">Ask to join</button>
    </form>
    <p class="hint">Already on the list under a different email? Say so to the organiser and they'll link this one to you.</p>
    <button class="textbtn" data-act="signout">Use a different account</button></section>`;
}
function viewBootstrap(){
  return `<section class="signin"><span class="eyebrow">First-time setup</span><h1>Set yourself up as organiser</h1><p class="hint">Nobody runs this league yet. If you're the organiser, tap below. You'll be able to add golfers, competitions and other organisers.</p>
    <button class="btn primary block" data-act="bootstrap">I'm the organiser</button><button class="textbtn" data-act="signout">Sign out</button></section>`;
}

/* ----- Competitions ----- */
function viewComps(){
  const comps = Object.values(D.comps).sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  if (!comps.length) return todoHtml([]) + emptyComps();
  const open = comps.filter(c => c.status !== 'final').sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  let h = todoHtml(open);
  h += `<div class="sec-head" style="margin-top:${h ? 28 : 0}px"><h2>All competitions</h2>${S.isAdmin ? '<button class="btn small" data-act="newComp">+ New competition</button>' : ''}</div>`;
  h += '<ul class="list">' + comps.map(c => {
    const p = dParts(c.date); const fin = c.status === 'final';
    const lb = fin ? leaderboard(c) : null;
    const win = lb && lb.ranked[0] ? ' · Won by ' + esc(lb.ranked.filter(r => r.pos === 1).map(r => r.golfer.name).join(' & ')) : '';
    const rs = compRounds(c);
    return `<li><button class="row" data-act="openComp" data-id="${esc(c.id)}"><span class="row-date"><b>${p.day}</b>${p.mon}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${roundsVary(c) ? 'Mixed formats' : esc((FORMATS[rcfg(c, rs[0].n).format]||FORMATS.stableford).short)} · ${rs.length > 1 ? `best ${compBest(c)} of ${rs.length}` : `${rcfg(c, rs[0].n).holes.length} holes`}${win}</span></span><span class="pill ${fin ? 'final' : 'open'}">${fin ? 'Final' : 'Open'}</span></button></li>`;
  }).join('') + '</ul>';
  return h;
}
/* ---------- Organiser notifications (free ntfy app) and the activity list ---------- */
// The private channel name lives on config/admins, which every signed-in user can read, so even people
// asking to join can send a notification. The organiser's own actions don't notify anyone.
function notifyTopic(){ const t = D.admins && D.admins.notify; return typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null; }
function sendNotify(title, msg, tags, force){
  const topic = notifyTopic(); if (!topic || (S.adminRole && !force)) return;
  if (SAMPLE) { (window.__notifyLog = window.__notifyLog || []).push({title, msg, tags}); return; }
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}?title=${encodeURIComponent(title)}${tags ? '&tags=' + encodeURIComponent(tags) : ''}`;
  try { fetch(url, {method:'POST', body:msg, mode:'no-cors', keepalive:true}).catch(() => {}); } catch (_) {}
}
function cardCounts(cid, round, gid){ const c = D.comps[cid]; return !!(c && scoreCard(c, round, gid).valid); }
// Tell the organiser when a golfer's card has just started counting (complete and ticked as signed).
function notifyIfDone(cid, round, gid, before){
  if (before || !cardCounts(cid, round, gid)) return;
  const c = D.comps[cid]; const sc = scoreCard(c, round, gid); const u = unitFor(sc.rc.format);
  sendNotify(`${gName(gid)} · round ${round} card in`, `${cardValueText(sc)}${u ? ' ' + u : ''}, signed by ${markerName(sc.card)} · ${c.name}`, 'white_check_mark');
}
function seenAt(){ try { return Number(localStorage.getItem('rgc-activity-seen')) || 0; } catch (_) { return 0; } }
function activityItems(){
  const out = []; const since = Date.now() - 14 * 864e5; const t = x => msOf(x);
  Object.entries(D.requests || {}).forEach(([email, r]) => { if (t(r.createdAt)) out.push({t:t(r.createdAt), text:`${r.name} asked to join`, act:'joinList'}); });
  Object.values(D.entries).forEach(e => { const g = D.golfers[e.golferId], c = D.comps[e.compId]; if (!g || !c) return;
    if (t(e.createdAt)) out.push({t:t(e.createdAt), text:`${g.name} entered ${c.name}`});
    if (e.claimed && !e.paid && t(e.claimedAt)) out.push({t:t(e.claimedAt), text:`${g.name} says they've paid${e.claimMethod && METHODS[e.claimMethod] ? ' by ' + METHODS[e.claimMethod] : ''}`, act:'payments', id:c.id}); });
  Object.values(D.cards).forEach(card => { const g = D.golfers[card.golferId], c = D.comps[card.compId]; if (!g || !c) return;
    if (t(card.startedAt)) out.push({t:t(card.startedAt), text:`${g.name} started round ${card.round}`, card});
    if (t(card.updatedAt) && card.updatedBy !== (S.user && S.user.uid)) { const sc = scoreCard(c, card.round, card.golferId); const u = unitFor(sc.rc.format);
      if (sc.valid) out.push({t:t(card.updatedAt), text:`${g.name}'s round ${card.round} card counts: ${cardValueText(sc)}${u ? ' ' + u : ''}, signed by ${markerName(card)}`, card}); } });
  return out.filter(x => x.t > since && x.t <= Date.now() + 60000).sort((a, b) => b.t - a.t);
}
function agoText(ms){ const m = Math.round((Date.now() - ms) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24 && new Date(ms).getDate() === new Date().getDate()) return `${h} hr ago`; return whenText(ms); }
function newActivity(){ if (!S.isAdmin) return 0; const seen = seenAt(); return activityItems().filter(x => x.t > seen).length; }
function activityHtml(){
  const items = activityItems(); if (!items.length) return '';
  const seen = seenAt(); const fresh = items.filter(x => x.t > seen).length; const shown = items.slice(0, S.actMore ? 25 : 6);
  let h = `<div class="sec-head"><h2>Activity${fresh ? ` <span class="newpill">${fresh} new</span>` : ''}</h2>${fresh ? '<button class="btn small" data-act="actSeen">Mark as seen</button>' : ''}</div><ul class="list act">`;
  h += shown.map(x => { const attrs = x.card ? `data-act="openCard" data-cid="${esc(x.card.compId)}" data-round="${x.card.round}" data-gid="${esc(x.card.golferId)}"` : x.act ? `data-act="${x.act}" ${x.id ? `data-id="${esc(x.id)}"` : ''}` : '';
    const inner = `<span class="act-dot ${x.t > seen ? 'on' : ''}"></span><span class="act-text">${esc(x.text)}</span><span class="act-time">${esc(agoText(x.t))}</span>`;
    return `<li>${attrs ? `<button class="act-row" ${attrs}>${inner}</button>` : `<div class="act-row">${inner}</div>`}</li>`; }).join('') + '</ul>';
  if (items.length > shown.length) h += `<button class="textbtn" data-act="actMore">Show more</button>`;
  return h;
}

/* ----- Home: this month at a glance, with the golfer's own card first ----- */
function openComps(){ return Object.values(D.comps).filter(c => c.status !== 'final').sort((a,b) => String(a.date||'').localeCompare(String(b.date||''))); }
// The month that's running now: one with a round open, else one with a round coming up, else the latest unfinished one.
function currentComp(){
  const open = openComps(); const has = st => c => compRounds(c).some(r => roundState(r) === st);
  return open.find(has('open')) || open.find(has('upcoming')) || open[open.length - 1] || null;
}
function lastFinal(){ return Object.values(D.comps).filter(c => c.status === 'final').sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')))[0] || null; }
function potLine(c){ const st = compStats(c); return `Pot ${euro(st.pot)} · Winner ${euro(st.prizes[0] || 0)} · Runner-up ${euro(st.prizes[1] || 0)}`; }
function roundInfo(c, n){ const rc = rcfg(c, n); return `${(FORMATS[rc.format] || FORMATS.stableford).short} · ${rc.holes.length} holes · ${(TEES[rc.tee] || TEES.white).name} tees`; }
function viewHome(){
  let h = todoHtml(openComps());
  const c = currentComp();
  if (!c) {
    if (!Object.keys(D.comps).length) return h + emptyComps();
    h += `<section class="hero"><span class="eyebrow">Pot of Gold</span><h1 class="hero-title">No month running</h1><p class="hero-sub">${S.isAdmin ? 'Create the next month and it shows here for everyone.' : 'The organiser will post the next month here.'}</p>${S.isAdmin ? '<button class="btn primary block" data-act="newComp">New competition</button>' : ''}</section>`;
    const last = lastFinal(); return h + (last ? miniTable(last) : '');
  }
  h += homeHero(c) + (S.isAdmin ? activityHtml() : '') + miniTable(c);
  const last = lastFinal(); if (last && last.id !== c.id) h += lastMonthHtml(last);
  return h;
}
function homeHero(c){
  const rs = compRounds(c); const open = rs.find(r => roundState(r) === 'open'); const next = rs.find(r => roundState(r) === 'upcoming');
  const me = S.myGid; const e = me ? entryOf(c.id, me) : null; const fee = compFee(c); const cid = esc(c.id);
  let h = `<section class="hero"><span class="eyebrow">${esc(c.name)}${rs.length > 1 ? ` · best ${compBest(c)} of ${rs.length} rounds` : ''}</span>`;
  if (open) h += `<h1 class="hero-title">Round ${open.n} is open</h1><p class="hero-sub">${esc(roundLabel(open))} · ${esc(roundInfo(c, open.n))}</p>`;
  else if (next) { const d = dParts(next.from); h += `<h1 class="hero-title">Round ${next.n} opens ${d.dow} ${d.day} ${d.mon}</h1><p class="hero-sub">Open Friday to Sunday · ${esc(roundInfo(c, next.n))}</p>`; }
  else h += `<h1 class="hero-title">All rounds played</h1><p class="hero-sub">The results are final once the organiser finalises the month.</p>`;
  if (me && !e) {
    h += `<p class="hero-text">Entry is ${euro(fee)} and covers all ${rs.length} round${rs.length === 1 ? '' : 's'}. Your best ${compBest(c)} card${compBest(c) === 1 ? '' : 's'} count.</p><button class="btn primary block big" data-act="selfEnter" data-cid="${cid}">Enter ${esc(c.name)}</button>${payNote(c)}`;
  } else if (me && e) {
    if (open) {
      const sc = scoreCard(c, open.n, me); const done = sc.complete && sc.marked; const u = unitFor(sc.rc.format); const card = sc.card;
      const val = `${cardValueText(sc)}${u ? ' ' + u : ''}`; const late = cardLocked(card);
      if (canStart(c.id, open.n)) {
        h += `<div class="mycard"><span class="label">Your round ${open.n} card</span><b>Not started yet</b></div>`;
        h += `<button class="btn primary block big" data-act="startRound" data-cid="${cid}" data-round="${open.n}">Start my round</button>`;
        h += `<p class="hint">Tap this before you tee off. You get one round this weekend, and it has to be entered and ticked as signed by midnight that day, or it doesn't count.</p>`;
      } else {
        const status = done ? `${val} · signed by ${markerName(card)}` : late ? "Not finished by midnight, so it doesn't count" : !sc.filled ? 'No scores yet' : !sc.complete ? `Thru ${sc.filled} of ${sc.rows.length} holes` : sc.nr ? 'No return (picked up)' : `${val} · not ticked as signed yet`;
        const timing = cardStarted(card) ? (late ? `Started ${whenText(card.startedAt)} · locked at midnight` : `Started ${whenText(card.startedAt)} · enter by ${deadlineText(card)}`) : '';
        h += `<div class="mycard ${done ? 'ok' : late || sc.complete ? 'warn' : ''}"><span class="label">Your round ${open.n} card</span><b>${esc(status)}</b>${timing ? `<small>${esc(timing)}</small>` : ''}${done ? '<span class="okmark">Counts</span>' : ''}</div>`;
        if (late) h += `<button class="btn block" data-act="openCard" data-cid="${cid}" data-round="${open.n}" data-gid="${esc(me)}">View my card</button>`;
        else {
          h += `<div class="hero-actions"><button class="btn primary big" data-act="openCard" data-cid="${cid}" data-round="${open.n}" data-gid="${esc(me)}">${sc.filled ? 'Open my card' : 'Enter my card'}</button><button class="btn big" data-act="scan" data-cid="${cid}" data-round="${open.n}">${ICONS.camera}Scan my card</button></div>`;
          if (!done) h += `<p class="hint">Get your card signed by your marker, then enter or scan it by ${esc(deadlineText(card) || 'midnight')}. Add the marker's name, tick that it's signed, and send the organiser a photo of the card.</p>`;
        }
      }
    }
    const ps = payState(e);
    if (ps === 'unpaid') h += `<div class="paynote"><span>Your ${euro(fee)} entry isn't paid yet.</span><button class="btn small primary" data-act="pay" data-id="${esc(c.id + '/' + me)}">Pay now</button></div>`;
    else if (ps === 'claimed') h += `<p class="hint">Payment sent. The organiser is checking it.</p>`;
    h += positionHtml(c);
  } else if (S.isAdmin) {
    const st = compStats(c); h += `<dl class="figs"><div><dt>Entries</dt><dd>${st.entries}</dd></div><div><dt>Paid</dt><dd>${st.paid}</dd></div><div><dt>Pot</dt><dd>${euro(st.pot)}</dd></div></dl>`;
  }
  if (S.isAdmin) h += `<button class="btn block" data-act="openComp" data-id="${cid}">Manage ${esc(c.name)}</button>`;
  return h + '</section>';
}
function positionHtml(c){
  const lb = leaderboard(c); const row = lb.all.find(r => r.gid === S.myGid); if (!row) return '';
  if (!row.count) return `<div class="mypos"><span class="label">This month</span><b class="mypos-none">No counting cards yet</b></div>`;
  const u = monthUnit(c); const best = compBest(c); const leader = lb.ranked[0];
  const sub = `${monthText(row, c)}${u ? ' ' + u : ''} from ${row.count} of ${best} card${best === 1 ? '' : 's'}`;
  let lead = '';
  if (row.pos === 1 && !row.tied) { const second = lb.ranked.find(r => r.pos === 2); lead = second ? `Ahead of ${second.golfer.name}, ${monthText(second, c)}${u ? ' ' + u : ''}` : ''; }
  else if (leader && leader.gid !== row.gid) lead = `Leader: ${leader.golfer.name}, ${monthText(leader, c)}${u ? ' ' + u : ''}`;
  return `<div class="mypos"><span class="label">This month</span><div class="mypos-line"><b class="mypos-place">${row.tied ? 'T' : ''}${ord(row.pos)}</b><span class="mypos-sub">${esc(sub)}</span></div><div class="rcells">${roundCells(c, row)}</div>${lead ? `<p class="hint">${esc(lead)}</p>` : ''}</div>`;
}
function miniTable(c){
  const lb = leaderboard(c); const fin = c.status === 'final'; const u = monthUnit(c);
  let rows = lb.ranked.slice(0, 5); const mine = lb.ranked.find(r => r.gid === S.myGid); if (mine && !rows.includes(mine)) rows = rows.concat(mine);
  let h = `<div class="sec-head"><h2>${fin ? `${esc(c.name)} · final` : 'Table so far'}</h2><button class="btn small" data-act="openTable" data-id="${esc(c.id)}">Full table</button></div>`;
  if (!rows.length) return h + `<div class="panel"><p class="hint">The table fills in as signed cards come in.</p></div><p class="potline">${esc(potLine(c))}</p>`;
  h += `<ul class="list">${rows.map(r => `<li><button class="mini-row ${r.pos === 1 ? 'first' : ''} ${r.gid === S.myGid ? 'me' : ''}" data-act="openTable" data-id="${esc(c.id)}"><span class="lb-pos">${r.tied ? 'T' : ''}${r.pos}</span><span class="mini-name">${esc(r.golfer.name)}${r.gid === S.myGid ? ' <small>(you)</small>' : ''}</span><span class="mini-score">${esc(monthText(r, c))}${u ? `<small>${u}</small>` : ''}</span></button></li>`).join('')}</ul>`;
  return h + `<p class="potline">${esc(potLine(c))}</p>`;
}
function lastMonthHtml(c){
  const lb = leaderboard(c); const names = p => lb.ranked.filter(r => r.pos === p).map(r => r.golfer.name).join(' & ');
  const w = names(1), ru = names(2); if (!w) return ''; const d = dParts(c.date);
  return `<div class="sec-head"><h2>Last month</h2></div><ul class="list"><li><button class="row" data-act="openTable" data-id="${esc(c.id)}"><span class="row-date"><b>${d.day}</b>${d.mon}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">Won by ${esc(w)}${ru ? ' · runner-up ' + esc(ru) : ''}</span></span><span class="pill final">Final</span></button></li></ul>`;
}
// What's next in a month, for reminders: the open round, or the next one coming up.
function roundLine(c){
  const rs = compRounds(c); const open = rs.find(r => roundState(r) === 'open'); const next = rs.find(r => roundState(r) === 'upcoming');
  if (open) return `Round ${open.n} is open now (${roundLabel(open)}).`;
  if (next) return `Round ${next.n} is on ${roundLabel(next)}.`;
  return '';
}
function stillToPlay(c){ return compRounds(c).some(r => roundState(r) !== 'played'); }
// Golfers who haven't entered the month yet, and entries not paid (and not marked as paid by the golfer).
function chaseLists(c){
  const notEntered = stillToPlay(c) ? sortedGolfers().filter(g => !entryOf(c.id, g.id)) : [];
  const unpaid = entriesFor(c.id).filter(e => payState(e) === 'unpaid').map(e => D.golfers[e.golferId]).filter(Boolean).sort(byName);
  return {notEntered, unpaid};
}
// A reminder strip at the top of every tab (Home already shows the same buttons) for a golfer who hasn't entered or paid.
function nudgeHtml(){
  if (!S.myGid || S.view === 'home') return '';
  const c = currentComp(); if (!c) return '';
  const e = entryOf(c.id, S.myGid); const line = roundLine(c);
  if (!e && stillToPlay(c)) return `<div class="nudge"><span><b>You haven't entered ${esc(c.name)} yet</b>${line ? `<small>${esc(line)}</small>` : ''}</span><button class="btn small primary" data-act="selfEnter" data-cid="${esc(c.id)}">Enter now</button></div>`;
  if (e && payState(e) === 'unpaid') return `<div class="nudge"><span><b>Your ${euro(compFee(c))} entry isn't paid yet</b><small>Pay through Revolut, then tap I've paid.</small></span><button class="btn small primary" data-act="pay" data-id="${esc(c.id + '/' + S.myGid)}">Pay now</button></div>`;
  return '';
}
// Organiser's list of things waiting on them: join requests and payments golfers say they've made.
function todoHtml(open){
  if (!S.isAdmin) return '';
  const items = []; const reqs = Object.keys(D.requests || {}).length;
  if (!S.myGid) items.push(`<li><span class="grp-main"><b>Playing too? Add yourself as a golfer</b><small>Then you can enter your own cards and see the app as golfers do</small></span><button class="btn small primary" data-act="addMe">Add me</button></li>`);
  if (reqs) items.push(`<li><span class="grp-main"><b>${reqs} ${reqs === 1 ? 'person is' : 'people are'} asking to join</b><small>Add them to the golfer list so they can sign in</small></span><button class="btn small primary" data-act="joinList">Review</button></li>`);
  open.forEach(c => { const chk = entriesFor(c.id).filter(e => payState(e) === 'claimed').length;
    if (chk) items.push(`<li><span class="grp-main"><b>${chk} payment${chk === 1 ? '' : 's'} to check</b><small>${esc(c.name)} · check your Revolut, then confirm</small></span><button class="btn small primary" data-act="payments" data-id="${esc(c.id)}">Check</button></li>`); });
  const cur = currentComp();
  if (cur) { const L = chaseLists(cur); const a = L.notEntered.length, b = L.unpaid.length;
    if (a || b) items.push(`<li><span class="grp-main"><b>${[a ? `${a} not entered` : '', b ? `${b} not paid` : ''].filter(Boolean).join(' · ')}</b><small>${esc(cur.name)} · send the group a reminder</small></span><button class="btn small primary" data-act="remindAll" data-id="${esc(cur.id)}">${ICONS.share}Remind</button></li>`); }
  return items.length ? `<section class="todo"><span class="eyebrow">To do</span><ul class="grp">${items.join('')}</ul></section>` : '';
}
function emptyComps(){
  if (!S.isAdmin) return `<section class="empty"><span class="eyebrow">Nothing posted yet</span><h2>No competitions yet</h2><p class="hint">The organiser will post this month's competition here.</p></section>`;
  return `<section class="empty"><span class="eyebrow">Getting started</span><h2>Set up your first month</h2>
    <ol class="steps">
      <li><div><span><b>Add your golfers</b> with their handicap index and email, or share the app link and approve them as they ask to join.</span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-act="newGolfer">Add a golfer</button><button class="btn small" data-act="invite">Invite</button></span></div></li>
      <li><div><span><b>Create the month.</b> Four weekend rounds, open Friday to Sunday; the best 3 count.</span><button class="btn small primary" data-act="newComp">New competition</button></div></li>
      <li><div><span><b>Check the settings</b> in Admin: entry fee, Revolut link, prizes and points.</span><button class="btn small" data-act="tab" data-v="admin">Open Admin</button></div></li>
    </ol></section>`;
}
function roundsStrip(c){
  const vary = roundsVary(c);
  return `<div class="rstrip">${compRounds(c).map(r => { const st = roundState(r); const rc = rcfg(c, r.n); return `<button class="rtile ${st}" data-act="boardSel" data-v="${r.n}"><span class="rt-n">R${r.n}</span><span class="rt-d">${esc(shortRange(r))}</span>${vary ? `<span class="rt-f">${esc((FORMATS[rc.format] || FORMATS.stableford).short)} · ${rc.holes.length}h · ${esc((TEES[rc.tee] || TEES.white).name)}</span>` : ''}<span class="rt-s">${st === 'open' ? 'Open now' : st === 'played' ? 'Played' : 'Upcoming'}</span></button>`; }).join('')}</div>${monthMode(c).mixed ? `<p class="hint" style="margin-top:6px">Rounds use different formats, so the monthly table adds up Stableford points from each golfer's best ${compBest(c)} cards.</p>` : ''}`;
}
function viewComp(){
  const c = D.comps[S.compId]; if (!c) { S.compId = null; return viewComps(); }
  const lb = leaderboard(c); const st = lb.stats; const k = cfg(); const A = S.isAdmin; const fin = c.status === 'final';
  const kitty = st.pot - st.prizes.reduce((a,b) => a+b, 0); const rs = compRounds(c);
  let h = backBtn('All competitions', 'closeComp');
  h += `<span class="eyebrow">${fin ? 'Final results' : rs.length > 1 ? `${rs.length} weekend rounds · best ${compBest(c)} count` : 'Open'}</span>
    <h1 class="comp-name">${esc(c.name)}</h1><div class="chips">${chipsFor(c)}</div>`;
  if (rs.length > 1) h += roundsStrip(c);
  h += `<dl class="figs four money"><div><dt>Entries</dt><dd>${st.entries}</dd></div><div><dt>Paid</dt><dd>${st.paid}</dd></div><div><dt>Fee</dt><dd>${euro(st.fee)}</dd></div><div><dt>Pot</dt><dd>${euro(st.pot)}</dd></div></dl>
    <div class="prizes">${st.prizes.map((p,i) => `<span class="prize">${i === 0 ? 'Winner' : i === 1 ? 'Runner-up' : ord(i+1)} <b>${euro(p)}</b></span>`).join('')}${kitty > 0.004 ? `<span class="prize kitty">Kitty <b>${euro(kitty)}</b></span>` : ''}</div>`;
  if (A && st.entries) { const es = entriesFor(c.id); const chk = es.filter(e => payState(e) === 'claimed').length, un = es.filter(e => payState(e) === 'unpaid').length;
    h += `<button class="btn block paysum ${chk ? 'alert' : ''}" data-act="payments" data-id="${esc(c.id)}">Payments${chk ? ` · ${chk} to check` : ''}${un ? ` · ${un} unpaid` : ''}${!chk && !un ? ' · all paid' : ''}</button>`; }
  h += `<div class="seg" role="group" aria-label="View"><button data-act="compTab" data-v="entries" aria-pressed="${S.compTab === 'entries'}">Entries (${st.entries})</button><button data-act="compTab" data-v="board" aria-pressed="${S.compTab === 'board'}">Leaderboard</button></div>`;
  h += S.compTab === 'board' ? boardHtml(c, lb) : entriesHtml(c, lb);
  if (A) {
    h += `<div class="actions">${fin ? '<button class="btn" data-act="reopen">Reopen scoring</button>' : '<button class="btn primary" data-act="finalise">Finalise results</button>'}<button class="btn" data-act="editComp">Edit details</button><button class="btn danger" data-act="delComp">Delete</button></div>`;
    if (!fin) h += `<p class="hint" style="margin-top:10px">Finalising locks the month and adds league points: ${pointsKeyText()}.</p>`;
  }
  return h;
}
function pointsKeyText(){ const k = cfg(); return k.points.map((p,i) => `${ord(i+1)} ${p}`).join(', ') + `, everyone else ${k.entryPoint}`; }
function payNote(c){
  return `<p class="hint">Entry is ${euro(compFee(c))} for the month, paid through Revolut: in the Revolut app, or by debit card, Apple Pay or Google Pay if you don't have Revolut.</p>`;
}
function roundCells(c, row){
  const mixed = monthMode(c).mixed; const val = sc => mixed ? String(sc.pts) : cardValueText(sc);
  return compRounds(c).map(r => { const sc = row.cards.find(x => x.round === r.n); let v = '–', cls = '';
    if (sc && sc.filled) { if (sc.counts) { v = val(sc); if (!row.countedNs.has(r.n)) { v = '(' + v + ')'; cls = 'dropped'; } } else { v = sc.complete && !sc.marked && (mixed || !sc.nr) ? val(sc) + '*' : (!mixed && sc.nr) ? 'NR' : '…'; cls = 'pending'; } }
    return `<span class="rc ${cls}"><i>R${r.n}</i>${esc(v)}</span>`; }).join('');
}
function entriesHtml(c, lb){
  const A = S.isAdmin; const fin = c.status === 'final'; const cur = currentRound(c);
  const all = lb.all.slice().sort((a,b) => byName(a.golfer, b.golfer));
  let h = '';
  if (A && !fin) h += `<div class="entry-tools"><button class="btn primary" data-act="scan" data-round="${cur}">${ICONS.camera}Scan a card</button><button class="btn" data-act="addEntry">+ Add entries</button></div>`;
  if (!all.length) return h + `<div class="empty" style="margin-top:12px"><p class="hint">No entries yet.</p></div>`;
  h += `<p class="hint entry-hint">Tap a golfer to see their cards. A * means the card isn't ticked as signed by a marker yet, so it doesn't count. Brackets show a dropped round.</p>`;
  h += '<ul class="list">' + all.map(r => {
    const e = r.entry; const ps = payState(e); const own = r.gid === S.myGid;
    const label = ps === 'paid' ? (A ? METHODS[e.method] || 'Paid' : 'Paid') : ps === 'claimed' ? (A ? 'Check' : 'Checking') : 'Unpaid';
    const pay = A || own ? `<button class="paytag ${ps}" data-act="pay" data-id="${esc(c.id + '/' + r.gid)}">${esc(label)}</button>` : `<span class="paytag ${ps}">${esc(label)}</span>`;
    return `<li class="entry"><button class="entry-main" data-act="openCard" data-cid="${esc(c.id)}" data-round="${cur}" data-gid="${esc(r.gid)}"><span class="entry-name">${esc(r.golfer.name)}<span class="rcells">${roundCells(c, r)}</span></span><span class="entry-score ${r.count ? '' : 'dim'}">${r.count ? esc(monthText(r, c)) + (monthUnit(c) ? `<small>${monthUnit(c)}</small>` : '') : 'No total'}</span></button>${pay}</li>`;
  }).join('') + '</ul>';
  return h;
}
function boardHtml(c, lb){
  const rs = compRounds(c); const sel = S.boardSel;
  let h = rs.length > 1 ? `<div class="bsel"><button data-act="boardSel" data-v="month" aria-pressed="${sel === 'month'}">Month</button>${rs.map(r => `<button data-act="boardSel" data-v="${r.n}" aria-pressed="${String(sel) === String(r.n)}">R${r.n}</button>`).join('')}</div>` : '';
  if (sel !== 'month' && rs.length > 1) return h + roundBoardHtml(c, Number(sel));
  return h + monthListHtml(c, lb) + (lb.ranked.length ? `<button class="btn block" style="margin-top:12px" data-act="shareTable" data-id="${esc(c.id)}">${ICONS.share}Share the table</button>` : '');
}
function monthListHtml(c, lb){
  const rs = compRounds(c);
  if (!lb.all.length) return '<div class="empty"><p class="hint">The table fills in as marked cards come in.</p></div>';
  const fin = c.status === 'final';
  const head = `<div class="lb-head"><span>Pos</span><span>Golfer</span><span>${rs.length > 1 ? 'Best ' + compBest(c) : 'Score'}</span><span>League</span></div>`;
  const rows = lb.ranked.map(r => {
    const tag = r.pos === 1 ? (fin ? 'Winner' : 'Leading') : r.pos === 2 ? 'Runner-up' : '';
    const note = r.count < compBest(c) ? `${r.count} of ${compBest(c)} rounds` : r.onCb ? 'on countback' : r.tied ? 'tied' : '';
    return `<li class="lb-row ${r.pos === 1 ? 'first' : ''} ${r.gid === S.myGid ? 'me' : ''}"><span class="lb-pos">${r.tied ? 'T' : ''}${r.pos}</span><button class="lb-name" data-act="openPlayer" data-id="${esc(r.gid)}">${esc(r.golfer.name)}${rs.length > 1 ? `<span class="rcells">${roundCells(c, r)}</span>` : ''}${note ? `<small>${note}</small>` : ''}${tag ? `<span class="tag">${tag}</span>` : ''}</button><span class="lb-score">${esc(monthText(r, c))}<small>${monthUnit(c)}</small></span><span class="lb-pts"><b>${r.points} pt${r.points === 1 ? '' : 's'}</b>${r.prize > 0.004 ? euro(r.prize) : ''}</span></li>`;
  }).join('');
  const rest = lb.rest.map(r => `<li class="lb-row lb-rest"><span class="lb-pos">–</span><button class="lb-name" data-act="openPlayer" data-id="${esc(r.gid)}">${esc(r.golfer.name)}<small>${esc(r.status)}</small></button><span class="lb-score"></span><span class="lb-pts"><b>${r.points} pt${r.points === 1 ? '' : 's'}</b></span></li>`).join('');
  const mixNote = lb.mode && lb.mode.mixed ? `<p class="hint" style="margin-top:10px">Rounds use different formats, so this table adds up Stableford points from each golfer's best ${compBest(c)} cards.</p>` : '';
  const note = mixNote + (fin ? '' : `<p class="hint" style="margin-top:10px">Provisional. Only complete cards signed by a marker count. Golfers with fewer than ${compBest(c)} counting cards rank below those with ${compBest(c)}. League points are added when the organiser finalises the month.</p>`);
  return `<ul class="list">${head}${rows}${rest}</ul>${note}`;
}
function roundBoardHtml(c, n){
  const rb = roundBoard(c, n); const lb = leaderboard(c); const rc = rcfg(c, n); const r = compRounds(c).find(x => x.n === n);
  const info = `<p class="hint" style="margin-bottom:10px">Round ${n}${r ? ' · ' + esc(roundLabel(r)) : ''} · ${esc((FORMATS[rc.format] || FORMATS.stableford).name)} · ${rc.holes.length} holes · ${esc((TEES[rc.tee] || TEES.white).name)} tees</p>`;
  const head = `<div class="lb-head"><span>Pos</span><span>Golfer</span><span>Score</span><span>Month</span></div>`;
  const rows = rb.ranked.map(sc => { const row = lb.all.find(r => r.gid === sc.gid); const counts = row && row.countedNs.has(n);
    return `<li class="lb-row ${sc.pos === 1 ? 'first' : ''}"><span class="lb-pos">${sc.tied ? 'T' : ''}${sc.pos}</span><button class="lb-name" data-act="openCard" data-cid="${esc(c.id)}" data-round="${n}" data-gid="${esc(sc.gid)}">${esc(sc.golfer.name)}<small>Marker ${esc(markerName(sc.card))}${cardStarted(sc.card) ? ' · started ' + esc(whenText(sc.card.startedAt)) : ''}${sc.onCb ? ' · on countback' : ''}</small></button><span class="lb-score">${esc(cardValueText(sc))}<small>${unitFor(rc.format)}</small></span><span class="lb-pts"><b>${counts ? 'Counts' : 'Dropped'}</b></span></li>`; }).join('');
  const rest = rb.rest.map(sc => `<li class="lb-row lb-rest"><span class="lb-pos">–</span><button class="lb-name" data-act="openCard" data-cid="${esc(c.id)}" data-round="${n}" data-gid="${esc(sc.gid)}">${esc(sc.golfer.name)}<small>${esc(cardStatus(sc))}</small></button><span class="lb-score"></span><span class="lb-pts"></span></li>`).join('');
  return `${info}<ul class="list">${head}${rows}${rest}</ul>`;
}

/* ----- Scorecard ----- */
function viewCard(){
  const {cid, round, gid} = S.card; const c = D.comps[cid]; const g = D.golfers[gid];
  if (!c || !g) { S.card = null; return mainHtml(); }
  const sc = scoreCard(c, round, gid); const fin = c.status === 'final';
  const mine = gid === S.myGid && !S.isAdmin;
  const W = !fin && canEnter(cid, round, gid);
  const rc = sc.rc; const fmt = rc.format;
  if (!rc.holes.includes(S.activeHole)) S.activeHole = rc.holes.find(h => !(sc.card && sc.card.scores && sc.card.scores[h] !== undefined)) || rc.holes[0];
  const resHead = fmt === 'stableford' ? 'Pts' : fmt === 'medal' ? 'Nett' : fmt === 'parbogey' ? '±' : 'vs Par';
  const t = g.gender === 'L' ? RED : (TEES[rc.tee] || TEES.white); const rs = compRounds(c);
  let h = backBtn('Back', 'closeCard');
  if (rs.length > 1) h += `<div class="bsel rtabs">${rs.map(r => `<button data-act="cardRound" data-v="${r.n}" aria-pressed="${r.n === round}">R${r.n}<small>${esc(shortRange(r))}</small></button>`).join('')}</div>`;
  h += `<div class="card-head"><div><span class="eyebrow">${g.gender === 'L' ? "Ladies' card" : "Men's card"} · ${t.name} tees · Round ${round}</span><h1 class="card-name">${esc(g.name)}</h1><p class="hint">Hcp ${fmtHi(cardHi(sc.card, g))} · ${rc.holes.length} holes · ${esc((FORMATS[fmt]||FORMATS.stableford).name)}</p></div>
    ${S.isAdmin && !fin ? `<button class="shotsbtn" data-act="editShots"><b>${sc.total}</b><span>Shots ✎</span></button>` : `<div class="shotsbtn" style="cursor:default"><b>${sc.total}</b><span>Shots</span></div>`}</div>`;
  // Marker: anyone who signed the paper card. The player adds their name and ticks that it's signed.
  let mk = `<div class="marker ${sc.marked ? 'ok' : sc.filled ? 'warn' : ''}"><span><b>${esc(signText(sc.card))}</b></span>`;
  if (W) mk += `<label class="field" style="margin:8px 0 0"><span>Marker's name</span><input type="text" id="markerName" maxlength="60" autocomplete="off" list="markerNames" value="${esc(markerName(sc.card))}" placeholder="Who marked the card?"></label><datalist id="markerNames">${sortedGolfers().filter(x => x.id !== gid).map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
    <label class="signchk"><input type="checkbox" id="signedChk" ${isSigned(sc.card) ? 'checked' : ''}><span>${mine ? 'My marker has signed my card' : 'The marker has signed this card'}</span></label>`;
  if (cardStarted(sc.card)) mk += `<small class="timing">Started ${esc(whenText(sc.card.startedAt))} · ${cardLocked(sc.card) ? 'locked at midnight' : 'enter by ' + esc(deadlineText(sc.card))}</small>`;
  h += mk + '</div>';
  if (mine && !fin && canStart(cid, round)) h += `<div class="startbox"><p><b>Start your round before you tee off.</b> You get one round this weekend. Enter it and tick it as signed by midnight that day, or it doesn't count.</p><button class="btn primary block big" data-act="startRound" data-cid="${esc(cid)}" data-round="${round}">Start my round</button></div>`;
  else if (mine && W && !sc.marked) h += `<p class="hint" style="margin:-4px 0 12px">Your card counts once all ${rc.holes.length} holes are in and it's ticked as signed, by ${esc(deadlineText(sc.card))}. Then send the organiser a photo of your signed card.</p>`;
  else if (!W && !fin && !S.isAdmin && mine) h += `<p class="hint" style="margin:-4px 0 12px">${cardLocked(sc.card) ? (sc.valid ? 'Locked at midnight. This card counts.' : "Locked at midnight. It wasn't entered and signed in time, so it doesn't count.") : !entryOf(cid, S.myGid) ? 'Enter this month to add your card.' : 'This round is closed. Cards can be entered Friday to Sunday.'}</p>`;
  if (gid === S.myGid && !S.isAdmin && cardStarted(sc.card)) h += `<button class="btn block" style="margin:-4px 0 14px" data-act="photoCard" data-cid="${esc(cid)}" data-round="${round}">${ICONS.camera}Send a photo of my card to the organiser</button>`;
  if (S.isAdmin && !fin && sc.card) h += `<button class="textbtn" style="margin:-6px 0 10px" data-act="delCard">Delete this card (lets ${esc(firstName(g.name))} start the round again)</button>`;
  const nettRel = sc.runNett - sc.runPar;
  const cells = [['Gross', sc.gross || '–', '']];
  if (fmt === 'stableford') cells.push(['Nett', sc.filled ? sc.runNett : '–', ''], ['Thru', sc.filled, ''], ['Points', sc.pts, '']);
  else if (fmt === 'medal') cells.push(['Nett', sc.filled ? sc.runNett : '–', ''], ['To par', sc.filled ? toPar(nettRel) : '–', nettRel < 0 ? 'under' : ''], ['Thru', sc.filled, '']);
  else if (fmt === 'gross') cells.push(['To par', sc.filled ? toPar(sc.gross - sc.runPar) : '–', sc.gross - sc.runPar < 0 ? 'under' : ''], ['Points', sc.pts, ''], ['Thru', sc.filled, '']);
  else cells.push(['Nett', sc.filled ? sc.runNett : '–', ''], ['Result', pbStr(sc.pb), ''], ['Thru', sc.filled, '']);
  h += `<dl class="totals">${cells.map(([l,v,cl]) => `<div><dt>${l}</dt><dd class="${cl}">${esc(String(v))}</dd></div>`).join('')}</dl>`;
  if (sc.nr) h += `<p class="hint" style="margin-bottom:10px">A pick-up in stroke play is a no return (NR) for this round.</p>`;
  const rowHtml = r => {
    let cls = 'empty', val = '–';
    if (r.g === 'P') { cls = 'pickup'; val = 'P'; }
    else if (typeof r.g === 'number') { const d = r.g - r.par; cls = d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double'; val = r.g; }
    let res = '', rc = '';
    if (r.g !== undefined) {
      if (fmt === 'stableford') { res = r.pts; if (r.pts === 0) rc = 'zero'; }
      else if (fmt === 'medal') res = r.nett == null ? '–' : r.nett;
      else if (fmt === 'parbogey') res = r.pb > 0 ? '+' : r.pb === 0 ? '0' : '−';
      else res = typeof r.g === 'number' ? toPar(r.g - r.par) : '–';
    }
    const dots = r.shots > 0 ? '•'.repeat(r.shots) : r.shots < 0 ? 'gives ' + (-r.shots) : '';
    return `<button class="hole ${W && S.activeHole === r.h ? 'active' : ''}" data-act="hole" data-h="${r.h}" ${W ? '' : 'disabled'} aria-label="Hole ${r.h}, par ${r.par}, score ${val}"><span class="h-num">${r.h}</span><span class="h-info"><span><b>Par ${r.par}</b> · SI ${r.si}</span><span class="dots">${dots}</span></span><span class="h-score"><span class="sc ${cls}">${val}</span></span><span class="h-res ${rc}">${esc(String(res))}</span></button>`;
  };
  const sub = (label, rows) => {
    const gr = rows.reduce((a,r) => a + (typeof r.g === 'number' ? r.g : 0), 0); let res = '';
    if (fmt === 'stableford') res = rows.reduce((a,r) => a + (r.pts || 0), 0);
    else if (fmt === 'medal') res = rows.reduce((a,r) => a + (r.nett || 0), 0);
    else if (fmt === 'parbogey') res = pbStr(rows.reduce((a,r) => a + (r.pb || 0), 0));
    return `<div class="subtotal"><span class="st-label">${label} · Par ${rows.reduce((a,r)=>a+r.par,0)}</span><span class="st-val">${gr || '–'}</span><span class="st-val">${esc(String(res))}</span></div>`;
  };
  const out = sc.rows.filter(r => r.h <= 9), inn = sc.rows.filter(r => r.h > 9);
  h += `<div class="holes"><div class="hole-head"><span>Hole</span><span>Par · SI · Shots</span><span>Score</span><span>${resHead}</span></div>`;
  h += out.map(rowHtml).join('') + (out.length && inn.length ? sub('Out', out) : '') + inn.map(rowHtml).join('') + (out.length && inn.length ? sub('In', inn) : '') + sub('Total', sc.rows) + '</div>';
  h += `<p class="hint lockednote">Circle = birdie, double circle = eagle, square = bogey, double square = double bogey or worse. P = picked up.</p>`;
  if (W) {
    const r = sc.rows.find(x => x.h === S.activeHole) || sc.rows[0];
    h += `<div class="keypad"><div class="wrap"><div class="kp-label"><b>Hole ${r.h}</b><span>Par ${r.par} · ${r.shots} shot${Math.abs(r.shots) === 1 ? '' : 's'}</span></div><div class="kp-grid">${range(1,12).map(n => `<button data-act="key" data-v="${n}" class="${n === r.par ? 'par' : ''}" aria-label="${n}">${n}</button>`).join('')}<button class="fn" data-act="key" data-v="P" aria-label="Picked up">P</button><button class="fn" data-act="key" data-v="X" aria-label="Clear hole">Clear</button></div></div></div>`;
  }
  return h;
}

/* ----- League, golfers, stats ----- */
function seasonSelect(){ const ys = seasonList(); return `<select id="season" aria-label="Season">${ys.map(y => `<option value="${y}" ${S.season === y ? 'selected' : ''}>${y}</option>`).join('')}<option value="all" ${S.season === 'all' ? 'selected' : ''}>All time</option></select>`; }
function viewTable(){
  let h = `<div class="pagehead"><div><span class="eyebrow">Pot of Gold</span><h1>Table</h1></div>${S.leagueTab === 'year' ? seasonSelect() : ''}</div>`;
  h += `<div class="seg" role="group" aria-label="Table" style="margin-top:0"><button data-act="leagueTab" data-v="month" aria-pressed="${S.leagueTab !== 'year'}">This month</button><button data-act="leagueTab" data-v="year" aria-pressed="${S.leagueTab === 'year'}">Year</button></div>`;
  return h + (S.leagueTab === 'year' ? yearTableHtml() : monthTableHtml());
}
function monthTableHtml(){
  const comps = Object.values(D.comps).sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  if (!comps.length) return `<section class="empty"><p class="hint">No months yet. The monthly table appears once the organiser creates a month.</p></section>`;
  let c = D.comps[S.leagueMonth]; if (!c) c = currentComp() || comps[0];
  const lb = leaderboard(c); const rs = compRounds(c); const fin = c.status === 'final';
  const played = rs.filter(r => roundState(r) !== 'upcoming').length;
  let h = `<div class="mt-head"><label class="field" style="margin:0"><span>Month</span><select id="leagueMonth">${comps.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}${x.status === 'final' ? '' : ' (open)'}</option>`).join('')}</select></label>
    <div class="mt-meta"><span class="pill ${fin ? 'final' : 'open'}">${fin ? 'Final' : 'Provisional'}</span><span class="hint">${rs.length > 1 ? `${played} of ${rs.length} rounds started · best ${compBest(c)} count` : esc((FORMATS[rcfg(c, rs[0].n).format] || FORMATS.stableford).short)}${lb.mode.mixed ? ' · Stableford points' : ''}</span></div>
    <p class="potline left">${esc(potLine(c))}</p></div>`;
  h += boardHtml(c, lb);
  if (S.isAdmin) h += `<button class="btn block" style="margin-top:10px" data-act="openComp" data-id="${esc(c.id)}">Manage ${esc(c.name)}</button>`;
  return h;
}
function yearTableHtml(){
  const rows = league(S.season); const k = cfg();
  let h = `<div class="pointskey">${k.points.map((p,i) => `<span class="chip">${ord(i+1)} · ${p} pts</span>`).join('')}<span class="chip">Played · ${k.entryPoint} pt</span></div>`;
  const open = Object.values(D.comps).filter(c => c.status !== 'final' && inSeason(c, S.season));
  if (!rows.length) return h + `<section class="empty"><p class="hint">No finalised months ${S.season === 'all' ? 'yet' : 'in ' + S.season + ' yet'}. Points are added to the year table when a month is finalised.</p></section>`;
  h += `<ul class="list"><li class="lg-head"><span>Pos</span><span>Golfer</span><span>P</span><span>W</span><span>Pts</span></li>` + rows.map(r => {
    const p = D.golfers[r.id]; const tied = rows.filter(x => x.pos === r.pos).length > 1;
    return `<li><button class="lg-row ${r.pos === 1 ? 'p1' : ''}" data-act="openPlayer" data-id="${esc(r.id)}"><span class="lb-pos">${tied ? 'T' : ''}${r.pos}</span><span class="lg-name">${esc(p.name)}<small>${r.seconds ? r.seconds + '× runner-up · ' : ''}${r.won > 0.004 ? euro(r.won) + ' won' : 'Hcp ' + fmtHi(curHcp(p.id))}</small></span><span class="lg-n">${r.played}</span><span class="lg-n">${r.wins}</span><span class="lg-pts">${r.pts}</span></button></li>`;
  }).join('') + '</ul>';
  if (open.length) h += `<p class="hint" style="margin-top:10px">${open.map(c => esc(c.name)).join(' and ')} ${open.length === 1 ? 'is' : 'are'} still open. ${open.length === 1 ? 'Its' : 'Their'} points are added when finalised; see This month for where things stand.</p>`;
  // month-by-month grid
  const months = Object.values(D.comps).filter(c => c.status === 'final' && inSeason(c, S.season)).sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  const pts = {}; months.forEach(c => leaderboard(c).all.forEach(r => { (pts[r.gid] || (pts[r.gid] = {}))[c.id] = r; }));
  h += `<div class="sec-head"><h2>Points by month</h2></div><div class="tscroll"><table class="mgrid"><thead><tr><th>Golfer</th>${months.map(c => `<th title="${esc(c.name)}">${esc(dParts(c.date).mon)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(D.golfers[r.id].name)}</td>${months.map(c => { const x = pts[r.id] && pts[r.id][c.id]; return `<td class="${x && x.pos === 1 ? 'win' : x && x.pos === 2 ? 'second' : ''}">${x ? x.points : '–'}</td>`; }).join('')}<td class="tot">${r.pts}</td></tr>`).join('')}</tbody></table></div>`;
  h += `<p class="hint" style="margin-top:10px">Gold = monthly winner, outlined = runner-up. P = months played, W = wins. Tap a golfer above for their stats.</p>`;
  return h;
}
function viewGolfers(){
  const ps = sortedGolfers(); const A = S.isAdmin;
  let h = `<div class="pagehead"><div><span class="eyebrow">${ps.length} golfer${ps.length === 1 ? '' : 's'}</span><h1>Golfers</h1></div><span style="display:flex;gap:8px"><button class="btn small" data-act="invite">${ICONS.share}Invite</button>${A ? '<button class="btn small primary" data-act="newGolfer">+ Add</button>' : ''}</span></div>`;
  const reqs = A ? Object.entries(D.requests || {}).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0)) : [];
  if (reqs.length) h += `<section class="approvals joinreqs"><span class="eyebrow">Asking to join (${reqs.length})</span><ul class="grp">${reqs.map(([email, r]) => `<li><span class="avatar sm">${esc(initials(r.name))}</span><span class="grp-main"><b>${esc(r.name)}</b><small>${esc(email)}${r.hi != null ? ' · Hcp ' + esc(fmtHi(r.hi)) : ''}</small></span><button class="btn small primary" data-act="reviewJoin" data-email="${esc(email)}">Review</button></li>`).join('')}</ul></section>`;
  if (!ps.length) return h + `<section class="empty"><p class="hint">${A ? 'Add each golfer with their handicap and the email they sign in with, or tap Invite to share the app link. People who sign in with an email that isn\'t on the list can ask to join, and you let them in here.' : 'No golfers yet.'}</p></section>`;
  h += `<div class="seg" role="group" aria-label="View" style="margin-top:0"><button data-act="golferTab" data-v="list" aria-pressed="${S.golferTab !== 'hcp'}">Golfers</button><button data-act="golferTab" data-v="hcp" aria-pressed="${S.golferTab === 'hcp'}">Handicaps</button></div>`;
  if (S.golferTab === 'hcp') return h + handicapsHtml(ps);
  const lg = league(S.season); const emails = golferEmails(); const L = hcpLedger();
  h += '<ul class="list">' + ps.map(p => { const r = lg.find(x => x.id === p.id); const l = L[p.id]; const last = l && l.events[l.events.length - 1];
    const sub = A ? (emails[p.id] ? esc(emails[p.id]) : '<span class="warntext">No email, so they can\'t sign in</span>') : r ? `${ord(r.pos)} in the ${S.season === 'all' ? 'all-time' : S.season} league · ${r.pts} pts` : 'No league points yet';
    return `<li><button class="row" data-act="openPlayer" data-id="${esc(p.id)}"><span class="avatar">${esc(initials(p.name))}</span><span class="row-main"><span class="row-title">${esc(p.name)}${p.id === S.myGid ? ' (you)' : ''}</span><span class="row-sub">${sub}</span></span><span class="hi">${fmtHi(curHcp(p.id))}<small>${last ? `<span class="${last.change < 0 ? 'cut' : 'rise'}">${fmtChange(last.change)}</span>` : 'Hcp'}</small></span></button></li>`; }).join('') + '</ul>';
  return h;
}
function handicapsHtml(ps){
  const R = hcpRules(); const L = hcpLedger();
  const BL = bandLabels(R);
  let h = `<div class="panel hcprules"><table class="bandtbl"><thead><tr><th>Handicap</th><th>Winner</th><th>Runner-up</th></tr></thead><tbody>${BL.map((l, i) => `<tr><td>${esc(l)}</td><td class="cut">cut ${R.win[i]}</td><td class="cut">cut ${R.second[i]}</td></tr>`).join('')}</tbody></table>
    <p><b class="rise">+${R.rise}</b> after ${R.after} months played without a cut.</p><p class="hint">The band is the golfer's competition handicap going into the month. Changes are made when the organiser finalises a month. Cards are played off the handicap on the day they're marked.</p></div>`;
  h += `<ul class="list" style="margin-top:12px"><li class="hc-head"><span>Golfer</span><span>Hcp</span><span>Last change</span><span>Rises</span></li>` + ps.map(p => { const l = L[p.id]; if (!l) return '';
    const last = l.events[l.events.length - 1]; const due = l.base !== null && l.toRise === 1;
    return `<li><button class="hc-row" data-act="openPlayer" data-id="${esc(p.id)}"><span class="hc-name">${esc(p.name)}<small>Started ${fmtHi(l.base)}</small></span><span class="hc-now">${fmtHi(l.current)}</span><span class="hc-last">${last ? `<b class="${last.change < 0 ? 'cut' : 'rise'}">${fmtChange(last.change)}</b><small>${esc(dParts(last.date).mon)} ${dParts(last.date).year}</small>` : '<small>None yet</small>'}</span><span class="hc-due ${due ? 'soon' : ''}">${l.base === null ? '–' : esc(riseText(p.id, true))}</span></button></li>`; }).join('') + '</ul>';
  return h;
}
function golferEmails(){ const out = {}; Object.entries(D.members || {}).forEach(([email, m]) => { if (m && m.golferId) out[m.golferId] = email; }); return out; }
function hcpPanel(gid){
  const l = hcpLedger()[gid]; if (!l || l.base === null) return '';
  const ev = l.events.slice().reverse();
  return `<section class="panel hcp-panel"><div class="hcp-top"><div><span class="label">Competition handicap</span><b class="hcp-big">${fmtHi(l.current)}</b></div><div class="hcp-side"><span class="label">Started at</span><b>${fmtHi(l.base)}</b></div></div>
    <p class="hcp-due ${l.toRise === 1 ? 'soon' : ''}">${esc(riseText(gid))}</p>
    ${ev.length ? `<ul class="hcp-hist">${ev.slice(0, 8).map(e => `<li><span class="${e.change < 0 ? 'cut' : 'rise'}">${fmtChange(e.change)}</span><span>${esc(e.reason)}</span><span>${fmtHi(e.before)} → ${fmtHi(e.after)}</span></li>`).join('')}</ul>` : '<p class="hint">No changes yet.</p>'}</section>`;
}
function viewPlayer(){
  const p = D.golfers[S.playerId]; if (!p) { S.playerId = null; return viewGolfers(); }
  let h = backBtn('All golfers', 'closePlayer');
  h += `<div class="phead"><span class="avatar">${esc(initials(p.name))}</span><div><h1>${esc(p.name)}</h1><p>Handicap ${fmtHi(curHcp(p.id))} · ${p.gender === 'L' ? "Ladies'" : "Men's"} card</p></div></div>`;
  h += hcpPanel(p.id);
  return h + playerStatsHtml(p, S.isAdmin);
}
function playerStatsHtml(p, canEdit){
  const st = playerStats(p.id, S.season); const lg = league(S.season).find(r => r.id === p.id);
  let h = `<div class="pagehead" style="margin:${p.id === S.myGid && S.view === 'me' ? 28 : 0}px 0 10px"><span class="label">Stats for</span><span style="display:flex;gap:8px">${canEdit ? `<button class="btn small" data-act="editGolfer" data-id="${esc(p.id)}">Edit</button>` : ''}${seasonSelect()}</span></div>`;
  h += `<dl class="tiles"><div class="tile"><dt>League</dt><dd>${lg ? lg.pts : 0}<small>${lg ? ord(lg.pos) : ''}</small></dd></div><div class="tile"><dt>Months</dt><dd>${lg ? lg.played : 0}</dd></div><div class="tile"><dt>Wins</dt><dd>${lg ? lg.wins : 0}</dd></div><div class="tile"><dt>Runner-up</dt><dd>${lg ? lg.seconds : 0}</dd></div><div class="tile"><dt>Cards</dt><dd>${st.cards}</dd></div><div class="tile"><dt>Winnings</dt><dd>${euro(lg ? lg.won : 0)}</dd></div></dl>`;
  if (!st.holes) return h + `<section class="empty" style="margin-top:16px"><p class="hint">No scores ${S.season === 'all' ? 'yet' : 'in ' + S.season + ' yet'}.</p></section>`;
  const C = st.counts, tot = st.holes;
  const segs = [['eagle','Eagle or better','var(--gold)','eagle','3'],['birdie','Birdies','var(--birdie)','birdie','3'],['par','Pars','var(--fairway)','par','4'],['bogey','Bogeys','var(--bogey)','bogey','5'],['double','Double bogey +','var(--double)','double','6'],['pickup','Pick-ups','var(--line)','pickup','P']];
  h += `<div class="sec-head"><h2>Scoring · ${tot} holes</h2></div><div class="panel"><div class="bar" role="img" aria-label="Score breakdown">${segs.filter(s => C[s[0]]).map(s => `<span style="width:${(C[s[0]]/tot*100).toFixed(2)}%;background:${s[2]}"></span>`).join('')}</div><ul class="legend">${segs.filter(s => s[0] !== 'pickup' || C.pickup).map(s => `<li><span class="sw"><span class="sc ${s[3]}">${s[4]}</span></span><span>${s[1]}</span><span class="cnt">${C[s[0]]}</span><span class="pct">${Math.round(C[s[0]]/tot*100)}%</span></li>`).join('')}</ul></div>`;
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
  h += `<div class="sec-head"><h2>Average score</h2></div><div class="panel"><dl class="kv">${[3,4,5].map(pp => { const v = avg(st.byPar[pp]||[]); return `<div><dt>Par ${pp}s</dt><dd>${v === null ? '–' : v.toFixed(2)}${v === null ? '' : `<small>${toParDec(v - pp)}</small>`}</dd></div>`; }).join('')}</dl></div>`;
  if (st.bestHole) h += `<div class="sec-head"><h2>Holes</h2></div><div class="duo"><div class="panel"><h3>Best hole</h3><p>No. ${st.bestHole.h}</p><small>${toParDec(st.bestHole.avg)} on average over ${st.bestHole.n} rounds</small></div>${st.worstHole ? `<div class="panel"><h3>Toughest hole</h3><p>No. ${st.worstHole.h}</p><small>${toParDec(st.worstHole.avg)} on average over ${st.worstHole.n} rounds</small></div>` : ''}</div>`;
  const bk = Object.keys(st.bests).sort((a,b) => b - a);
  if (bk.length) h += `<div class="sec-head"><h2>Personal bests</h2></div><div class="panel">${bk.map(n => { const b = st.bests[n]; return `<div class="pb-row"><span class="label">${n} holes</span><span><b>${b.pts}</b><small>pts</small></span><span><b>${b.gross == null ? '–' : b.gross}</b><small>gross</small></span><span><b>${b.nett == null ? '–' : b.nett}</b><small>nett</small></span></div>`; }).join('')}</div>`;
  if (st.months.length) h += `<div class="sec-head"><h2>Months</h2></div><ul class="list">${st.months.map(m => { const c = m.comp, r = m.row, d = dParts(c.date), fin = c.status === 'final'; const place = r.pos ? (m.tied ? 'T' + r.pos : ord(r.pos)) : '–';
    return `<li><button class="row" data-act="openComp" data-id="${esc(c.id)}"><span class="row-date"><b>${d.day}</b>${d.mon}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${r.count ? esc(monthText(r, c)) + ' ' + monthUnit(c) + ` from ${r.count} card${r.count === 1 ? '' : 's'}` : 'No counting cards'}${fin ? ` · ${r.points} league pt${r.points === 1 ? '' : 's'}` : ''}${r.prize > 0.004 ? ' · ' + euro(r.prize) : ''}</span></span><span class="pill ${fin ? 'final' : 'open'}">${fin ? place : 'Open'}</span></button></li>`; }).join('')}</ul>`;
  return h;
}

/* ----- Me: this month's cards and payment, handicap, stats, account ----- */
function viewMe(){
  const p = D.golfers[S.myGid]; if (!p) return viewHome();
  let h = `<div class="phead"><span class="avatar">${esc(initials(p.name))}</span><div><h1>${esc(p.name)}</h1><p>Handicap ${fmtHi(curHcp(p.id))} · ${p.gender === 'L' ? "Ladies'" : "Men's"} card</p></div></div>`;
  const c = currentComp(); if (c) h += meMonthHtml(c);
  h += hcpPanel(p.id);
  h += playerStatsHtml(p, S.isAdmin);
  const iosTip = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
  h += `<div class="sec-head"><h2>Account</h2></div><div class="panel stack"><p class="hint" style="margin:0">Signed in as <b>${esc(S.user.email)}</b></p>
    ${S.installEvt ? '<button class="btn primary block" data-act="install">Install the app</button>' : iosTip ? '<p class="notebox" style="margin:0">To install on iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>' : ''}
    ${S.adminRole && !S.isAdmin ? '<button class="btn primary block" data-act="organiserView">Back to organiser view</button>' : ''}
    <button class="btn block danger" data-act="signout">Sign out</button></div>`;
  return h;
}
function meMonthHtml(c){
  const me = S.myGid; const e = entryOf(c.id, me); const cid = esc(c.id); const ps = payState(e);
  const pay = !e ? '' : ps === 'paid' ? `<span class="pill final">Paid · ${esc(METHODS[e.method] || 'Paid')}</span>` : `<button class="paytag ${ps}" data-act="pay" data-id="${esc(c.id + '/' + me)}">${ps === 'claimed' ? 'Checking' : 'Pay ' + euro(compFee(c))}</button>`;
  let h = `<div class="sec-head" style="margin-top:4px"><h2>${esc(c.name)}</h2>${pay}</div>`;
  if (!e) return h + `<div class="panel stack"><p class="hint" style="margin:0">You haven't entered this month yet.</p><button class="btn primary block" data-act="selfEnter" data-cid="${cid}">Enter ${esc(c.name)}</button></div>`;
  const row = leaderboard(c).all.find(r => r.gid === me);
  h += '<ul class="list">' + compRounds(c).map(r => {
    const sc = scoreCard(c, r.n, me); const st = roundState(r); const u = unitFor(sc.rc.format);
    const late = cardLocked(sc.card) && !sc.valid;
    const sub = st === 'upcoming' ? `Opens ${roundLabel(r)}` : late ? "Not entered and signed by midnight · doesn't count" : !sc.filled ? (st === 'open' ? (cardStarted(sc.card) ? `Started ${whenText(sc.card.startedAt)} · no scores yet` : 'Open now · tap Start my round before you tee off') : `${shortRange(r)} · not played`)
      : `${sc.complete ? (sc.nr ? 'NR' : cardValueText(sc) + (u ? ' ' + u : '')) : 'Thru ' + sc.filled} · ${sc.marked ? 'signed by ' + markerName(sc.card) : 'not ticked as signed'}`;
    const counted = row && row.countedNs.has(r.n); const tag = counted ? '<span class="pill open">Counts</span>' : sc.complete && sc.marked && !sc.nr ? '<span class="pill final">Dropped</span>' : late ? '<span class="pill final">Missed</span>' : st === 'open' ? '<span class="pill open">Open</span>' : '';
    const inner = `<span class="row-date"><b>R${r.n}</b>${esc(dParts(r.from).mon)}</span><span class="row-main"><span class="row-title">Round ${r.n}</span><span class="row-sub">${esc(sub)}</span></span>${tag}`;
    return `<li>${sc.filled || cardStarted(sc.card) || st === 'open' ? `<button class="row" data-act="openCard" data-cid="${cid}" data-round="${r.n}" data-gid="${esc(me)}">${inner}</button>` : `<div class="row">${inner}</div>`}</li>`;
  }).join('') + '</ul>';
  return h;
}

/* ----- Admin ----- */
function adminUnlocked(){ const a = D.adminCode; if (!a || !a.hash) return false; return S.adminHash === a.hash; }
async function sha(text){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join(''); }
function randHex(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2,'0')).join(''); }
function rememberAdmin(h){ try { if (h && S.pinRemember) localStorage.setItem('rgc-admin', JSON.stringify({h, until: Date.now() + 30*864e5})); else localStorage.removeItem('rgc-admin'); } catch (_) {} }
function restoreAdmin(){ const a = D.adminCode; if (!a || !a.hash || S.adminHash === a.hash) return; try { const r = JSON.parse(localStorage.getItem('rgc-admin') || 'null'); if (r && r.h === a.hash && r.until > Date.now()) S.adminHash = r.h; } catch (_) {} }
function viewLock(){
  const a = D.adminCode; const has = !!(a && a.hash); let P = S.pin;
  if (!P) P = S.pin = {mode: has && !S.changing ? 'unlock' : 'create', val:'', first:'', err:'', fails:0, until:0};
  if (P.mode === 'unlock' && !has) { P.mode = 'create'; P.val = ''; }
  if (P.mode !== 'unlock' && has && !S.changing) { P.mode = 'unlock'; P.val = ''; P.first = ''; }
  const titles = {unlock:'Enter admin code', create: S.changing ? 'Choose a new code' : 'Set an admin code', confirm:'Enter it again'};
  const subs = {unlock:'Admin holds the entry fee, Revolut link, prizes, points, organisers and course card.', create: S.changing ? 'Pick 4 to 8 digits. The old code stops working.' : 'Protect the Admin page with a code of 4 to 8 digits.', confirm:'Type the same code again to confirm it.'};
  const n = P.mode === 'unlock' ? (a.len || 4) : P.mode === 'confirm' ? P.first.length : Math.max(4, P.val.length);
  const dots = Array.from({length:n}, (_,i) => `<span class="pdot ${i < P.val.length ? 'on' : ''}"></span>`).join('');
  const keys = '123456789'.split('').map(d => `<button data-act="pin" data-v="${d}">${d}</button>`).join('') + `<button class="fn" data-act="pin" data-v="C">Clear</button><button data-act="pin" data-v="0">0</button><button class="fn" data-act="pin" data-v="B" aria-label="Delete last digit">Delete</button>`;
  return `<section class="lock"><span class="lock-icon">${ICONS.admin}</span><span class="eyebrow">Admin</span><h1>${titles[P.mode]}</h1><p class="hint">${subs[P.mode]}</p><div class="pdots">${dots}</div><p class="pinerr" role="alert">${esc(P.err || '')}</p><div class="pinpad">${keys}</div>
    ${P.mode === 'create' ? `<button class="btn primary block" data-act="pin" data-v="OK" ${P.val.length >= 4 ? '' : 'disabled'}>Continue</button>` : ''}
    ${P.mode === 'unlock' ? `<label class="remember"><input type="checkbox" id="pinRemember" ${S.pinRemember ? 'checked' : ''}>Remember on this device for 30 days</label><button class="textbtn" data-act="resetPin">Forgot the code? Reset it</button>` : ''}
    ${S.changing ? '<button class="textbtn" data-act="cancelPin">Cancel</button>' : ''}</section>`;
}
async function submitPin(){
  const P = S.pin; if (!P || P.busy) return; const a = D.adminCode;
  if (P.mode === 'unlock') {
    if (!a || !a.hash) return;
    P.busy = true; const h = await sha(a.salt + ':' + P.val); P.busy = false;
    if (h === a.hash) { S.adminHash = h; rememberAdmin(h); S.pin = null; toast('Admin unlocked'); }
    else { P.fails = (P.fails || 0) + 1; P.val = ''; P.err = "That code isn't right."; if (P.fails >= 5) { P.fails = 0; P.until = Date.now() + 30000; P.err = 'Too many tries. Wait 30 seconds.'; } }
  } else if (P.mode === 'create') {
    if (P.val.length < 4) { P.err = 'Use at least 4 digits.'; render(); return; }
    P.first = P.val; P.val = ''; P.mode = 'confirm'; P.err = '';
  } else {
    if (P.val !== P.first) { P.mode = 'create'; P.first = ''; P.val = ''; P.err = "Those didn't match. Start again."; }
    else { const salt = randHex(16); P.busy = true; const h = await sha(salt + ':' + P.val); P.busy = false; const changed = S.changing;
      if (await put('config/admin', {salt, hash:h, len:P.val.length, setAt:Date.now()})) { D.adminCode = {salt, hash:h, len:P.val.length}; S.adminHash = h; rememberAdmin(h); S.pin = null; S.changing = false; toast(changed ? 'Admin code changed' : 'Admin code set'); } }
  }
  render();
}
function notifySettingsHtml(){
  const t = notifyTopic();
  if (!t) return `<section class="setup"><div class="sec-head"><h2>Phone notifications</h2></div><div class="panel stack"><p class="hint" style="margin:0">Get a notification on your phone when someone asks to join, enters, says they've paid, starts a round or finishes a card. It uses ntfy, a free notification app for iPhone and Android.</p><button class="btn primary block" data-act="notifyOn">Turn on notifications</button></div></section>`;
  return `<section class="setup"><div class="sec-head"><h2>Phone notifications</h2><span class="pill open">On</span></div><div class="panel stack">
    <ol class="nsteps"><li>Install <b>ntfy</b> from the App Store or Google Play (it's free).</li><li>Open it, tap <b>+</b> and enter this channel name. Leave the server as ntfy.sh.</li></ol>
    <div class="refrow"><code>${esc(t)}</code><button class="btn small" data-act="copy" data-text="${esc(t)}">Copy</button></div>
    <ol class="nsteps" start="3"><li>Tap <b>Subscribe</b>, then <b>Send test</b> below.</li></ol>
    <div class="btnrow" style="margin-top:0"><button class="btn" data-act="notifyTest">Send test</button><button class="btn danger" data-act="notifyOff">Turn off</button></div>
    <p class="hint" style="margin:0">Keep the channel name to yourself: anyone who has it can see the notifications. Your own actions don't send notifications.</p></div></section>`;
}
function viewAdmin(){
  if (!S.loaded.adminCode) return '<p class="loading">Loading…</p>';
  if (!adminUnlocked() || S.changing) return viewLock();
  const k = cfg(); const c = k.course;
  const siOk = arr => new Set(arr).size === 18 && arr.every(x => x >= 1 && x <= 18);
  const n = (id, v, extra) => `<input type="number" id="${id}" value="${esc(v)}" ${extra || ''}>`;
  const kittyPct = 100 - k.prize.reduce((a,b)=>a+b,0);
  const admins = (D.admins && D.admins.emails) || [];
  return `<div class="pagehead"><div><span class="eyebrow">Admin</span><h1>Settings</h1></div><button class="btn small" data-act="lockAdmin">Lock</button></div>
  <p class="hint" style="margin:-4px 0 14px">Changes save as you go, and you'll see "Settings saved" each time. The button at the bottom saves everything again if you want to be sure.</p>
  <form id="setupForm" class="setup" onsubmit="return false">
    <section><div class="sec-head" style="margin-top:0"><h2>Entry & payments</h2></div><div class="panel">
      <div class="grid2"><label class="field"><span>Entry fee (€)</span>${n('s-fee', k.fee, 'min="0" step="1"')}</label><label class="field"><span>Revolut username</span><input type="text" id="s-rev" value="${esc(k.revtag)}" placeholder="e.g. johnsmith" autocapitalize="off" autocorrect="off"></label></div>
      <p class="hint">Entries are paid through Revolut only. Golfers get a button for revolut.me/${esc(k.revtag)}, where they can pay in the Revolut app, or by debit card, Apple Pay or Google Pay without a Revolut account. They tap "I've paid" and you confirm it under Payments.</p>
      <p class="hint">For card payments from people without Revolut, turn on Revtag discoverability in your Revolut app's privacy settings. Revolut also limits how much you can receive by card through your link each week (the limit is shown in your Revolut app). Payments from other Revolut users have no limit.</p></div></section>
    <section><div class="sec-head"><h2>Prize money</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Winner %</span>${n('s-p1', k.prize[0] != null ? k.prize[0] : 60)}</label><label class="field"><span>Runner-up %</span>${n('s-p2', k.prize[1] != null ? k.prize[1] : 40)}</label></div>
      <p class="hint">${kittyPct > 0 ? `The other ${kittyPct}% of each pot stays in the kitty.` : kittyPct < 0 ? 'These add up to more than 100%.' : 'The whole pot goes to the top two.'}</p></div></section>
    <section><div class="sec-head"><h2>League points</h2></div><div class="panel"><div class="grid5"><label class="field"><span>1st</span>${n('s-pt1', k.points[0])}</label><label class="field"><span>2nd</span>${n('s-pt2', k.points[1])}</label><label class="field"><span>3rd</span>${n('s-pt3', k.points[2])}</label><label class="field"><span>4th</span>${n('s-pt4', k.points[3])}</label><label class="field"><span>Others</span>${n('s-pte', k.entryPoint)}</label></div><p class="hint">"Others" is the point for entering.</p></div></section>
    <section><div class="sec-head"><h2>New months</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Weekend rounds</span>${n('s-rounds', k.rounds, 'min="1" max="5"')}</label><label class="field"><span>Best cards count</span>${n('s-best', k.best, 'min="1" max="5"')}</label></div><p class="hint">Each round is open Friday to Sunday. One card per golfer per round.</p></div></section>
    <section><div class="sec-head"><h2>Handicap changes</h2></div><div class="panel"><div class="bandedit"><span class="label">Handicap</span><span class="label">Winner cut</span><span class="label">Runner-up cut</span>
        <label class="bandlbl">Under ${n('s-b1', k.bands[0], 'min="0" step="0.1" aria-label="First band ends at"')}</label>${n('s-w1', k.cutWin[0], 'min="0" step="0.1" aria-label="Winner cut, lowest band"')}${n('s-r1', k.cutRun[0], 'min="0" step="0.1" aria-label="Runner-up cut, lowest band"')}
        <label class="bandlbl">${esc(String(k.bands[0]))} to under ${n('s-b2', k.bands[1], 'min="0" step="0.1" aria-label="Second band ends at"')}</label>${n('s-w2', k.cutWin[1], 'min="0" step="0.1" aria-label="Winner cut, middle band"')}${n('s-r2', k.cutRun[1], 'min="0" step="0.1" aria-label="Runner-up cut, middle band"')}
        <span class="bandlbl">${esc(String(k.bands[1]))} and over</span>${n('s-w3', k.cutWin[2], 'min="0" step="0.1" aria-label="Winner cut, highest band"')}${n('s-r3', k.cutRun[2], 'min="0" step="0.1" aria-label="Runner-up cut, highest band"')}</div>
      <div class="grid2" style="margin-top:12px"><label class="field"><span>Rise by</span>${n('s-rb', k.riseBy, 'min="0" step="0.1"')}</label><label class="field"><span>Rise after (months)</span>${n('s-ra', k.riseAfter, 'min="1" step="1"')}</label><label class="field"><span>Highest handicap</span>${n('s-hm', k.hcpMax, 'min="0" step="1"')}</label></div>
      <p class="hint">Applied when a month is finalised. The band is the golfer's competition handicap going into that month, so lower handicaps are cut less. "Rise after" counts months a golfer played without a cut (winning or runner-up). Changing these recalculates everyone's handicap.</p></div></section>
    <section><div class="sec-head"><h2>Handicaps</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Allowance %</span>${n('s-allow', k.allowance, 'min="0" max="100"')}</label><label class="field"><span>Default men's tees</span><select id="s-tee">${Object.entries(TEES).map(([key,t]) => `<option value="${key}" ${k.tee === key ? 'selected' : ''}>${t.name} · ${t.cr} / ${t.slope}</option>`).join('')}</select></label></div>
      <p class="hint">Shots use index × slope ÷ 113 + (rating − par), times the allowance. Ladies use the red tees. Each card keeps the golfer's index from the day it was marked.</p></div></section>
    <section><div class="panel"><details class="course" id="courseDetails" ${S.courseOpen ? 'open' : ''}><summary>Course card: par and stroke index</summary>
      <p class="hint">From the published Rathsallagh scorecard. Check it against the card in the clubhouse.</p>
      <div class="ctable"><table><thead><tr><th>Hole</th><th>Men's par</th><th>Men's SI</th><th>Ladies' par</th><th>Ladies' SI</th></tr></thead><tbody>${range(1,18).map(h => `<tr><td>${h}</td><td>${n('c-pm-'+h, c.parM[h-1])}</td><td>${n('c-sm-'+h, c.siM[h-1])}</td><td>${n('c-pl-'+h, c.parL[h-1])}</td><td>${n('c-sl-'+h, c.siL[h-1])}</td></tr>`).join('')}</tbody></table></div>
      ${!siOk(c.siM) || !siOk(c.siL) ? '<p class="warnline">Each stroke index from 1 to 18 should appear once per card.</p>' : ''}</details></div></section>
    <button type="button" class="btn primary block" style="margin-top:14px" data-act="saveSettings">Save settings</button>
  </form>
  <section class="setup"><div class="sec-head"><h2>Organisers</h2></div><div class="panel"><ul class="plain">${admins.map(e => `<li><span>${esc(e)}${e === S.user.email ? ' (you)' : ''}</span>${admins.length > 1 && e !== S.user.email ? `<button class="btn small danger" data-act="removeAdmin" data-email="${esc(e)}">Remove</button>` : ''}</li>`).join('')}</ul>
    <form data-form="addAdmin" class="inline"><input type="email" id="aa-email" name="email" placeholder="organiser@email.com" required aria-label="Organiser email"><button class="btn small" type="submit">Add</button></form><p class="hint">Organisers can manage golfers, competitions, payments and every card.</p></div></section>
  ${notifySettingsHtml()}
  <section class="setup"><div class="sec-head"><h2>Admin code</h2></div><div class="panel row-panel"><p class="hint">Anyone opening Admin needs the code. Locking also switches you to the golfer view; tap your initials (top right) to come back.</p><span style="display:flex;gap:8px"><button class="btn small" data-act="changePin">Change code</button><button class="btn small" data-act="lockAdmin">Lock now</button></span></div></section>
  ${SAMPLE ? '' : `<section class="setup"><div class="panel row-panel"><p class="hint">Try every screen with made-up golfers. Nothing is saved to the league.</p><a class="btn small" href="?sample=1">Sample data</a></div></section>`}`;
}

/* ---------- Sheets ---------- */
function openSheet(s){ S.sheet = s; renderSheet(); document.body.classList.add('locked'); }
function closeSheetQuiet(){
  if (S.sheet && (S.sheet.type === 'scan' || S.sheet.type === 'photo')) { if (SCAN_CTL) { SCAN_CTL.aborted = true; SCAN_CTL = null; } (S.sheet.thumbs || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} }); }
  S.sheet = null; CONFIRM_FN = null; $('#sheet').hidden = true; document.body.classList.remove('locked');
}
function closeSheet(){ closeSheetQuiet(); render(); }
function radio(name, val, label, checked){ return `<label class="radio"><input type="radio" id="f-${name}-${val}" name="${name}" value="${val}" ${checked ? 'checked' : ''}><span>${label}</span></label>`; }
function renderSheet(){
  const w = $('#sheet'); if (!S.sheet) { w.hidden = true; return; }
  MEMO = {}; let h = '';
  switch (S.sheet.type) {
    case 'comp': h = sheetComp(); break;
    case 'addEntry': h = sheetAddEntry(); break;
    case 'pay': h = sheetPay(); break;
    case 'payments': h = sheetPayments(); break;
    case 'joinReq': h = sheetJoinReq(); break;
    case 'golfer': h = sheetGolfer(); break;
    case 'shots': h = sheetShots(); break;
    case 'scan': h = sheetScan(); break;
    case 'photo': h = sheetPhoto(); break;
    case 'account': h = sheetAccount(); break;
    case 'confirm': h = `<h3>${esc(S.sheet.title)}</h3><p class="sub">${esc(S.sheet.text)}</p><div class="confirm-actions"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn ${S.sheet.danger ? 'danger-fill' : 'primary'}" data-act="confirmOk">${esc(S.sheet.ok)}</button></div>`; break;
  }
  if (h === null) { closeSheet(); return; }
  $('#sheetIn').innerHTML = `<div class="sheet-top"><button class="x" data-act="closeSheet" aria-label="Close">✕</button></div>` + h;
  w.hidden = false;
}
function askConfirm(title, text, ok, fn, danger){ CONFIRM_FN = fn; openSheet({type:'confirm', title, text, ok, danger}); }
function sheetAccount(){
  const iosTip = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
  return `<h3>Account</h3><p class="sub">${esc(S.myGid ? gName(S.myGid) : 'Organiser')} · ${esc(S.user.email)}</p>
    <p class="hint" style="margin-bottom:14px">${S.isAdmin ? 'You are an organiser.' : S.adminRole ? "You're an organiser, seeing the app as a golfer." : 'You are a golfer.'}${S.myGid ? ` Handicap ${fmtHi(curHcp(S.myGid))}.` : ''}</p>
    ${S.installEvt ? '<button class="btn primary block" data-act="install">Install the app</button>' : iosTip ? '<p class="notebox">To install on iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>' : ''}
    ${S.myGid ? `<button class="btn block" style="margin-top:8px" data-act="tab" data-v="me">My cards and stats</button>` : ''}
    ${S.adminRole ? (S.isAdmin ? `<button class="btn block" style="margin-top:8px" data-act="golferView">See the app as a golfer</button>` : `<button class="btn primary block" style="margin-top:8px" data-act="organiserView">Back to organiser view</button>`) : ''}
    <button class="btn block danger" style="margin-top:8px" data-act="signout">Sign out</button>`;
}
function sheetComp(){
  const c = S.sheet.id ? D.comps[S.sheet.id] : null; const k = cfg();
  const rs = c ? compRounds(c) : weekendRounds(defaultFirstFri(), k.rounds);
  const fmt = (c && c.format) || 'stableford'; const holes = (c && c.holes) || range(1,18);
  const is = arr => holes.length === arr.length && holes.every((h,i) => h === arr[i]);
  const preset = is(range(1,18)) ? '18' : is(range(1,14)) ? '14' : 'custom';
  const best = c ? compBest(c) : Math.min(k.best, rs.length);
  const perRound = !!(c && compRounds(c).some(r => r.format || r.tee || (Array.isArray(r.holes) && r.holes.length)));
  return `<form data-form="comp"><h3>${c ? 'Edit competition' : 'New month'}</h3><p class="sub">${c ? esc(c.name) : 'Weekend rounds, open Friday to Sunday.'}</p>
    <label class="field"><span>Name</span><input type="text" id="f-name" name="name" value="${esc(c ? c.name : '')}" placeholder="${esc(dParts(rs[0].from).month + ' ' + FORMATS[fmt].short)}"></label>
    <div class="grid2"><label class="field"><span>Weekend rounds</span><select id="f-rcount" name="rcount">${range(1,5).map(i => `<option value="${i}" ${i === rs.length ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
    <label class="field"><span>Best cards count</span><select id="f-best" name="best">${range(1,5).map(i => `<option value="${i}" ${i === best ? 'selected' : ''}>${i}</option>`).join('')}</select></label></div>
    <div class="field"><span>Rounds</span><div id="f-rounds" class="rrows">${rs.map(r => roundRow(r.n, r, perRound)).join('')}</div><p class="hint">Pick each round's Friday; it runs Friday, Saturday and Sunday.</p></div>
    <label class="check toggle"><input type="checkbox" id="f-perround" name="perround" ${perRound ? 'checked' : ''}><span>Different format, tees or holes for some rounds. "Default" uses the month's settings below.</span></label>
    <label class="field"><span>Entry fee for the month (€)</span><input type="number" id="f-fee" name="fee" min="0" step="1" value="${esc(c && c.fee != null ? c.fee : k.fee)}"></label>
    <div class="field"><span>Format${'' /* default */}</span><div class="radios">${Object.entries(FORMATS).map(([key,f]) => radio('format', key, f.name, fmt === key)).join('')}</div></div>
    <div class="field"><span>Holes</span><div class="radios">${radio('holes','18','18 holes', preset === '18')}${radio('holes','14','14 holes (1–14)', preset === '14')}${radio('holes','custom','Pick holes', preset === 'custom')}</div>
      <div class="holepick" id="holepick" ${preset === 'custom' ? '' : 'hidden'}>${range(1,18).map(h => `<label class="hp"><input type="checkbox" id="f-h-${h}" name="h" value="${h}" ${holes.includes(h) ? 'checked' : ''}><span>${h}</span></label>`).join('')}</div></div>
    <div class="grid2"><label class="field"><span>Men's tees</span><select id="f-tee" name="tee">${Object.entries(TEES).map(([key,t]) => `<option value="${key}" ${((c && c.tee) || k.tee) === key ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
    <label class="field"><span>Allowance %</span><input type="number" id="f-allow" name="allowance" min="0" max="100" value="${esc(c && c.allowance != null ? c.allowance : k.allowance)}"></label></div>
    <button class="btn primary block" type="submit">${c ? 'Save changes' : 'Create month'}</button></form>`;
}
function roundRow(n, r, show){
  r = r || {}; const hv = Array.isArray(r.holes) && r.holes.length ? (r.holes.length === 18 ? '18' : '14') : '';
  return `<div class="rrow"><label class="rrow-top"><span class="rn">R${n}</span><input type="date" id="f-r-${n}" name="r${n}" value="${esc(r.from || '')}" required aria-label="Round ${n} Friday"></label>
    <div class="rrow-opts" ${show ? '' : 'hidden'}>
      <label><span>Format</span><select id="f-rf-${n}" name="rf${n}" aria-label="Round ${n} format"><option value="">Default</option>${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${r.format === k ? 'selected' : ''}>${f.short}</option>`).join('')}</select></label>
      <label><span>Tees</span><select id="f-rt-${n}" name="rt${n}" aria-label="Round ${n} tees"><option value="">Default</option>${Object.entries(TEES).map(([k, t]) => `<option value="${k}" ${r.tee === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
      <label><span>Holes</span><select id="f-rh-${n}" name="rh${n}" aria-label="Round ${n} holes"><option value="">Default</option><option value="18" ${hv === '18' ? 'selected' : ''}>18</option><option value="14" ${hv === '14' ? 'selected' : ''}>14 (1–14)</option></select></label>
    </div></div>`;
}
function sheetAddEntry(){
  const c = D.comps[S.compId]; if (!c) return null;
  const avail = sortedGolfers().filter(g => !entryOf(c.id, g.id));
  return `<form data-form="addEntries"><h3>Add entries</h3><p class="sub">${esc(c.name)} · one entry covers the month.</p>
    ${avail.length ? `<div class="checklist">${avail.map(g => `<label class="check"><input type="checkbox" id="ae-${esc(g.id)}" name="gid" value="${esc(g.id)}"><span>${esc(g.name)}</span><small>Hcp ${fmtHi(curHcp(g.id))}</small></label>`).join('')}</div>` : '<p class="hint" style="margin-bottom:14px">Everyone on the golfer list is entered. Add new golfers on the Golfers tab.</p>'}
    <label class="field"><span>Payment</span><select id="ae-pay" name="pay"><option value="">Not paid yet</option><option value="revolut">Paid in the Revolut app</option><option value="card">Paid by card through Revolut</option></select></label>
    ${avail.length ? '<button class="btn primary block" type="submit">Add ticked golfers</button>' : ''}</form>`;
}
function sheetPay(){
  const e = D.entries[S.sheet.id]; if (!e) return null; const c = D.comps[e.compId]; const g = D.golfers[e.golferId]; const k = cfg(); if (!c || !g) return null;
  const fee = compFee(c); const ref = payRef(c, g); const ps = payState(e); const me = e.golferId === S.myGid;
  const status = ps === 'paid' ? 'Paid · ' + (METHODS[e.method] || 'Paid') : ps === 'claimed' ? claimText(e) : 'Not paid yet';
  let h = `<h3>Entry ${euro(fee)}</h3><p class="sub">${esc(g.name)} · ${esc(c.name)} · <b>${esc(status)}</b></p>`;
  if (S.isAdmin) {
    if (ps === 'claimed') h += `<p class="notebox">${esc(firstName(g.name))} says they paid${e.claimMethod && METHODS[e.claimMethod] ? ' by ' + esc(METHODS[e.claimMethod]) : ''}. Look for <b>${esc(ref)}</b> or their name in your Revolut, then mark it below.</p>`;
    h += `<span class="label">Mark as</span><div class="paygrid three">${[['revolut','Revolut app'],['card','Card (Revolut)'],['','Not paid']].map(([m,l]) => `<button class="paybtn ${(m ? (e.paid && e.method === m) : !e.paid) ? 'on' : ''}" data-act="setPay" data-m="${m}">${l}</button>`).join('')}</div>`;
    if (!me) return h;
  }
  if (ps === 'paid') return h + `<p class="hint">Thanks, you're all paid for ${esc(c.name)}.</p>`;
  h += `<div class="revbox"><span class="label">Pay with Revolut</span><a class="btn primary block" href="${esc(revUrl())}" target="_blank" rel="noopener">Pay ${euro(fee)} · revolut.me/${esc(k.revtag)}</a>
    <p class="hint">Opens Revolut. No Revolut account? The same page takes a debit card, Apple Pay or Google Pay.</p>
    <span class="label">Reference</span><div class="refrow"><code id="refcode">${esc(ref)}</code><button class="btn small" data-act="copy" data-text="${esc(ref)}">Copy</button></div><p class="hint">Add this as the note so the organiser can match your payment.</p></div>`;
  if (me && !S.isAdmin) h += ps === 'claimed'
    ? `<div class="claimbox"><b>Thanks. The organiser will confirm it.</b><span class="hint">${esc(claimText(e))}. Your entry shows as paid once they've checked Revolut.</span><button class="textbtn" data-act="claim" data-m="">I haven't paid yet</button></div>`
    : `<span class="label">Once you've paid, tell the organiser</span><div class="paygrid"><button class="paybtn" data-act="claim" data-m="revolut">I paid in the Revolut app</button><button class="paybtn" data-act="claim" data-m="card">I paid by card</button></div>`;
  return h;
}
function sheetPayments(){
  const c = D.comps[S.sheet.id]; if (!c) return null; const fee = compFee(c);
  const es = entriesFor(c.id).map(e => ({e, g:D.golfers[e.golferId]})).sort((a,b) => byName(a.g, b.g));
  const chk = es.filter(x => payState(x.e) === 'claimed'), un = es.filter(x => payState(x.e) === 'unpaid'), paid = es.filter(x => payState(x.e) === 'paid');
  const b = (x, m, label, primary) => `<button class="btn small ${primary ? 'primary' : ''}" data-act="payMark" data-gid="${esc(x.e.golferId)}" data-m="${m}">${label}</button>`;
  const row = (x, sub, btns) => `<li><span class="avatar sm">${esc(initials(x.g.name))}</span><span class="grp-main"><b>${esc(x.g.name)}</b><small>${sub}</small></span><span class="pbtns">${btns}</span></li>`;
  let h = `<h3>Payments</h3><p class="sub">${esc(c.name)} · ${paid.length} of ${es.length} paid · ${euro(paid.length * fee)} in</p>`;
  if (!es.length) return h + '<p class="hint">No entries yet.</p>';
  if (chk.length) h += `<div class="pl-head"><span class="label">Say they've paid · check Revolut (${chk.length})</span></div><ul class="grp paylist">${chk.map(x => row(x, esc(claimText(x.e)) + ' · ref “' + esc(payRef(c, x.g)) + '”', b(x, x.e.claimMethod && METHODS[x.e.claimMethod] ? x.e.claimMethod : 'revolut', 'Got it', true) + b(x, '', 'Not yet'))).join('')}</ul>`;
  if (un.length) h += `<div class="pl-head"><span class="label">Not paid (${un.length})</span><button class="btn small" data-act="remindUnpaid">${ICONS.share}Remind</button></div><ul class="grp paylist">${un.map(x => row(x, 'Not paid', b(x, 'revolut', 'Revolut') + b(x, 'card', 'Card'))).join('')}</ul>`;
  if (paid.length) h += `<div class="pl-head"><span class="label">Paid (${paid.length})</span></div><ul class="grp paylist">${paid.map(x => row(x, esc(METHODS[x.e.method] || 'Paid') + (x.e.paidAt ? ' · ' + esc(shortDay(Date.parse(x.e.paidAt) || x.e.paidAt)) : ''), b(x, '', 'Undo'))).join('')}</ul>`;
  h += `<p class="hint" style="margin-top:12px">“Got it” marks the entry paid. “Not yet” clears their note so they can pay and tell you again. Remind sends the unpaid list to WhatsApp or your phone's share menu.</p>`;
  return h;
}
function sheetGolfer(){
  const p = S.sheet.id ? D.golfers[S.sheet.id] : null; const email = p ? golferEmails()[p.id] || '' : (S.sheet.prefill || '');
  return `<form data-form="golfer"><h3>${p ? 'Edit golfer' : 'Add golfer'}</h3><p class="sub">${p ? esc(p.name) : 'The email is how they sign in.'}</p>
    <label class="field"><span>Name</span><input type="text" id="gl-name" name="name" value="${esc(p ? p.name : '')}" required></label>
    <label class="field"><span>Email they sign in with</span><input type="email" id="gl-email" name="email" value="${esc(email)}" autocapitalize="off" placeholder="name@gmail.com"></label>
    <label class="field"><span>Starting handicap</span><input type="text" id="gl-hi" name="hi" inputmode="decimal" value="${p && p.hi != null ? esc(fmtHi(p.hi)) : ''}" placeholder="e.g. 14.2"></label>
    ${p ? `<p class="hint" style="margin:-6px 0 12px">Current handicap ${fmtHi(curHcp(p.id))}. Cuts and rises from finalised months are added to the starting handicap automatically.</p>` : ''}
    <div class="field"><span>Card</span><div class="radios">${radio('gender','M',"Men's", !p || p.gender !== 'L')}${radio('gender','L',"Ladies' (red)", p && p.gender === 'L')}</div></div>
    <p class="hint" style="margin-bottom:16px">Use + for a plus handicap, e.g. +1.2. Only golfers on this list can sign in, enter or be read from a scanned card.</p>
    <button class="btn primary block" type="submit">${p ? 'Save' : 'Add golfer'}</button>
    ${p ? `<button type="button" class="btn danger block" style="margin-top:8px" data-act="delGolfer" data-id="${esc(p.id)}">Delete golfer</button>` : ''}</form>`;
}
function sheetJoinReq(){
  const email = S.sheet.email; const r = (D.requests || {})[email]; if (!r) return null;
  const emails = golferEmails(); const gs = sortedGolfers(); const free = gs.filter(g => !emails[g.id]), taken = gs.filter(g => emails[g.id]);
  const same = gs.find(g => normName(g.name) === normName(r.name));
  const opt = g => `<option value="${esc(g.id)}" ${same && same.id === g.id ? 'selected' : ''}>${esc(g.name)}${emails[g.id] ? ` (replaces ${esc(emails[g.id])})` : ''}</option>`;
  return `<form data-form="approveJoin"><h3>Asking to join</h3><p class="sub">${esc(email)}${r.createdAt ? ' · asked ' + esc(shortDay(r.createdAt)) : ''}</p>
    <label class="field"><span>Add as</span><select id="jq-link" name="link"><option value="">A new golfer</option>${free.length ? `<optgroup label="Already on the list">${free.map(opt).join('')}</optgroup>` : ''}${taken.length ? `<optgroup label="Already on the list with another email">${taken.map(opt).join('')}</optgroup>` : ''}</select></label>
    ${same ? `<p class="notebox">${esc(same.name)} is already on the golfer list, so they're picked above. Their handicap and history stay as they are.</p>` : ''}
    <div id="jq-new" ${same ? 'hidden' : ''}>
      <label class="field"><span>Name</span><input type="text" id="jq-name" name="name" value="${esc(r.name)}"></label>
      <label class="field"><span>Starting handicap</span><input type="text" id="jq-hi" name="hi" inputmode="decimal" value="${r.hi != null ? esc(fmtHi(r.hi)) : ''}" placeholder="e.g. 14.2"></label>
      <div class="field"><span>Card</span><div class="radios">${radio('gender','M',"Men's", r.gender !== 'L')}${radio('gender','L',"Ladies' (red)", r.gender === 'L')}</div></div>
      <p class="hint" style="margin-bottom:14px">Check the handicap against their club handicap before letting them in.</p>
    </div>
    <button class="btn primary block" type="submit">Let them in</button>
    <button type="button" class="btn danger block" style="margin-top:8px" data-act="declineJoin" data-email="${esc(email)}">Decline</button></form>`;
}
function sheetShots(){
  const {cid, round, gid} = S.card || {}; const c = D.comps[cid]; const g = D.golfers[gid]; if (!c || !g) return null;
  const rc = rcfg(c, round); const card = cardOf(cid, round, gid); const calc = defaultShots(g, rc, cardHi(card, g)); const cur = cardShots(card, rc, g); const t = g.gender === 'L' ? RED : (TEES[rc.tee] || TEES.white);
  return `<form data-form="shots"><h3>Shots received</h3><p class="sub">${esc(g.name)} · Round ${round}</p>
    <label class="field"><span>Shots over ${rc.holes.length} holes</span><input type="number" id="sh-val" name="shots" step="1" value="${cur}"></label>
    <p class="hint" style="margin-bottom:16px">Calculated: <b>${calc}</b> from index ${fmtHi(cardHi(card, g))}, ${t.name} tees (${t.cr} / ${t.slope}), ${rc.allowance}% allowance${rc.holes.length !== 18 ? `, ${rc.holes.length}/18 of the round` : ''}.</p>
    <div class="confirm-actions"><button type="button" class="btn" data-act="resetShots">Use ${calc}</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
/* ---------- Scanning (Gemini reads the photo, only recognised golfers are accepted) ---------- */
function normName(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim(); }
function recognise(match, onCard){
  const gs = Object.values(D.golfers);
  const exact = s => { const n = normName(s); return n ? gs.filter(g => normName(g.name) === n) : []; };
  let hit = match ? exact(match) : [];
  if (hit.length !== 1) hit = exact(onCard);
  if (hit.length !== 1 && onCard) {
    const toks = normName(onCard).split(' ').filter(t => t.length >= 3);
    hit = gs.filter(g => toks.includes(normName(g.name).split(' ').slice(-1)[0]));
    if (hit.length !== 1) hit = gs.filter(g => toks.includes(normName(g.name).split(' ')[0]));
  }
  return hit.length === 1 ? hit[0].id : null;
}
function scanPrompt(c, round){
  const holes = rcfg(c, round).holes;
  const k = cfg().course;
  const pars = range(1,18).map(h => `${h}: par ${k.parM[h-1]}${k.parL[h-1] !== k.parM[h-1] ? ` (ladies ${k.parL[h-1]})` : ''}`).join('; ');
  const names = sortedGolfers().map(g => g.name).join(', ');
  return ['Read this photo of a golf scorecard from Rathsallagh Golf Club, Co. Wicklow, and turn the handwritten scores into data.',
    `Holes played: ${holes.join(', ')}. Ignore other holes.`, `Pars: ${pars}.`, `Golfers on the club list: ${names}.`, '',
    'Rules:',
    '- Read the gross strokes written for each golfer on each hole. A card holds up to four golfers.',
    '- Ignore printed hole numbers, yardages, par, stroke index, totals, handicap, nett and Stableford points columns.',
    '- Use "P" for a pick-up (struck through, dash, line, X, P or NR). Leave out blank holes.',
    '- If a figure is hard to read, give your best reading and list the hole in "unclear".',
    '- "match" is the exact name from the club list when the name on the card clearly refers to that golfer, otherwise null. Never guess a match for an unclear name.',
    '- "marker" is the name in the marker or attesting signature box for that golfer, if one is written, otherwise null.',
    '- "marker_signed" is true if there is a signature or initials in the marker or attesting box for that golfer, otherwise false.', '',
    'Reply with only JSON:',
    '{"golfers":[{"name_on_card":"as written","match":"name from list or null","marker":"name or null","marker_signed":true,"scores":{"1":5,"2":4,"3":"P"},"unclear":[7]}],"notes":""}',
    'If it is not a scorecard, reply {"golfers":[],"notes":"the reason"}.'].join('\n');
}
async function imageToBase64(file){
  try {
    const bmp = await createImageBitmap(file); const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL('image/jpeg', 0.88); return {data: url.split(',')[1], mime:'image/jpeg'};
  } catch (_) {
    const buf = await file.arrayBuffer(); let bin = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return {data: btoa(bin), mime: file.type || 'image/jpeg'};
  }
}
function parseJSON(text){ try { return JSON.parse(text); } catch (_) {} const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text); if (m) { try { return JSON.parse(m[1]); } catch (_) {} } const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b+1)); } catch (_) {} } return null; }
function pickScanPhoto(ctx){ SCAN_PENDING = ctx; const f = $('#scanFile'); f.value = ''; f.click(); }
function startScan(files){
  const ctx = SCAN_PENDING; SCAN_PENDING = null; if (!ctx || !files || !files.length) return;
  const file = files[0]; let thumbs = []; try { thumbs = [URL.createObjectURL(file)]; } catch (_) {}
  openSheet({type:'scan', phase:'reading', ctx, file, thumbs}); runScan();
}
async function runScan(){
  const sh = S.sheet; if (!sh || sh.type !== 'scan') return;
  const c = D.comps[sh.ctx.cid]; if (!c) { closeSheet(); return; }
  sh.phase = 'reading'; renderSheet(); const ctl = {aborted:false}; SCAN_CTL = ctl;
  try {
    const img = await imageToBase64(sh.file); if (ctl.aborted) return;
    const text = await be.scan(scanPrompt(c, sh.ctx.round), img.data, img.mime); if (ctl.aborted || S.sheet !== sh) return;
    const res = parseJSON(text); if (!res || !Array.isArray(res.golfers)) throw new Error('unreadable');
    sh.rows = buildScanRows(res, c, sh.ctx); sh.notes = typeof res.notes === 'string' ? res.notes.slice(0, 300) : ''; sh.phase = 'review';
  } catch (e) {
    if (ctl.aborted || S.sheet !== sh) return; console.warn(e);
    sh.phase = 'error'; sh.err = /quota|429|exhaust/i.test(String(e && e.message)) ? 'The scanner is busy or over its free limit. Try again in a few minutes, or type the scores in.' : /app.?check|permission|403/i.test(String(e && e.message)) ? "Scanning isn't switched on for this app yet. The organiser needs to finish the Gemini setup." : "Couldn't read the card. Try a sharper photo, straight on, in good light.";
  }
  if (SCAN_CTL === ctl) SCAN_CTL = null; renderSheet();
}
function buildScanRows(res, c, ctx){
  const round = ctx.round; const holes = rcfg(c, round).holes;
  const seen = new Set();
  const rows = res.golfers.slice(0, 6).map(g => {
    const raw = (g && typeof g.scores === 'object' && g.scores) || {}; const scores = {};
    holes.forEach(h => { const v = raw[h] !== undefined ? raw[h] : raw[String(h)]; if (v === undefined || v === null || v === '') return; if (/^\s*p\s*$/i.test(String(v))) { scores[h] = 'P'; return; } const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 20) scores[h] = n; });
    const name = String((g && g.name_on_card) || '').slice(0, 60);
    const gid = recognise(g && typeof g.match === 'string' ? g.match : null, name);
    const markerRead = g && typeof g.marker === 'string' ? g.marker.trim().slice(0, 60) : ''; const signedRead = !!(g && g.marker_signed === true);
    const unclear = Array.isArray(g && g.unclear) ? g.unclear.map(Number).filter(h => holes.includes(h)) : [];
    let status = 'ok', why = '';
    if (!gid) { status = 'reject'; why = "Name not recognised from the golfer list, so this card isn't accepted."; }
    else if (seen.has(gid)) { status = 'reject'; why = 'This golfer appears twice on the card.'; }
    else if (!S.isAdmin && gid !== S.myGid) { status = 'reject'; why = 'Each player submits their own card, so this one is left for them.'; }
    else if (S.isAdmin && !entryOf(c.id, gid)) { why = "Not entered this month. Adding the card enters them (unpaid)."; }
    if (gid) seen.add(gid);
    return {name, gid, markerRead, signedRead, scores, unclear, status, why};
  }).filter(r => Object.keys(r.scores).length || r.status === 'reject');
  // Marker: the name read from the card's marker box, else the name already on the card.
  rows.filter(r => r.status === 'ok').forEach(r => { const prev = cardOf(c.id, round, r.gid);
    const known = r.markerRead ? Object.values(D.golfers).find(x => normName(x.name) === normName(r.markerRead)) : null;
    r.marker = known ? known.name : r.markerRead || markerName(prev); r.signed = r.signedRead || isSigned(prev); });
  return rows;
}
function sheetScan(){
  const sh = S.sheet; const c = D.comps[sh.ctx.cid]; if (!c) return null; const round = sh.ctx.round; const holes = rcfg(c, round).holes;
  let h = `<h3>Scan scorecard</h3><p class="sub">${esc(c.name)} · Round ${round}</p>`;
  if (sh.thumbs && sh.thumbs.length) h += `<div class="thumbs">${sh.thumbs.map(u => `<img src="${esc(u)}" alt="Scorecard photo">`).join('')}</div>`;
  if (sh.phase === 'saved') return h + `<p class="notebox"><b>${esc(sh.msg)}</b></p>` + photoShareHtml();
  if (sh.phase === 'reading') return h + `<div class="reading"><span class="pulse"></span><p><b>Reading the card…</b> This usually takes 10 to 30 seconds.</p></div><button class="btn block" data-act="stopScan">Stop</button>`;
  if (sh.phase === 'error') return h + `<p class="errbox">${esc(sh.err)}</p><div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  if (!sh.rows.length) return h + `<p class="errbox">No scores found on this photo.${sh.notes ? ' ' + esc(sh.notes) : ''}</p><div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  h += `<p class="hint" style="margin-bottom:12px">Check each number against the card. Highlighted holes were hard to read. Type P for a pick-up.</p>`;
  if (sh.notes) h += `<p class="notebox">${esc(sh.notes)}</p>`;
  const okRows = sh.rows.filter(r => r.status === 'ok');
  h += sh.rows.map((r, i) => {
    if (r.status === 'reject') return `<div class="scanrow rejected"><div class="oncard"><span class="label">On the card</span><b>${esc(r.name || 'Unnamed golfer')}</b></div><p class="errbox">${esc(r.why)}</p></div>`;
    return `<div class="scanrow"><div class="scanrow-head"><span class="oncard"><span class="label">On the card</span><b>${esc(r.name)}</b></span><span class="oncard"><span class="label">Golfer</span><b class="okname">${esc(gName(r.gid))}</b></span></div>
      <label class="field" style="margin:0"><span>Marker's name</span><input type="text" id="sm-${i}" maxlength="60" autocomplete="off" list="markerNames" value="${esc(r.marker || '')}" placeholder="Who marked the card?"></label>
      <label class="signchk"><input type="checkbox" id="ss-${i}" ${r.signed ? 'checked' : ''}><span>The marker has signed this card</span></label>
      ${r.signedRead ? '' : `<p class="hint">No marker signature was found on the photo. Only tick this if the card is signed.</p>`}
      ${r.why ? `<p class="hint">${esc(r.why)}</p>` : ''}
      <div class="sgrid">${holes.map(hh => `<label class="sg ${r.unclear.includes(hh) ? 'unclear' : ''}"><span>${hh}</span><input type="text" inputmode="numeric" maxlength="2" autocomplete="off" id="sv-${i}-${hh}" value="${r.scores[hh] !== undefined ? esc(String(r.scores[hh])) : ''}" aria-label="Hole ${hh}"></label>`).join('')}</div>
      <p class="hint">${Object.keys(r.scores).length} of ${holes.length} holes read${r.unclear.length ? ` · check hole${r.unclear.length > 1 ? 's' : ''} ${r.unclear.join(', ')}` : ''}</p></div>`;
  }).join('');
  h += `<datalist id="markerNames">${sortedGolfers().map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>`;
  h += okRows.length ? `<button class="btn primary block" data-act="applyScan">Add ${okRows.length} card${okRows.length === 1 ? '' : 's'}</button><p class="hint" style="margin-top:10px">Scanned holes replace what's on each card. Blank holes are left as they are.</p>` : `<div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  return h;
}
// Golfers send the organiser a photo of their signed card through the phone's share menu (WhatsApp).
function photoShareHtml(){
  return `<p style="margin:12px 0 10px">Now send the organiser a photo of your signed card.</p>
    <button class="btn primary block big" data-act="sharePhoto">Send photo to the organiser</button>
    <button class="btn block" style="margin-top:8px" data-act="closeSheet">Done</button>
    <p class="hint" style="margin-top:10px">Opens your phone's share menu. Pick WhatsApp, then the organiser (not the group).</p>`;
}
function sheetPhoto(){
  const sh = S.sheet; const c = D.comps[sh.ctx.cid]; if (!c) return null;
  return `<h3>Card photo</h3><p class="sub">${esc(c.name)} · Round ${sh.ctx.round}</p>${sh.thumbs && sh.thumbs.length ? `<div class="thumbs">${sh.thumbs.map(u => `<img src="${esc(u)}" alt="Card photo">`).join('')}</div>` : ''}` + photoShareHtml();
}
async function applyScan(){
  const sh = S.sheet; const c = sh && D.comps[sh.ctx.cid]; if (!c || !sh.rows) return; const round = sh.ctx.round; const holes = rcfg(c, round).holes;
  document.querySelectorAll('#sheetIn .sg.bad').forEach(x => x.classList.remove('bad'));
  const ops = []; let bad = null; const ok = sh.rows.map((r,i) => ({r, i})).filter(x => x.r.status === 'ok');
  ok.forEach(({r, i}) => {
    const scores = {};
    holes.forEach(hh => { const inp = document.getElementById(`sv-${i}-${hh}`); const t = (inp ? inp.value : '').trim().toUpperCase(); if (!t) return; if (t === 'P') { scores[hh] = 'P'; return; } const n = parseInt(t, 10); if (/^\d{1,2}$/.test(t) && n >= 1 && n <= 20) scores[hh] = n; else { if (inp) inp.closest('.sg').classList.add('bad'); bad = bad || `Hole ${hh} for ${gName(r.gid)} should be a number or P.`; } });
    const marker = String((document.getElementById('sm-' + i) || {}).value || '').trim().slice(0, 60); const signed = !!(document.getElementById('ss-' + i) || {}).checked;
    if (signed && !marker) { bad = bad || `Add the marker's name for ${gName(r.gid)}.`; return; }
    if (S.isAdmin && !entryOf(c.id, r.gid)) ops.push({path:`comps/${c.id}/entries/${r.gid}`, data:{compId:c.id, golferId:r.gid, paid:false, method:null, paidAt:null, createdAt:Date.now()}});
    const base = cardBase(c.id, round, r.gid);
    ops.push({path:`comps/${c.id}/cards/${round}_${r.gid}`, data:Object.assign(base, {marker, signed, scores:Object.assign(base.scores, scores), updatedAt:Date.now(), updatedBy:S.user.uid, scanned:true})});
    r.done = {signed, marker};
  });
  if (bad) { toast(bad); return; }
  const unsigned = ok.filter(x => !(x.r.done && x.r.done.signed)).length;
  const before = {}; ok.forEach(({r}) => { before[r.gid] = cardCounts(c.id, round, r.gid); });
  if (await batch(ops)) {
    ops.forEach(o => localSet(o.path, o.data)); ok.forEach(({r}) => notifyIfDone(c.id, round, r.gid, before[r.gid]));
    const msg = `${ok.length} card${ok.length === 1 ? '' : 's'} added.${unsigned ? ` ${unsigned === 1 ? "It doesn't" : `${unsigned} don't`} count until ticked as signed.` : ''}`;
    if (!S.isAdmin && sh.file) { sh.phase = 'saved'; sh.msg = msg; renderSheet(); } else { closeSheet(); toast(msg); }
  }
}

/* ---------- Actions ---------- */
function top(){ window.scrollTo(0,0); }
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
function authErr(e){
  const c = e && e.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'That email and password don\'t match. Try again or reset your password.';
  if (c.includes('email-already-in-use')) return 'There is already an account for that email. Sign in instead.';
  if (c.includes('weak-password')) return 'Use a password of at least 6 characters.';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in was cancelled.';
  if (c.includes('network')) return "You're offline. Connect and try again.";
  if (c.includes('unauthorized-domain')) return "This web address isn't allowed to sign in yet. Add it in Firebase Authentication settings.";
  return 'Sign-in didn\'t work. Try again.';
}
function saveCard(cid, round, gid, scores){
  const data = Object.assign(cardBase(cid, round, gid), {scores, updatedAt:Date.now(), updatedBy:S.user.uid});
  const path = `comps/${cid}/cards/${round}_${gid}`; const before = cardCounts(cid, round, gid);
  localSet(path, data); render(); notifyIfDone(cid, round, gid, before);
  // Save the latest version of the card when the timer fires, so a later change (marker, tick) is never overwritten.
  clearTimeout(cardTimers[path]); cardTimers[path] = setTimeout(() => { const cur = D.cards[`${cid}/${round}_${gid}`]; put(path, Object.assign({}, cur || data)); }, 600);
}
async function markPaid(cid, gid, m){
  const e = entryOf(cid, gid); if (!e) return;
  const data = {compId:cid, golferId:gid, paid:!!m, method:m || null, paidAt: m ? new Date().toISOString() : null, createdAt: e.createdAt || Date.now()};
  const path = `comps/${cid}/entries/${gid}`;
  if (await put(path, data)) { localSet(path, data); renderSheet(); render(); toast(m ? `${gName(gid)}: paid (${METHODS[m]})` : `${gName(gid)}: not paid`); }
}
// The app's own address, for messages shared to WhatsApp.
function appUrl(){ return location.origin + location.pathname.replace(/index\.html$/, ''); }
// Opens the phone's share menu (WhatsApp, Messages...). Computers without one go straight to WhatsApp.
function shareText(text){
  if (navigator.share) { navigator.share({text}).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
const ACT = {
  tab(el){ const v = el.dataset.v; if (S.sheet) closeSheetQuiet(); S.card = null; if (S.view === v) { if (v === 'comps') S.compId = null; if (v === 'golfers') S.playerId = null; } S.view = v; top(); render(); },
  openTable(el){ S.card = null; S.view = 'table'; S.leagueTab = 'month'; if (el.dataset.id) S.leagueMonth = el.dataset.id; S.boardSel = 'month'; top(); render(); },
  account(){ openSheet({type:'account'}); },
  install(){ const e = S.installEvt; if (!e) return; e.prompt(); e.userChoice.finally(() => { S.installEvt = null; closeSheet(); }); },
  async google(){ try { S.busy = true; render(); await be.signInGoogle(); } catch (e) { toast(authErr(e)); } finally { S.busy = false; render(); } },
  signinMode(el){ S.signinMode = el.dataset.v; render(); },
  async forgot(){ const em = ($('#si-email') || {}).value; if (!em) { toast('Type your email first, then tap Forgot password.'); return; } try { await be.resetPassword(em.trim()); toast('Password reset email sent.'); } catch (e) { toast(authErr(e)); } },
  async verified(){ const u = await be.reloadUser(); if (u && u.emailVerified) onUser(u); else toast("Not confirmed yet. Tap the link in the email, then try again."); },
  async resendVerify(){ try { await be.sendVerify(); toast('Sent. Check your inbox and spam folder.'); } catch (e) { toast('Could not send just now. Try again shortly.'); } },
  async signout(){ closeSheetQuiet(); await be.signOut(); S.view = 'home'; S.compId = null; S.card = null; S.playerId = null; },
  recheck(){ onUser(S.user); },
  async bootstrap(){ if (await put('config/admins', {emails:[S.user.email], createdAt:Date.now()})) toast("You're the organiser. Set your admin code in Admin."); },
  sampleSignin(el){ be.signInEmail(el.dataset.email); },
  newComp(){ openSheet({type:'comp'}); },
  editComp(){ openSheet({type:'comp', id:S.compId}); },
  openComp(el){ const c = D.comps[el.dataset.id]; if (!c) return; S.card = null;
    if (!S.isAdmin) { S.view = 'table'; S.leagueTab = 'month'; S.leagueMonth = c.id; S.boardSel = 'month'; top(); render(); return; }
    S.view = 'comps'; S.compId = c.id; S.compTab = c.status === 'final' ? 'board' : 'entries'; S.boardSel = 'month'; top(); render(); },
  closeComp(){ S.compId = null; top(); render(); },
  compTab(el){ S.compTab = el.dataset.v; render(); },
  boardSel(el){ S.compTab = 'board'; S.boardSel = el.dataset.v === 'month' ? 'month' : Number(el.dataset.v); render(); },
  openCard(el){ const cid = el.dataset.cid, gid = el.dataset.gid; const c = D.comps[cid]; if (!c || !D.golfers[gid]) return; S.card = {cid, round: Number(el.dataset.round) || currentRound(c), gid}; S.activeHole = null; top(); render(); },
  cardRound(el){ if (!S.card) return; S.card = Object.assign({}, S.card, {round:Number(el.dataset.v)}); S.activeHole = null; render(); },
  closeCard(){ S.card = null; top(); render(); },
  hole(el){ S.activeHole = +el.dataset.h; render(); },
  key(el){
    const {cid, round, gid} = S.card || {}; const c = D.comps[cid]; if (!c || c.status === 'final' || !canEnter(cid, round, gid)) return;
    const holes = rcfg(c, round).holes; const h = S.activeHole; if (!holes.includes(h)) return;
    const prev = cardOf(cid, round, gid); const scores = Object.assign({}, (prev && prev.scores) || {});
    const v = el.dataset.v; if (v === 'X') delete scores[h]; else scores[h] = v === 'P' ? 'P' : +v;
    const idx = holes.indexOf(h); if (v !== 'X' && idx < holes.length - 1) S.activeHole = holes[idx+1];
    saveCard(cid, round, gid, scores);
    requestAnimationFrame(() => requestAnimationFrame(() => { const a = document.querySelector('.hole.active'); if (a) a.scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }));
    if (v !== 'X' && idx === holes.length - 1 && Object.keys(scores).length >= holes.length) toast(markedOK(cardOf(cid, round, gid)) ? 'Card complete' : "Card complete. Add the marker's name and tick that it's signed.");
  },
  editShots(){ openSheet({type:'shots'}); },
  photoCard(el){ PHOTO_PENDING = {cid: el.dataset.cid, round: Number(el.dataset.round)}; const f = $('#photoFile'); if (!f) return; f.value = ''; f.click(); },
  async sharePhoto(){ const sh = S.sheet; const f = sh && sh.file; if (!f) return; const c = D.comps[sh.ctx.cid];
    const text = `Pot of Gold · ${gName(S.myGid)} · ${c ? c.name : ''} round ${sh.ctx.round} card`;
    try { if (navigator.canShare && navigator.canShare({files:[f]})) { await navigator.share({files:[f], text}); closeSheet(); toast('Photo shared'); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    toast("This phone can't send the photo from here. Send it from your photos in WhatsApp instead."); },
  startRound(el){ const cid = el.dataset.cid, round = Number(el.dataset.round); const c = D.comps[cid]; if (!c || !canStart(cid, round)) return;
    askConfirm('Start your round?', `This is your round ${round} card for ${c.name}. You only get one this weekend. Enter your scores and tick it as signed by midnight tonight, or the round won't count.`, 'Start my round', async () => {
      const now = Date.now(); const path = `comps/${cid}/cards/${round}_${S.myGid}`;
      const data = Object.assign(cardBase(cid, round, S.myGid), {startedAt: now, deadline: Math.min(endOfDay(now), roundCloses(c, round)), updatedAt: now, updatedBy: S.user.uid});
      if (await put(path, data)) { localSet(path, data); S.card = {cid, round, gid: S.myGid}; S.activeHole = null; top(); render(); toast('Round started. Good luck!'); sendNotify(`${gName(S.myGid)} started round ${round}`, `${c.name} · ${whenText(now)}`, 'golf'); } }); },
  delCard(){ const {cid, round, gid} = S.card || {}; if (!S.isAdmin || !cardOf(cid, round, gid)) return;
    askConfirm('Delete this card?', `${gName(gid)}'s round ${round} card and its scores are removed, and they can start the round again while it's open.`, 'Delete', async () => {
      if (await drop(`comps/${cid}/cards/${round}_${gid}`)) { delete D.cards[`${cid}/${round}_${gid}`]; MEMO = {}; S.card = null; render(); toast('Card deleted'); } }, true); },
  async resetShots(){ const {cid, round, gid} = S.card; const prev = cardOf(cid, round, gid); if (prev) await put(`comps/${cid}/cards/${round}_${gid}`, Object.assign({}, prev, {shots:null, id:undefined})); closeSheet(); toast('Using calculated shots'); },
  addEntry(){ openSheet({type:'addEntry'}); },
  async selfEnter(el){ const c = D.comps[(el && el.dataset.cid) || S.compId]; if (!c) return; const path = `comps/${c.id}/entries/${S.myGid}`; const data = {compId:c.id, golferId:S.myGid, paid:false, method:null, paidAt:null, createdAt:Date.now()};
    if (await put(path, data)) { localSet(path, data); openSheet({type:'pay', id:c.id + '/' + S.myGid}); render(); toast("You're entered. Now pay your entry."); sendNotify(`${gName(S.myGid)} entered`, `${c.name} · not paid yet`, 'ticket'); } },
  pay(el){ openSheet({type:'pay', id:el.dataset.id}); },
  setPay(el){ const e = D.entries[S.sheet && S.sheet.id]; if (e) markPaid(e.compId, e.golferId, el.dataset.m); },
  payments(el){ openSheet({type:'payments', id: el.dataset.id || S.compId}); },
  payMark(el){ const cid = S.sheet && S.sheet.id; if (cid) markPaid(cid, el.dataset.gid, el.dataset.m); },
  async claim(el){ const id = S.sheet && S.sheet.id; const e = D.entries[id]; if (!e || e.golferId !== S.myGid) return; const m = el.dataset.m;
    const data = Object.assign({}, e, {claimed: !!m, claimMethod: m || null, claimedAt: m ? Date.now() : null}); delete data.id;
    const path = `comps/${e.compId}/entries/${e.golferId}`;
    if (await put(path, data)) { localSet(path, data); renderSheet(); render(); toast(m ? 'Thanks. The organiser will check Revolut and confirm it.' : 'No problem. Pay when you can.');
      if (m) { const c = D.comps[e.compId]; sendNotify(`${gName(e.golferId)} says they've paid`, `${euro(compFee(c))} by ${METHODS[m]} · ${c ? c.name : ''}. Check Revolut and confirm in the app.`, 'euro'); } } },
  remindUnpaid(){ const c = D.comps[S.sheet && S.sheet.id]; if (!c) return; const un = entriesFor(c.id).filter(e => payState(e) === 'unpaid').map(e => gName(e.golferId)).sort();
    if (!un.length) { toast('Everyone has paid or says they have.'); return; }
    shareText([`Pot of Gold · ${c.name}`, `Entry is ${euro(compFee(c))} for the month. Still to pay: ${un.join(', ')}.`, `Pay with Revolut: ${revUrl()} (Revolut app, or debit card, Apple Pay or Google Pay).`, `Then tap "I've paid" in the app: ${appUrl()}`].join('\n')); },
  remindAll(el){ const c = D.comps[el.dataset.id]; if (!c) return; const L = chaseLists(c); const names = list => list.map(g => g.name).join(', ');
    if (!L.notEntered.length && !L.unpaid.length) { toast("Everyone's entered and paid."); return; }
    const lines = [`⛳ Pot of Gold · ${c.name}`]; const rl = roundLine(c); if (rl) lines.push(rl); lines.push('');
    if (L.notEntered.length) lines.push(`Not entered yet: ${names(L.notEntered)}. Open the app and tap Enter ${c.name}, then pay ${euro(compFee(c))}.`);
    if (L.unpaid.length) lines.push(`Entered but not paid: ${names(L.unpaid)}. Tap Pay now on Home, pay through Revolut, then tap I've paid.`);
    lines.push('', appUrl()); shareText(lines.join('\n')); },
  shareTable(el){ const c = D.comps[el.dataset.id || S.compId]; if (!c) return; const lb = leaderboard(c); const fin = c.status === 'final'; const u = monthUnit(c); const best = compBest(c);
    const lines = [`Pot of Gold · ${c.name}`, fin ? 'Final results' : `Table so far · best ${best} of ${compRounds(c).length} rounds count`, ''];
    lb.ranked.slice(0, 12).forEach(r => lines.push(`${r.tied ? 'T' : ''}${r.pos}. ${r.golfer.name} ${monthText(r, c)}${u ? ' ' + u : ''}${r.count < best ? ` (${r.count} card${r.count === 1 ? '' : 's'})` : ''}`));
    if (lb.ranked.length > 12) lines.push(`…and ${lb.ranked.length - 12} more`);
    if (!lb.ranked.length) lines.push('No signed cards yet.');
    const st = lb.stats; lines.push('', `Pot ${euro(st.pot)} · winner ${euro(st.prizes[0] || 0)} · runner-up ${euro(st.prizes[1] || 0)}`, appUrl());
    shareText(lines.join('\n')); },
  invite(){ const k = cfg(); shareText(`Join the Pot of Gold, our monthly golf competition: ${euro(k.fee)} a month, ${k.rounds} weekend rounds, your best ${k.best} count. Open ${appUrl()} on your phone, sign in with Google or your email, and tap "Ask to join". Then add it to your home screen.`); },
  joinList(){ S.view = 'golfers'; S.playerId = null; S.golferTab = 'list'; top(); render(); },
  reviewJoin(el){ openSheet({type:'joinReq', email: el.dataset.email}); },
  declineJoin(el){ const email = el.dataset.email; const r = (D.requests || {})[email];
    askConfirm('Decline this request?', `${r ? r.name : email} won't be added. They can ask again later.`, 'Decline', async () => { if (await drop('requests/' + email)) { delete D.requests[email]; render(); toast('Request declined'); } }, true); },
  async cancelReq(){ if (await drop('requests/' + S.user.email)) { D.myReq = null; render(); toast('Request cancelled'); } },
  reload(){ location.reload(); },
  actSeen(){ try { localStorage.setItem('rgc-activity-seen', String(Date.now())); } catch (_) {} render(); },
  actMore(){ S.actMore = true; render(); },
  async notifyOn(){ const topic = 'potofgold-' + randHex(10); if (await put('config/admins', Object.assign({}, D.admins, {notify: topic}))) { D.admins = Object.assign({}, D.admins, {notify: topic}); render(); toast('Notifications turned on. Now set up the ntfy app.'); } },
  async notifyOff(){ askConfirm('Turn off notifications?', "You won't get notifications on your phone any more. You can turn them on again, with a new channel name.", 'Turn off', async () => {
    const data = Object.assign({}, D.admins, {notify: null}); if (await put('config/admins', data)) { D.admins = data; render(); toast('Notifications off'); } }, true); },
  notifyTest(){ if (!notifyTopic()) return; sendNotify('Pot of Gold test', 'Notifications are working.', 'white_check_mark', true); toast('Test sent. It should pop up on your phone in a few seconds.'); },
  saveSettings(){ const a = document.activeElement; if (a && a.blur) a.blur(); saveSettings(); },
  copy(el){ const text = el.dataset.text; const fb = () => { const code = $('#refcode'); if (code) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Reference selected. Copy it from here.'); }; try { navigator.clipboard.writeText(text).then(() => toast('Reference copied'), fb); } catch (_) { fb(); } },
  finalise(){
    const c = D.comps[S.compId]; if (!c) return; const lb = leaderboard(c); const unpaid = entriesFor(c.id).filter(e => !e.paid).length;
    const unmarked = lb.all.reduce((a,r) => a + r.cards.filter(sc => sc.complete && !sc.marked).length, 0);
    const changes = previewHcp(c.id, 'final');
    const bits = ['Scores lock and league points are added.']; if (changes.length) bits.push('Handicaps: ' + changes.map(x => `${gName(x.gid)} ${fmtHi(x.from)} → ${fmtHi(x.to)}`).join(', ') + '.'); if (unmarked) bits.push(`${unmarked} complete card${unmarked === 1 ? " isn't" : "s aren't"} ticked as signed by a marker and won't count.`); if (unpaid) bits.push(`${unpaid} entr${unpaid === 1 ? 'y is' : 'ies are'} unpaid.`); bits.push('You can reopen it later.');
    askConfirm('Finalise the month?', bits.join(' '), 'Finalise', async () => { const data = Object.assign({}, c, {status:'final', finalisedAt:Date.now()}); delete data.id;
      if (await put(`comps/${c.id}`, data)) { localSet(`comps/${c.id}`, data); await syncHandicaps(); S.compTab = 'board'; S.boardSel = 'month'; toast(changes.length ? `Results finalised. ${changes.length} handicap${changes.length === 1 ? '' : 's'} updated.` : 'Results finalised'); } });
  },
  reopen(){ const c = D.comps[S.compId]; if (!c) return; const changes = previewHcp(c.id, 'open');
    askConfirm('Reopen scoring?', `League points for ${c.name} are taken off until it's finalised again.${changes.length ? ' Handicaps go back: ' + changes.map(x => `${gName(x.gid)} ${fmtHi(x.from)} → ${fmtHi(x.to)}`).join(', ') + '.' : ''}`, 'Reopen', async () => {
      const data = Object.assign({}, c, {status:'open'}); delete data.id; if (await put(`comps/${c.id}`, data)) { localSet(`comps/${c.id}`, data); await syncHandicaps(); toast('Scoring reopened'); } }); },
  delComp(){
    const c = D.comps[S.compId]; if (!c) return;
    askConfirm('Delete competition?', `${c.name}, its entries and cards will be removed, along with their league points. This can't be undone.`, 'Delete', async () => {
      const ops = [].concat(entriesFor(c.id).map(e => ({path:`comps/${c.id}/entries/${e.golferId}`, del:true})), Object.values(D.cards).filter(x => x.compId === c.id).map(x => ({path:`comps/${c.id}/cards/${x.id}`, del:true})), [{path:`comps/${c.id}`, del:true}]);
      for (let i = 0; i < ops.length; i += 400) { if (!(await batch(ops.slice(i, i + 400)))) return; }
      S.compId = null; render(); toast('Competition deleted');
    }, true);
  },
  newGolfer(){ openSheet({type:'golfer'}); },
  editGolfer(el){ openSheet({type:'golfer', id:el.dataset.id}); },
  delGolfer(el){ const p = D.golfers[el.dataset.id]; if (!p) return; const email = golferEmails()[p.id];
    askConfirm('Delete golfer?', `${p.name} will be removed from the golfer list${email ? ' and can no longer sign in' : ''}. Their past cards stay in the results.`, 'Delete', async () => { const ops = [{path:`golfers/${p.id}`, del:true}]; if (email) ops.push({path:`members/${email}`, del:true}); if (await batch(ops)) { S.playerId = null; toast('Golfer deleted'); } }, true); },
  openPlayer(el){ closeSheetQuiet(); if (!D.golfers[el.dataset.id]) return; S.view = 'golfers'; S.playerId = el.dataset.id; top(); render(); },
  closePlayer(){ S.playerId = null; top(); render(); },
  golferTab(el){ S.golferTab = el.dataset.v; render(); },
  leagueTab(el){ S.leagueTab = el.dataset.v; render(); },
  closeSheet(){ closeSheet(); },
  confirmOk(){ const f = CONFIRM_FN; closeSheet(); if (f) f(); },
  scan(el){ const c = D.comps[el.dataset.cid || S.compId]; if (!c) return; const round = Number(el.dataset.round) || currentRound(c);
    if (!S.isAdmin && !entryOf(c.id, S.myGid)) { toast('Enter this month first.'); return; }
    if (!S.isAdmin) { const card = cardOf(c.id, round, S.myGid); if (!cardStarted(card)) { toast('Tap Start my round first. Do it before you tee off.'); return; } if (cardLocked(card)) { toast('This card locked at midnight.'); return; } }
    pickScanPhoto({cid:c.id, round}); },
  newScan(){ const ctx = S.sheet && S.sheet.ctx; if (!ctx) return; closeSheetQuiet(); pickScanPhoto(ctx); render(); },
  stopScan(){ if (SCAN_CTL) SCAN_CTL.aborted = true; closeSheet(); },
  applyScan(){ applyScan(); },
  pin(el){
    const P = S.pin; if (!P || P.busy) return; const v = el.dataset.v; const a = D.adminCode;
    if (Date.now() < (P.until || 0)) { P.err = `Too many tries. Wait ${Math.ceil((P.until - Date.now())/1000)} seconds.`; render(); return; }
    if (v === 'OK') { submitPin(); return; }
    if (v === 'C') P.val = ''; else if (v === 'B') P.val = P.val.slice(0, -1); else if (P.val.length < 8) P.val += v;
    P.err = '';
    if (P.mode === 'unlock' && a && a.len && P.val.length === a.len) { render(); submitPin(); return; }
    if (P.mode === 'confirm' && P.val.length === P.first.length) { render(); submitPin(); return; }
    render();
  },
  changePin(){ S.changing = true; S.pin = {mode:'create', val:'', first:'', err:''}; top(); render(); },
  cancelPin(){ S.changing = false; S.pin = null; render(); },
  lockAdmin(){ S.adminHash = null; S.pin = null; S.changing = false; try { localStorage.removeItem('rgc-admin'); } catch (_) {}
    if (S.myGid) { setMode(true); toast("Admin locked. You're seeing the app as a golfer."); }
    else { top(); render(); toast('Admin locked. Add yourself as a golfer on Home to see the golfer view.'); } },
  golferView(){ if (!S.myGid) { ACT.addMe(); return; } setMode(true); toast("You're seeing the app as a golfer. Tap your initials to switch back."); },
  organiserView(){ setMode(false); toast('Back to organiser view'); },
  addMe(){ closeSheetQuiet(); openSheet({type:'golfer', prefill: S.user.email}); },
  resetPin(){ askConfirm('Reset admin code?', 'Organisers can reset it. The current code stops working and you choose a new one.', 'Reset', async () => { if (await drop('config/admin')) { D.adminCode = null; S.adminHash = null; S.pin = null; try { localStorage.removeItem('rgc-admin'); } catch (_) {} render(); toast('Code cleared. Set a new one.'); } }, true); },
  async removeAdmin(el){ const e = el.dataset.email; const list = ((D.admins && D.admins.emails) || []).filter(x => x !== e); if (!list.length) return; if (await put('config/admins', Object.assign({}, D.admins, {emails:list}))) toast('Organiser removed'); }
};
const FORMS = {
  async signin(f){ const fd = new FormData(f); S.busy = true; render(); try { await be.signInEmail(String(fd.get('email')).trim(), String(fd.get('pw'))); } catch (e) { toast(authErr(e)); } finally { S.busy = false; render(); } },
  async signup(f){ const fd = new FormData(f); S.busy = true; render(); try { await be.signUpEmail(String(fd.get('email')).trim(), String(fd.get('pw'))); toast('Account created. Check your email to confirm it.'); } catch (e) { toast(authErr(e)); } finally { S.busy = false; render(); } },
  async comp(f){
    const fd = new FormData(f); const k = cfg(); const preset = fd.get('holes');
    const holes = preset === '18' ? range(1,18) : preset === '14' ? range(1,14) : fd.getAll('h').map(Number).sort((a,b) => a-b);
    if (!holes.length) { toast('Pick at least one hole'); return; }
    const count = Math.max(1, Math.min(5, Number(fd.get('rcount')) || 4)); const per = !!fd.get('perround');
    const rows = range(1, count).map(i => ({from: fd.get('r' + i), format: per ? fd.get('rf' + i) || null : null, tee: per ? fd.get('rt' + i) || null : null, holes: per ? ({'18': range(1,18), '14': range(1,14)})[fd.get('rh' + i)] || null : null}));
    if (rows.some(r => !r.from)) { toast('Set a date for every round'); return; }
    if (rows.some(r => parseDate(r.from).getDay() !== 5)) { toast('Each round should start on a Friday'); return; }
    rows.sort((a, b) => a.from.localeCompare(b.from)); const sorted = rows.map(r => r.from);
    const rounds = rows.map((r, i) => ({n:i+1, from:r.from, to:addDays(r.from, 2), opens: be.stamp(parseDate(r.from)), closes: be.stamp(parseDate(addDays(r.from, 3))), format:r.format, tee:r.tee, holes:r.holes}));
    const best = Math.min(count, Math.max(1, Number(fd.get('best')) || count));
    const id = S.sheet.id || newId(); const prev = D.comps[id] || {}; const format = fd.get('format') || 'stableford';
    const data = Object.assign({}, prev, {name: String(fd.get('name') || '').trim() || `${dParts(sorted[0]).month} ${FORMATS[format].short}`, date: sorted[0], rounds, best, format, holes, tee: fd.get('tee') || k.tee, fee: num(fd.get('fee'), k.fee), allowance: num(fd.get('allowance'), k.allowance), status: prev.status || 'open', createdAt: prev.createdAt || Date.now()});
    delete data.id;
    if (await put(`comps/${id}`, data)) { localSet(`comps/${id}`, data); closeSheetQuiet(); S.view = 'comps'; S.compId = id; S.card = null; S.compTab = 'entries'; top(); render(); toast(prev.name ? 'Competition updated' : 'Month created'); }
  },
  async addEntries(f){
    const fd = new FormData(f); const ids = fd.getAll('gid'); const pay = fd.get('pay') || ''; const c = D.comps[S.compId];
    if (!c) return; if (!ids.length) { toast('Tick at least one golfer'); return; }
    if (await batch(ids.map(gid => ({path:`comps/${c.id}/entries/${gid}`, data:{compId:c.id, golferId:gid, paid:!!pay, method:pay || null, paidAt: pay ? new Date().toISOString() : null, createdAt:Date.now()}})))) { closeSheet(); toast(`${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} added`); }
  },
  async golfer(f){
    const fd = new FormData(f); const name = String(fd.get('name') || '').trim(); if (!name) { toast('Add a name'); return; }
    const email = normEmail(fd.get('email')); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('That email doesn\'t look right'); return; }
    const id = S.sheet.id || newId(); const prev = D.golfers[id] || {}; const oldEmail = golferEmails()[id];
    if (email && D.members[email] && D.members[email].golferId !== id) { toast(`${email} is already used by ${gName(D.members[email].golferId)}`); return; }
    const gdata = {name, hi: parseHi(fd.get('hi')), gender: fd.get('gender') === 'L' ? 'L' : 'M', createdAt: prev.createdAt || Date.now()};
    const savedG = D.golfers[id]; D.golfers[id] = Object.assign({}, gdata, {id}); MEMO = {}; const l = hcpLedger()[id]; if (savedG) D.golfers[id] = savedG; else delete D.golfers[id]; MEMO = {};
    gdata.hcp = l ? l.current : gdata.hi;
    const ops = [{path:`golfers/${id}`, data:gdata}];
    if (oldEmail && oldEmail !== email) ops.push({path:`members/${oldEmail}`, del:true});
    if (email) ops.push({path:`members/${email}`, data:{golferId:id, name}});
    if (await batch(ops)) { closeSheet(); toast(prev.name ? 'Golfer updated' : `${name} added`); }
  },
  async shots(f){ const {cid, round, gid} = S.card; const prev = cardOf(cid, round, gid); const v = parseInt(new FormData(f).get('shots'), 10); const g = D.golfers[gid];
    const data = Object.assign(cardBase(cid, round, gid), {shots: isFinite(v) ? v : null, updatedAt:Date.now(), updatedBy:S.user.uid});
    if (await put(`comps/${cid}/cards/${round}_${gid}`, data)) { closeSheet(); toast('Shots updated'); } },
  async joinReq(f){ const fd = new FormData(f); const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!name) { toast('Add your name'); return; }
    const raw = String(fd.get('hi') || '').trim(); const hi = parseHi(raw); if (raw && (hi === null || hi < -10 || hi > 54)) { toast('That handicap doesn\'t look right'); return; }
    const data = {name, hi, gender: fd.get('jgender') === 'L' ? 'L' : 'M', email: S.user.email, createdAt: Date.now()};
    if (await put('requests/' + S.user.email, data)) { D.myReq = data; render(); toast('Request sent to the organiser'); sendNotify('New join request', `${name} wants to join. Open the app to let them in.`, 'wave'); } },
  async approveJoin(f){ const fd = new FormData(f); const email = S.sheet && S.sheet.email; if (!email) return;
    const link = String(fd.get('link') || ''); const ops = [{path:'requests/' + email, del:true}];
    if (D.members[email]) { if (await batch(ops)) { closeSheet(); toast('That email is already on the list'); } return; }
    if (link && D.golfers[link]) {
      const old = golferEmails()[link]; if (old) ops.push({path:'members/' + old, del:true});
      ops.push({path:'members/' + email, data:{golferId:link, name:gName(link)}});
      if (await batch(ops)) { delete D.requests[email]; closeSheet(); toast(`${gName(link)} can now sign in with ${email}`); } return;
    }
    const name = String(fd.get('name') || '').trim(); if (!name) { toast('Add a name'); return; }
    const hi = parseHi(fd.get('hi')); const id = newId();
    ops.push({path:'golfers/' + id, data:{name, hi, hcp:hi, gender: fd.get('gender') === 'L' ? 'L' : 'M', createdAt:Date.now()}}, {path:'members/' + email, data:{golferId:id, name}});
    if (await batch(ops)) { delete D.requests[email]; closeSheet(); toast(`${name} added. They're in now.`); } },
  async addAdmin(f){ const e = normEmail(new FormData(f).get('email')); if (!e) return; const list = [...new Set(((D.admins && D.admins.emails) || []).concat(e))]; if (await put('config/admins', Object.assign({}, D.admins, {emails:list}))) toast(`${e} is now an organiser`); }
};
let settingsTimer = null;
function saveSettings(){
  const g = id => document.getElementById(id); const k = cfg();
  const n = (id, d) => { const el = g(id); const v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : d; };
  const course = {parM:[], siM:[], parL:[], siL:[]};
  range(1,18).forEach(h => { course.parM.push(n('c-pm-'+h, k.course.parM[h-1])); course.siM.push(n('c-sm-'+h, k.course.siM[h-1])); course.parL.push(n('c-pl-'+h, k.course.parL[h-1])); course.siL.push(n('c-sl-'+h, k.course.siL[h-1])); });
  const rev = String((g('s-rev') || {}).value || '').trim().replace(/^https?:\/\/(www\.)?revolut\.me\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
  const data = { fee:n('s-fee', k.fee), revtag:rev, prize:[n('s-p1', k.prize[0]), n('s-p2', k.prize[1] != null ? k.prize[1] : 0)], points:[n('s-pt1', k.points[0]), n('s-pt2', k.points[1]), n('s-pt3', k.points[2]), n('s-pt4', k.points[3])], entryPoint:n('s-pte', k.entryPoint), rounds: Math.max(1, Math.min(5, n('s-rounds', k.rounds))), best: Math.max(1, Math.min(5, n('s-best', k.best))), allowance:n('s-allow', k.allowance), tee:(g('s-tee') || {}).value || k.tee, course, bands: (() => { const a = n('s-b1', k.bands[0]), b = n('s-b2', k.bands[1]); return a < b ? [a, b] : k.bands; })(), cutWin:[n('s-w1', k.cutWin[0]), n('s-w2', k.cutWin[1]), n('s-w3', k.cutWin[2])], cutRun:[n('s-r1', k.cutRun[0]), n('s-r2', k.cutRun[1]), n('s-r3', k.cutRun[2])], riseBy:n('s-rb', k.riseBy), riseAfter:Math.max(1, Math.round(n('s-ra', k.riseAfter))), hcpMax:n('s-hm', k.hcpMax) };
  D.settings = data; MEMO = {};
  clearTimeout(settingsTimer); settingsTimer = setTimeout(async () => { if (await put('config/settings', data)) { syncHandicaps(); toast('Settings saved'); } }, 400);
}

/* ---------- Sample data ---------- */
function sampleGolfers(){ return [['Mick Doyle',14.2,'M','mick@example.com'],['Ger Byrne',9.8,'M','ger@example.com'],['Aoife Kinsella',18.4,'L','aoife@example.com'],['Paddy Nolan',22.1,'M','paddy@example.com'],['Tom Kavanagh',6.3,'M','tom@example.com'],['Mary Hayden',24.6,'L','mary@example.com'],['Declan Fitzgerald',12.0,'M','declan@example.com'],['Niamh Dunne',11.7,'L','niamh@example.com']]; }
function sampleData(){
  let a = 20261024; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v); };
  const st = {}; const now = new Date();
  st['config/admins'] = {emails:['organiser@example.com']};
  st['config/settings'] = {revtag:'yourname', fee:10};
  const gs = sampleGolfers().map((g, i) => { const id = 'g' + i; st['golfers/' + id] = {name:g[0], hi:g[1], gender:g[2]}; st['members/' + g[3]] = {golferId:id, name:g[0]}; return {id, name:g[0], hi:g[1], gender:g[2]}; });
  const mk = (cid, name, y, m, status, fmt) => {
    const first = iso(firstFriday(y, m)); const rounds = weekendRounds(first, 4).map(r => Object.assign(r, {opens: parseDate(r.from).getTime(), closes: parseDate(addDays(r.from, 3)).getTime()}));
    st['comps/' + cid] = {name, date:first, rounds, best:3, format:fmt, holes:range(1,18), tee:'white', fee:10, allowance:95, status};
    gs.forEach((g, i) => { const unpaid = status === 'open' && (i === 5 || i === 3); const claimed = status === 'open' && i === 3;
      st[`comps/${cid}/entries/${g.id}`] = {compId:cid, golferId:g.id, paid: !unpaid, method: unpaid ? null : ['revolut','card'][i % 2], paidAt: unpaid ? null : new Date().toISOString(), createdAt: Date.now(), claimed, claimMethod: claimed ? 'revolut' : null, claimedAt: claimed ? Date.now() - 3600e3 : null}; });
    rounds.forEach(r => {
      const state = roundState(r); if (state === 'upcoming') return;
      const playing = gs.filter(() => rnd() > 0.15);
      for (let i = 0; i + 1 < playing.length; i += 2) {
        const pair = playing.slice(i, i + (playing.length - i === 3 ? 3 : 2)); if (pair.length === 3) i++;
        pair.forEach((p, j) => {
          const par = p.gender === 'L' ? COURSE.parL : COURSE.parM; const scores = {};
          const upto = state === 'open' && j === 0 && i === 0 ? 11 : 18;
          range(1, upto).forEach(h => { let d = Math.round(gauss() * 0.95 + p.hi / 18 - 0.2); if (d <= -2 && rnd() > 0.25) d = -1; d = Math.min(d, 4); scores[h] = (fmt === 'stableford' && d >= 4 && rnd() < 0.4) ? 'P' : Math.max(1, par[h-1] + d); });
          const signed = !(state === 'open' && i === 2 && j === 1);
          const startedAt = parseDate(r.from).getTime() + (9 + i) * 3600e3;
          st[`comps/${cid}/cards/${r.n}_${p.id}`] = {compId:cid, golferId:p.id, round:r.n, marker: pair[(j + 1) % pair.length].name, signed, scores, hi:p.hi, shots:null, startedAt, deadline: endOfDay(startedAt)};
        });
      }
    });
  };
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  mk('sample-prev', `${MONTHS[pm.getMonth()]} Stableford`, pm.getFullYear(), pm.getMonth(), 'final', 'stableford');
  mk('sample-now', `${MONTHS[now.getMonth()]} Stableford`, now.getFullYear(), now.getMonth(), 'open', 'stableford');
  return st;
}

/* ---------- Wiring ---------- */
document.addEventListener('click', ev => { const el = ev.target.closest('[data-act]'); if (!el) return; const fn = ACT[el.dataset.act]; if (!fn) return; if (el.tagName === 'A') return; ev.preventDefault(); fn(el); });
document.addEventListener('submit', ev => { const f = ev.target; const k = f.dataset && f.dataset.form; if (!k) return; ev.preventDefault(); if (FORMS[k]) FORMS[k](f); });
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'season') { S.season = t.value; render(); return; }
  if (t.id === 'leagueMonth') { S.leagueMonth = t.value; S.boardSel = 'month'; t.blur(); render(); return; }
  if (t.id === 'scanFile') { startScan(t.files); return; }
  if (t.id === 'photoFile') { const ctx = PHOTO_PENDING; PHOTO_PENDING = null; const file = t.files && t.files[0]; if (!ctx || !file) return;
    let thumbs = []; try { thumbs = [URL.createObjectURL(file)]; } catch (_) {} openSheet({type:'photo', ctx, file, thumbs}); return; }
  if (t.id === 'pinRemember') { S.pinRemember = t.checked; if (!t.checked) { try { localStorage.removeItem('rgc-admin'); } catch (_) {} } return; }
  if ((t.id === 'markerName' || t.id === 'signedChk') && S.card) { const {cid, round, gid} = S.card;
    const name = String(($('#markerName') || {}).value || '').trim().slice(0, 60); const chk = $('#signedChk'); let signed = !!(chk && chk.checked);
    if (signed && !name) { if (chk) chk.checked = false; signed = false; toast("Add your marker's name first."); }
    const base = cardBase(cid, round, gid); if (base.marker === name && base.signed === signed) return;
    const data = Object.assign(base, {marker:name, signed, updatedAt:Date.now(), updatedBy:S.user.uid}); const path = `comps/${cid}/cards/${round}_${gid}`; const before = cardCounts(cid, round, gid);
    // Typing the name then tapping the tick: wait a moment before redrawing so the tap isn't lost.
    localSet(path, data); notifyIfDone(cid, round, gid, before); if (t.id === 'signedChk') render(); else setTimeout(render, 350); put(path, data).then(ok => ok && t.id === 'signedChk' && toast(signed ? (markedOK(data) && scoreCard(D.comps[cid], round, gid).complete ? 'Signed. Your card counts now.' : 'Ticked as signed.') : 'Unticked. The card won\'t count until it\'s ticked as signed.')); return; }
  if (t.closest('#setupForm')) { saveSettings(); return; }
  if (t.name === 'holes' && t.closest('form[data-form=comp]')) { $('#holepick').hidden = t.value !== 'custom'; return; }
  if (t.id === 'f-rcount') { const n = Number(t.value); const box = $('#f-rounds'); const show = !!($('#f-perround') || {}).checked;
    const have = [...box.querySelectorAll('.rrow')].map((row, i) => { const v = id => (document.getElementById(id + (i + 1)) || {}).value || ''; const hv = v('f-rh-'); return {from:v('f-r-'), format:v('f-rf-') || null, tee:v('f-rt-') || null, holes: hv === '18' ? range(1,18) : hv === '14' ? range(1,14) : null}; });
    const first = (have[0] && have[0].from) || defaultFirstFri();
    box.innerHTML = range(1, n).map(i => roundRow(i, have[i-1] && have[i-1].from ? have[i-1] : {from: addDays(first, 7*(i-1))}, show)).join(''); const b = $('#f-best'); if (b && Number(b.value) > n) b.value = String(n); return; }
  if (t.id === 'jq-link') { const box = $('#jq-new'); if (box) box.hidden = !!t.value; return; }
  if (t.id === 'f-perround') { document.querySelectorAll('#f-rounds .rrow-opts').forEach(x => { x.hidden = !t.checked; }); return; }
  if (t.id === 'f-r-1') { const ins = [...document.querySelectorAll('#f-rounds input[type=date]')]; ins.slice(1).forEach((inp, i) => { inp.value = addDays(t.value, 7*(i+1)); }); }
});
document.addEventListener('toggle', ev => { if (ev.target.id === 'courseDetails') S.courseOpen = ev.target.open; }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.sheet) closeSheet(); });
document.addEventListener('focusout', () => { if (deferred) { deferred = false; setTimeout(render, 350); } });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
// Spot a newer version on GitHub (the version name lives in sw.js) and offer to load it,
// so phones that keep the app open in the background still pick up changes.
let APP_VER = null, verAt = 0;
async function checkVersion(){
  verAt = Date.now();
  try { const r = await fetch('./sw.js', {cache:'no-store'}); if (!r.ok) return; const v = (/VERSION = '([^']+)'/.exec(await r.text()) || [])[1]; if (!v) return;
    if (!APP_VER) APP_VER = v; else if (v !== APP_VER && !S.updateReady) { S.updateReady = true; render(); } } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - verAt > 5 * 60e3) checkVersion(); });
setInterval(() => { if (document.visibilityState === 'visible') checkVersion(); }, 30 * 60e3);
checkVersion();
const hv = (location.hash || '').slice(1); if (['home','table','me','comps','golfers','admin'].includes(hv)) S.view = hv; else if (hv === 'league') S.view = 'table';
window.__rgc = {S, D, scoreCard, leaderboard, roundBoard, league, allocShots, checkVersion};
boot();
