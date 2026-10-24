// Rathsallagh Monthly — installable competition app.
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
const TEES = { white:{name:'White', cr:70.3, slope:125, par:72}, blue:{name:'Blue', cr:71.7, slope:127, par:72}, black:{name:'Black', cr:74.0, slope:132, par:72} };
const RED = {name:'Red', cr:72.2, slope:122, par:73};
const FORMATS = {
  stableford:{name:'Stableford', short:'Stableford', better:'high'},
  medal:{name:'Stroke play (nett)', short:'Medal', better:'low'},
  gross:{name:'Stroke play (gross)', short:'Gross', better:'low'},
  parbogey:{name:'v Par', short:'v Par', better:'high'}
};
const DEFAULTS = { fee:10, revtag:'', points:[5,4,3,2], entryPoint:1, prize:[60,40], allowance:95, tee:'white', rounds:4, best:3, cutWinner:2, cutRunner:1, riseBy:0.5, riseAfter:2, hcpMax:54 };
const METHODS = {revolut:'Revolut', card:'Card reader', cash:'Cash'};

/* ---------- State ---------- */
let be = null;
const D = { golfers:{}, comps:{}, entries:{}, groups:{}, cards:{}, members:{}, settings:null, admins:undefined, adminCode:undefined, member:undefined };
const S = {
  phase:'boot', user:null, myGid:null, isAdmin:false, view:'comps', compId:null, compTab:'entries', boardSel:'month',
  card:null, activeHole:null, playerId:null, season:String(new Date().getFullYear()), sheet:null, loaded:{},
  adminHash:null, pin:null, changing:false, golferTab:'list', hcpSynced:false, pinRemember:true, courseOpen:false, installEvt:null, signinMode:'signin', busy:false
};
let MEMO = {}, CONFIRM_FN = null, unsubs = [], SCAN_CTL = null, SCAN_PENDING = null;
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
function initials(name){ return String(name||'?').split(/\s+/).map(w => w.replace(/[^\p{L}]/gu, '')).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || '?'; }
function normEmail(e){ return String(e || '').trim().toLowerCase(); }
function newId(){ return be ? be.newId() : Math.random().toString(36).slice(2, 12); }
function cfg(){
  const s = D.settings || {}; const c = s.course || {};
  const okArr = (a, d) => Array.isArray(a) && a.length === 18 && a.every(x => isFinite(x)) ? a.map(Number) : d;
  return Object.assign({}, DEFAULTS, s, {
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
function groupsFor(cid, round){ return Object.values(D.groups).filter(g => g.compId === cid && g.round === round); }
function groupOf(cid, round, gid){ return groupsFor(cid, round).find(g => (g.members || []).includes(gid)) || null; }

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
function markedOK(card){
  if (!card || !card.markerId || card.markerId === card.golferId) return false;
  const g = D.groups[card.compId + '/' + card.groupId];
  return !!(g && g.round === card.round && (g.members || []).includes(card.markerId) && (g.members || []).includes(card.golferId));
}
function scoreCard(comp, round, gid){
  const g = D.golfers[gid]; const card = cardOf(comp.id, round, gid);
  const {par, si} = parsFor(g); const holes = comp.holes || [];
  const total = cardShots(card, comp, g); const alloc = allocShots(holes, si, total);
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
  const stroke = comp.format === 'medal' || comp.format === 'gross';
  const marked = markedOK(card);
  const nr = stroke && pickups > 0;
  return {comp, round, gid, golfer:g, card, rows, total, gross, runNett, runPar, pts, pb, filled, complete, nr, pickups, parSum, marked, valid: complete && !nr && marked};
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
function cardStatus(sc){ if (!sc.card || !sc.filled) return 'No card'; if (!sc.complete) return 'Thru ' + sc.filled; if (sc.nr) return 'NR'; if (!sc.marked) return 'Not marked'; return ''; }
function cardValueText(sc){
  const c = sc.comp;
  if (c.format === 'medal') return String(sc.runNett);
  if (c.format === 'gross') return String(sc.gross);
  if (c.format === 'parbogey') return pbStr(sc.pb);
  return String(sc.pts);
}
function roundBoard(comp, n){
  const key = `rb:${comp.id}:${n}`; if (MEMO[key]) return MEMO[key];
  const hi = higher(comp);
  const all = entriesFor(comp.id).map(e => scoreCard(comp, n, e.golferId));
  const ranked = all.filter(sc => sc.valid);
  ranked.forEach(sc => sc.keys = cbKeys(comp, sc));
  const cmp = (a,b) => { for (let i = 0; i < a.keys.length; i++) { const d = b.keys[i] - a.keys[i]; if (d) return hi ? d : -d; } return 0; };
  ranked.sort((a,b) => cmp(a,b) || byName(a.golfer, b.golfer));
  let pos = 0; ranked.forEach((sc,i) => { if (i === 0 || cmp(ranked[i-1], sc) !== 0) pos = i + 1; sc.pos = pos; });
  ranked.forEach((sc,i) => { const p = ranked[i-1], q = ranked[i+1]; sc.tied = (p && p.pos === sc.pos) || (q && q.pos === sc.pos); sc.onCb = !sc.tied && ((p && p.keys[0] === sc.keys[0]) || (q && q.keys[0] === sc.keys[0])); });
  const rest = all.filter(sc => !sc.valid).sort((a,b) => b.filled - a.filled || byName(a.golfer, b.golfer));
  return (MEMO[key] = {ranked, rest});
}
function leaderboard(comp){
  const key = 'lb:' + comp.id; if (MEMO[key]) return MEMO[key];
  const k = cfg(); const rs = compRounds(comp); const best = compBest(comp); const hi = higher(comp); const final = comp.status === 'final';
  const rows = entriesFor(comp.id).map(e => {
    const cards = rs.map(r => scoreCard(comp, r.n, e.golferId));
    const valid = cards.filter(sc => sc.valid).map(sc => ({sc, v: metric(comp, sc.rows)}));
    valid.sort((a,b) => hi ? b.v - a.v : a.v - b.v);
    const counted = valid.slice(0, best);
    const countedNs = new Set(counted.map(x => x.sc.round));
    const total = counted.reduce((a,x) => a + x.v, 0);
    const last = counted.slice().sort((a,b) => b.sc.round - a.sc.round)[0];
    return {entry:e, gid:e.golferId, golfer:D.golfers[e.golferId], cards, counted, countedNs, count:counted.length, total, keys: last ? cbKeys(comp, last.sc) : [], parSum: counted.reduce((a,x) => a + x.sc.runPar, 0), started: cards.some(c => c.filled > 0)};
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
  return (MEMO[key] = {ranked, rest, all: ranked.concat(rest), stats: st, best, rounds: rs});
}
function monthText(r, comp){
  if (!r.count) return '–';
  if (comp.format === 'parbogey') return pbStr(r.total);
  return String(r.total);
}
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
function hcpRules(){ const k = cfg(); return {win: num(k.cutWinner, 2), second: num(k.cutRunner, 1), rise: num(k.riseBy, 0.5), after: Math.max(1, Math.round(num(k.riseAfter, 2))), max: num(k.hcpMax, 54)}; }
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
      if (r.pos === 1) { change = -R.win; reason = `Won ${c.name}`; l.streak = 0; }
      else if (r.pos === 2) { change = -R.second; reason = `Runner-up in ${c.name}`; l.streak = 0; }
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
  return n === 1 ? `Goes up ${R.rise} after ${next} unless they win or finish runner-up.` : `Goes up ${R.rise} after ${n} more months without a cut.`;
}
function hcpOps(){
  const L = hcpLedger(); const ops = [];
  Object.values(D.golfers).forEach(g => { const l = L[g.id]; if (!l || l.base === null) return; if (snapHcp(g) !== l.current) ops.push({path:`golfers/${g.id}`, data: Object.assign({}, g, {hcp:l.current})}); });
  return ops;
}
async function syncHandicaps(){ if (!S.isAdmin) return; const ops = hcpOps(); if (ops.length) { ops.forEach(o => localSet(o.path, o.data)); await batch(ops); } }
function previewHcp(cid, status){
  const before = hcpLedger(); const c = D.comps[cid]; const saved = c.status;
  c.status = status; MEMO = {}; const after = hcpLedger(); c.status = saved; MEMO = {};
  return Object.keys(after).map(gid => ({gid, from: before[gid] && before[gid].current, to: after[gid].current})).filter(x => x.from !== null && x.from !== x.to);
}

/* ---------- Who can do what (mirrors firestore.rules) ---------- */
function myGroup(cid, round){ return S.myGid ? groupOf(cid, round, S.myGid) : null; }
function canMark(cid, round, gid){
  const c = D.comps[cid]; if (!c) return false;
  if (S.isAdmin) return true;
  if (!S.myGid || gid === S.myGid || c.status !== 'open' || !roundOpenNow(c, round)) return false;
  const g = myGroup(cid, round); return !!(g && g.members.includes(gid));
}
function errText(e){
  const code = e && e.code || '';
  if (code === 'permission-denied' || /permission/i.test(e && e.message || '')) return (e && e.message && !/Missing or insufficient/i.test(e.message)) ? e.message : "That isn't allowed. Only someone from the group can mark a card, and only while the round is open.";
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
  Object.assign(D, { golfers:{}, comps:{}, entries:{}, groups:{}, cards:{}, members:{}, settings:null, admins:undefined, adminCode:undefined, member:undefined });
  S.loaded = {}; S.user = u; S.myGid = null; S.isAdmin = false; MEMO = {};
  if (!u) { S.phase = 'signin'; render(); return; }
  if (!u.emailVerified) { S.phase = 'verify'; render(); return; }
  S.phase = 'checking'; render();
  const err = e => { console.warn(e); if (S.phase === 'checking') { S.phase = 'nomember'; render(); } };
  unsubs.push(be.watch('config/admins', d => { D.admins = d ? d.data : null; resolveRole(); }, err));
  unsubs.push(be.watch('members/' + u.email, d => { D.member = d ? d.data : null; resolveRole(); }, () => { D.member = null; resolveRole(); }));
}
function resolveRole(){
  if (D.admins === undefined || D.member === undefined) return;
  const email = S.user.email;
  const wasAdmin = S.isAdmin, wasGid = S.myGid;
  S.isAdmin = !!(D.admins && (D.admins.emails || []).includes(email));
  S.myGid = D.member ? D.member.golferId : null;
  if (!S.isAdmin && !S.myGid) { S.phase = D.admins ? 'nomember' : 'bootstrap'; stopDataOnly(); render(); return; }
  if (S.phase !== 'app' || wasAdmin !== S.isAdmin || wasGid !== S.myGid) { S.phase = 'app'; startData(); }
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
  if (S.isAdmin) { const wait = setInterval(() => { if (S.loaded.golfers && S.loaded.comps && S.loaded.entries && S.loaded.cards && S.loaded.groups && S.loaded.settings) { clearInterval(wait); if (!S.hcpSynced) { S.hcpSynced = true; syncHandicaps(); } } }, 800); dataUnsubs.push(() => clearInterval(wait)); }
  group('entries', 'entries'); group('groups', 'groups'); group('cards', 'cards');
  dataUnsubs.push(be.watch('config/settings', d => { D.settings = d ? d.data : null; S.loaded.settings = true; MEMO = {}; render(); }, err));
  if (S.isAdmin) {
    dataUnsubs.push(be.watch('config/admin', d => { D.adminCode = d ? d.data : null; restoreAdmin(); S.loaded.adminCode = true; render(); }, () => { D.adminCode = null; S.loaded.adminCode = true; render(); }));
    dataUnsubs.push(be.watch('members', docs => { D.members = {}; docs.forEach(d => D.members[d.id] = d.data); render(); }, () => {}));
  }
}

/* ---------- Rendering ---------- */
let rq = false, deferred = false;
function render(){ if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; doRender(); }); }
const ICONS = {
  comps:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3"/><path d="M7 4h10l-2.5 3.5L17 11H7"/><path d="M4 21h9"/></svg>',
  league:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"/><path d="M5 20v-6h4v6"/><path d="M10 20V8h4v12"/><path d="M15 20v-4h4v4"/></svg>',
  golfers:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/></svg>',
  admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8h3.5l2-3h6l2 3h3.5v11h-17z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  group:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5"/><path d="M15.5 14.2c2.2.1 4 1.6 4.5 4.3"/></svg>'
};
function doRender(){
  const ae = document.activeElement; const main = $('#main');
  if (ae && ae.matches && ae.matches('input,select,textarea') && main.contains(ae)) { deferred = true; return; }
  MEMO = {};
  $('#acct').innerHTML = S.user && S.phase === 'app' ? `<button class="acct" data-act="account" aria-label="Account">${esc(initials(S.myGid ? gName(S.myGid) : (S.user.name || S.user.email)))}</button>` : '';
  $('#role').textContent = SAMPLE ? 'Sample' : S.isAdmin ? 'Organiser' : S.myGid ? 'Golfer' : '';
  $('#role').hidden = !(S.phase === 'app' || SAMPLE);
  const banner = $('#banner');
  banner.hidden = !SAMPLE;
  if (SAMPLE) banner.innerHTML = `<div class="wrap"><span>Sample data, kept on this phone only.</span>${CONFIGURED ? '<a href="./">Open the real league</a>' : ''}</div>`;
  const inApp = S.phase === 'app';
  const tabs = [['comps','Comps'],['league','League'],['golfers','Golfers']]; if (S.isAdmin) tabs.push(['admin','Admin']);
  if (S.view === 'admin' && !S.isAdmin) S.view = 'comps';
  $('#tabsIn').innerHTML = inApp ? tabs.map(([k,l]) => `<button class="tab" data-act="tab" data-v="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${ICONS[k]}<span>${l}</span></button>`).join('') : '';
  let html;
  if (S.phase === 'boot' || S.phase === 'checking') html = '<p class="loading">Loading…</p>';
  else if (S.phase === 'error') html = viewError();
  else if (S.phase === 'setup') html = viewSetupNeeded();
  else if (S.phase === 'signin') html = viewSignin();
  else if (S.phase === 'verify') html = viewVerify();
  else if (S.phase === 'nomember') html = viewNoMember();
  else if (S.phase === 'bootstrap') html = viewBootstrap();
  else if (!(S.loaded.golfers && S.loaded.comps && S.loaded.entries && S.loaded.cards && S.loaded.groups)) html = '<p class="loading">Loading the league…</p>';
  else if (S.view === 'league') html = viewLeague();
  else if (S.view === 'golfers') html = S.playerId ? viewPlayer() : viewGolfers();
  else if (S.view === 'admin') html = viewAdmin();
  else html = S.card ? viewCard() : S.compId ? viewComp() : viewComps();
  main.innerHTML = html;
  const kp = !!main.querySelector('.keypad');
  document.body.classList.toggle('with-keypad', kp);
  $('#tabs').hidden = kp || !inApp;
}
function backBtn(label, act){ return `<button class="back" data-act="${act}">${ICONS.back}${esc(label)}</button>`; }
function chipsFor(c){
  const k = cfg(); const t = TEES[c.tee] || TEES.white; const rs = compRounds(c);
  return `<span class="chip">${esc((FORMATS[c.format]||FORMATS.stableford).short)}</span><span class="chip">${(c.holes||[]).length} holes</span>${rs.length > 1 ? `<span class="chip">Best ${compBest(c)} of ${rs.length}</span>` : ''}<span class="chip">${t.name} tees</span><span class="chip">${euro(c.fee != null ? c.fee : k.fee)} entry</span>`;
}

/* ----- Signed-out screens ----- */
function viewError(){ return `<section class="empty"><span class="eyebrow">Couldn't start</span><h2>The app couldn't load</h2><p class="hint">Check your internet connection and reopen the app. (${esc(S.bootError || '')})</p></section>`; }
function viewSetupNeeded(){
  return `<section class="empty"><span class="eyebrow">Almost there</span><h2>Connect the app to Firebase</h2><p class="hint">This copy of the app hasn't been linked to its Firebase project yet. Follow the setup guide, then reload.</p><a class="btn primary" href="?sample=1">Try it with sample data</a></section>`;
}
function viewSignin(){
  if (SAMPLE) {
    const ids = [['organiser@example.com','Organiser (admin)']].concat(sampleGolfers().map(g => [g[3], g[0]]));
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
  return `<section class="signin"><span class="eyebrow">Not on the list yet</span><h1>Ask the organiser to add you</h1><p class="hint">You're signed in as <b>${esc(S.user.email)}</b>, but that email isn't on the golfer list. Ask the organiser to add it to your golfer profile, then reopen the app.</p>
    <button class="btn block" data-act="recheck">Check again</button><button class="textbtn" data-act="signout">Sign out</button></section>`;
}
function viewBootstrap(){
  return `<section class="signin"><span class="eyebrow">First-time setup</span><h1>Set yourself up as organiser</h1><p class="hint">Nobody runs this league yet. If you're the organiser, tap below. You'll be able to add golfers, competitions and other organisers.</p>
    <button class="btn primary block" data-act="bootstrap">I'm the organiser</button><button class="textbtn" data-act="signout">Sign out</button></section>`;
}

/* ----- Competitions ----- */
function viewComps(){
  const comps = Object.values(D.comps).sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  if (!comps.length) return emptyComps();
  const open = comps.filter(c => c.status !== 'final').sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  let h = '';
  if (open[0]) h += featured(open[0]);
  h += `<div class="sec-head"><h2>All competitions</h2>${S.isAdmin ? '<button class="btn small" data-act="newComp">+ New competition</button>' : ''}</div>`;
  h += '<ul class="list">' + comps.map(c => {
    const p = dParts(c.date); const fin = c.status === 'final';
    const lb = fin ? leaderboard(c) : null;
    const win = lb && lb.ranked[0] ? ' · Won by ' + esc(lb.ranked.filter(r => r.pos === 1).map(r => r.golfer.name).join(' & ')) : '';
    const rs = compRounds(c);
    return `<li><button class="row" data-act="openComp" data-id="${esc(c.id)}"><span class="row-date"><b>${p.day}</b>${p.mon}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${esc((FORMATS[c.format]||FORMATS.stableford).short)} · ${rs.length > 1 ? `best ${compBest(c)} of ${rs.length}` : `${(c.holes||[]).length} holes`}${win}</span></span><span class="pill ${fin ? 'final' : 'open'}">${fin ? 'Final' : 'Open'}</span></button></li>`;
  }).join('') + '</ul>';
  return h;
}
function featured(c){
  const st = compStats(c); const lb = leaderboard(c); const rs = compRounds(c);
  const open = rs.find(r => roundState(r) === 'open'); const next = rs.find(r => roundState(r) === 'upcoming');
  const show = open || next || rs[rs.length-1]; const p = dParts(show.from);
  const when = open ? `Round ${open.n} open now · ${roundLabel(open)}` : next ? `Round ${next.n} opens ${roundLabel(next)}` : 'All rounds played';
  const leader = lb.ranked[0];
  return `<section class="feature">
    <div class="datebox"><span class="dow">${p.dow}</span><span class="day">${p.day}</span><span class="mon">${p.mon}</span></div>
    <div class="feat-body">
      <span class="eyebrow">${esc(when)}</span>
      <h2 class="feat-name">${esc(c.name)}</h2>
      <div class="chips">${chipsFor(c)}</div>
      <dl class="figs"><div><dt>Entries</dt><dd>${st.entries}</dd></div><div><dt>Paid</dt><dd>${st.paid}</dd></div><div><dt>Pot</dt><dd>${euro(st.pot)}</dd></div></dl>
      ${leader ? `<p class="hint">Leading: <b>${esc(leader.golfer.name)}</b>, ${esc(monthText(leader, c))}${c.format === 'stableford' ? ' pts' : ''}</p>` : ''}
      <button class="btn primary" data-act="openComp" data-id="${esc(c.id)}">Open competition</button>
    </div>
  </section>`;
}
function emptyComps(){
  if (!S.isAdmin) return `<section class="empty"><span class="eyebrow">Nothing posted yet</span><h2>No competitions yet</h2><p class="hint">The organiser will post this month's competition here.</p></section>`;
  return `<section class="empty"><span class="eyebrow">Getting started</span><h2>Set up your first month</h2>
    <ol class="steps">
      <li><div><span><b>Add your golfers</b> with their handicap index and email, so they can sign in.</span><button class="btn small" data-act="newGolfer">Add a golfer</button></div></li>
      <li><div><span><b>Create the month.</b> Four weekend rounds, open Friday to Sunday; the best 3 count.</span><button class="btn small primary" data-act="newComp">New competition</button></div></li>
      <li><div><span><b>Check the settings</b> in Admin: entry fee, Revolut link, prizes and points.</span><button class="btn small" data-act="tab" data-v="admin">Open Admin</button></div></li>
    </ol></section>`;
}
function roundsStrip(c){
  return `<div class="rstrip">${compRounds(c).map(r => { const st = roundState(r); return `<button class="rtile ${st}" data-act="boardSel" data-v="${r.n}"><span class="rt-n">R${r.n}</span><span class="rt-d">${esc(shortRange(r))}</span><span class="rt-s">${st === 'open' ? 'Open now' : st === 'played' ? 'Played' : 'Upcoming'}</span></button>`; }).join('')}</div>`;
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
  if (!fin && S.myGid) h += myPanel(c);
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
  const k = cfg(); const fee = c.fee != null ? c.fee : k.fee;
  return k.revtag ? `<div class="paynote"><span>Pay your ${euro(fee)} entry by Revolut to <b>revolut.me/${esc(k.revtag)}</b>, or by card at the club.</span><a class="btn small" href="https://revolut.me/${encodeURIComponent(k.revtag)}" target="_blank" rel="noopener">Revolut</a></div>` : '';
}
function myPanel(c){
  const e = entryOf(c.id, S.myGid);
  if (!e) return `<section class="mypanel"><span class="eyebrow">You</span><h3>Enter this month</h3><p class="hint">One entry covers all ${compRounds(c).length} rounds. Your best ${compBest(c)} cards count.</p><button class="btn primary block" data-act="selfEnter">Enter ${esc(c.name)}</button>${payNote(c)}</section>`;
  const rs = compRounds(c); const open = rs.find(r => roundState(r) === 'open'); const next = rs.find(r => roundState(r) === 'upcoming');
  let h = `<section class="mypanel"><div class="mp-head"><span class="eyebrow">You're entered</span>${e.paid ? `<span class="pill final">Paid · ${esc(METHODS[e.method] || 'Paid')}</span>` : '<button class="paytag unpaid" data-act="pay" data-id="' + esc(c.id + '/' + S.myGid) + '">Unpaid</button>'}</div>`;
  if (!open) { h += `<p class="hint">${next ? `Round ${next.n} opens ${esc(roundLabel(next))}. Cards can only be marked Friday to Sunday.` : 'All rounds for this month have been played.'}</p></section>`; return h; }
  const g = myGroup(c.id, open.n);
  h += `<h3>Round ${open.n} · ${esc(roundLabel(open))}</h3>`;
  if (!g) return h + `<p class="hint">Before you play, set up your group. Only someone from your group can mark your card.</p><button class="btn primary block" data-act="newGroup" data-round="${open.n}">${ICONS.group}Start your group</button></section>`;
  h += `<ul class="grp">${g.members.map(gid => {
    const sc = scoreCard(c, open.n, gid); const me = gid === S.myGid;
    const status = !sc.filled ? 'No scores yet' : !sc.complete ? `Thru ${sc.filled}` : sc.marked ? `Marked by ${esc(gName(sc.card.markerId))}` : 'Complete, not marked';
    return `<li><span class="avatar sm">${esc(initials(gName(gid)))}</span><span class="grp-main"><b>${esc(gName(gid))}${me ? ' (you)' : ''}</b><small>${status}</small></span>${me ? `<button class="btn small" data-act="openCard" data-cid="${esc(c.id)}" data-round="${open.n}" data-gid="${esc(gid)}">View</button>` : `<button class="btn small primary" data-act="openCard" data-cid="${esc(c.id)}" data-round="${open.n}" data-gid="${esc(gid)}">Mark card</button>`}</li>`;
  }).join('')}</ul>`;
  h += `<div class="mp-tools"><button class="btn primary" data-act="scan" data-round="${open.n}">${ICONS.camera}Scan our card</button><button class="btn" data-act="editGroup" data-id="${esc(g.id)}">Change group</button></div>`;
  h += `<p class="hint">You mark the others in your group; someone else in the group marks yours.</p></section>`;
  return h;
}
function roundCells(c, row){
  return compRounds(c).map(r => { const sc = row.cards.find(x => x.round === r.n); let v = '–', cls = '';
    if (sc && sc.filled) { if (sc.valid) { v = cardValueText(sc); if (!row.countedNs.has(r.n)) { v = '(' + v + ')'; cls = 'dropped'; } } else { v = sc.complete && !sc.marked && !sc.nr ? cardValueText(sc) + '*' : sc.nr ? 'NR' : '…'; cls = 'pending'; } }
    return `<span class="rc ${cls}"><i>R${r.n}</i>${esc(v)}</span>`; }).join('');
}
function entriesHtml(c, lb){
  const A = S.isAdmin; const fin = c.status === 'final'; const cur = currentRound(c);
  const all = lb.all.slice().sort((a,b) => byName(a.golfer, b.golfer));
  let h = '';
  if (A && !fin) h += `<div class="entry-tools"><button class="btn primary" data-act="scan" data-round="${cur}">${ICONS.camera}Scan a card</button><button class="btn" data-act="addEntry">+ Add entries</button></div><div class="entry-tools" style="margin-top:8px"><button class="btn" data-act="newGroup" data-round="${cur}">${ICONS.group}Set up a group</button><button class="btn" data-act="compTab" data-v="groups">Groups</button></div>`;
  if (S.compTab === 'groups') return h + groupsHtml(c);
  if (!all.length) return h + `<div class="empty" style="margin-top:12px"><p class="hint">No entries yet.</p></div>`;
  h += `<p class="hint entry-hint">Tap a golfer to see their cards. A * means the card isn't marked by someone in their group yet, so it doesn't count. Brackets show a dropped round.</p>`;
  h += '<ul class="list">' + all.map(r => {
    const e = r.entry; const pay = A ? (e.paid ? `<button class="paytag paid" data-act="pay" data-id="${esc(c.id + '/' + r.gid)}">${esc(METHODS[e.method] || 'Paid')}</button>` : `<button class="paytag unpaid" data-act="pay" data-id="${esc(c.id + '/' + r.gid)}">Unpaid</button>`) : (e.paid ? '<span class="paytag paid">Paid</span>' : '<span class="paytag unpaid">Unpaid</span>');
    return `<li class="entry"><button class="entry-main" data-act="openCard" data-cid="${esc(c.id)}" data-round="${cur}" data-gid="${esc(r.gid)}"><span class="entry-name">${esc(r.golfer.name)}<span class="rcells">${roundCells(c, r)}</span></span><span class="entry-score ${r.count ? '' : 'dim'}">${r.count ? esc(monthText(r, c)) + (c.format === 'stableford' ? '<small>pts</small>' : '') : 'No total'}</span></button>${pay}</li>`;
  }).join('') + '</ul>';
  return h;
}
function groupsHtml(c){
  const rs = compRounds(c);
  let h = `<div class="sec-head"><h2>Groups by round</h2><button class="btn small" data-act="compTab" data-v="entries">Back to entries</button></div>`;
  rs.forEach(r => {
    const gs = groupsFor(c.id, r.n);
    h += `<div class="sec-head" style="margin-top:14px"><h2>Round ${r.n} · ${esc(shortRange(r))}</h2>${S.isAdmin && c.status === 'open' ? `<button class="btn small" data-act="newGroup" data-round="${r.n}">+ Group</button>` : ''}</div>`;
    h += gs.length ? `<ul class="list">${gs.map(g => `<li><button class="row" data-act="editGroup" data-id="${esc(g.id)}" ${S.isAdmin ? '' : 'disabled'}><span class="avatar sm">${g.members.length}</span><span class="row-main"><span class="row-title">${g.members.map(x => esc(gName(x))).join(', ')}</span><span class="row-sub">${g.members.filter(x => scoreCard(c, r.n, x).marked).length} of ${g.members.length} cards marked</span></span><span></span></button></li>`).join('')}</ul>` : '<p class="hint">No groups yet.</p>';
  });
  return h;
}
function boardHtml(c, lb){
  const rs = compRounds(c); const sel = S.boardSel;
  let h = rs.length > 1 ? `<div class="bsel"><button data-act="boardSel" data-v="month" aria-pressed="${sel === 'month'}">Month</button>${rs.map(r => `<button data-act="boardSel" data-v="${r.n}" aria-pressed="${String(sel) === String(r.n)}">R${r.n}</button>`).join('')}</div>` : '';
  if (sel !== 'month' && rs.length > 1) return h + roundBoardHtml(c, Number(sel));
  if (!lb.all.length) return h + '<div class="empty"><p class="hint">The leaderboard fills in as marked cards come in.</p></div>';
  const fin = c.status === 'final';
  const head = `<div class="lb-head"><span>Pos</span><span>Golfer</span><span>${rs.length > 1 ? 'Best ' + compBest(c) : 'Score'}</span><span>League</span></div>`;
  const rows = lb.ranked.map(r => {
    const tag = r.pos === 1 ? (fin ? 'Winner' : 'Leading') : r.pos === 2 ? 'Runner-up' : '';
    const note = r.count < compBest(c) ? `${r.count} of ${compBest(c)} rounds` : r.onCb ? 'on countback' : r.tied ? 'tied' : '';
    return `<li class="lb-row ${r.pos === 1 ? 'first' : ''}"><span class="lb-pos">${r.tied ? 'T' : ''}${r.pos}</span><button class="lb-name" data-act="openPlayer" data-id="${esc(r.gid)}">${esc(r.golfer.name)}${rs.length > 1 ? `<span class="rcells">${roundCells(c, r)}</span>` : ''}${note ? `<small>${note}</small>` : ''}${tag ? `<span class="tag">${tag}</span>` : ''}</button><span class="lb-score">${esc(monthText(r, c))}<small>${c.format === 'stableford' ? 'pts' : c.format === 'medal' ? 'nett' : c.format === 'gross' ? 'gross' : ''}</small></span><span class="lb-pts"><b>${r.points} pt${r.points === 1 ? '' : 's'}</b>${r.prize > 0.004 ? euro(r.prize) : ''}</span></li>`;
  }).join('');
  const rest = lb.rest.map(r => `<li class="lb-row lb-rest"><span class="lb-pos">–</span><button class="lb-name" data-act="openPlayer" data-id="${esc(r.gid)}">${esc(r.golfer.name)}<small>${esc(r.status)}</small></button><span class="lb-score"></span><span class="lb-pts"><b>${r.points} pt${r.points === 1 ? '' : 's'}</b></span></li>`).join('');
  const note = fin ? '' : `<p class="hint" style="margin-top:10px">Provisional. Only complete cards marked by someone in the golfer's group count. Golfers with fewer than ${compBest(c)} counting cards rank below those with ${compBest(c)}. League points are added when the organiser finalises the month.</p>`;
  return h + `<ul class="list">${head}${rows}${rest}</ul>${note}`;
}
function roundBoardHtml(c, n){
  const rb = roundBoard(c, n); const lb = leaderboard(c);
  const head = `<div class="lb-head"><span>Pos</span><span>Golfer</span><span>Score</span><span>Month</span></div>`;
  const rows = rb.ranked.map(sc => { const row = lb.all.find(r => r.gid === sc.gid); const counts = row && row.countedNs.has(n);
    return `<li class="lb-row ${sc.pos === 1 ? 'first' : ''}"><span class="lb-pos">${sc.tied ? 'T' : ''}${sc.pos}</span><button class="lb-name" data-act="openCard" data-cid="${esc(c.id)}" data-round="${n}" data-gid="${esc(sc.gid)}">${esc(sc.golfer.name)}<small>Marked by ${esc(gName(sc.card.markerId))}${sc.onCb ? ' · on countback' : ''}</small></button><span class="lb-score">${esc(cardValueText(sc))}<small>${c.format === 'stableford' ? 'pts' : ''}</small></span><span class="lb-pts"><b>${counts ? 'Counts' : 'Dropped'}</b></span></li>`; }).join('');
  const rest = rb.rest.map(sc => `<li class="lb-row lb-rest"><span class="lb-pos">–</span><button class="lb-name" data-act="openCard" data-cid="${esc(c.id)}" data-round="${n}" data-gid="${esc(sc.gid)}">${esc(sc.golfer.name)}<small>${esc(cardStatus(sc))}</small></button><span class="lb-score"></span><span class="lb-pts"></span></li>`).join('');
  return `<ul class="list">${head}${rows}${rest}</ul>`;
}

/* ----- Scorecard ----- */
function viewCard(){
  const {cid, round, gid} = S.card; const c = D.comps[cid]; const g = D.golfers[gid];
  if (!c || !g) { S.card = null; return viewComp(); }
  const sc = scoreCard(c, round, gid); const fin = c.status === 'final';
  const W = !fin && canMark(cid, round, gid);
  const grp = groupOf(cid, round, gid); const fmt = c.format;
  if (!c.holes.includes(S.activeHole)) S.activeHole = c.holes.find(h => !(sc.card && sc.card.scores && sc.card.scores[h] !== undefined)) || c.holes[0];
  const resHead = fmt === 'stableford' ? 'Pts' : fmt === 'medal' ? 'Nett' : fmt === 'parbogey' ? '±' : 'vs Par';
  const t = g.gender === 'L' ? RED : (TEES[c.tee] || TEES.white); const rs = compRounds(c);
  let h = backBtn(c.name, 'closeCard');
  if (rs.length > 1) h += `<div class="bsel rtabs">${rs.map(r => `<button data-act="cardRound" data-v="${r.n}" aria-pressed="${r.n === round}">R${r.n}<small>${esc(shortRange(r))}</small></button>`).join('')}</div>`;
  h += `<div class="card-head"><div><span class="eyebrow">${g.gender === 'L' ? "Ladies' card" : "Men's card"} · ${t.name} tees · Round ${round}</span><h1 class="card-name">${esc(g.name)}</h1><p class="hint">Hcp ${fmtHi(cardHi(sc.card, g))} · ${c.holes.length} holes · ${esc((FORMATS[fmt]||FORMATS.stableford).name)}</p></div>
    ${S.isAdmin && !fin ? `<button class="shotsbtn" data-act="editShots"><b>${sc.total}</b><span>Shots ✎</span></button>` : `<div class="shotsbtn" style="cursor:default"><b>${sc.total}</b><span>Shots</span></div>`}</div>`;
  // group & marker
  let mk;
  if (!grp) mk = `<div class="marker warn"><b>Not in a group for round ${round}.</b> A card can only be marked by someone from the golfer's group.${S.isAdmin && !fin ? ` <button class="textbtn" data-act="newGroup" data-round="${round}" data-with="${esc(gid)}">Set up a group</button>` : ''}</div>`;
  else {
    const others = grp.members.filter(x => x !== gid);
    const mId = sc.card && sc.card.markerId;
    const status = sc.marked ? `Marked by <b>${esc(gName(mId))}</b>` : sc.card && sc.filled ? '<b>Not marked yet</b>' : 'No scores yet';
    mk = `<div class="marker ${sc.marked ? 'ok' : sc.filled ? 'warn' : ''}"><span>Group: ${grp.members.map(x => esc(gName(x))).join(', ')}</span><span>${status}</span>`;
    if (S.isAdmin && !fin) mk += `<label class="field" style="margin:8px 0 0"><span>Marked by</span><select id="markerSel">${['<option value="">Not marked</option>'].concat(others.map(x => `<option value="${esc(x)}" ${mId === x ? 'selected' : ''}>${esc(gName(x))}</option>`)).join('')}</select></label>`;
    mk += '</div>';
  }
  h += mk;
  if (gid === S.myGid && !S.isAdmin) h += `<p class="hint" style="margin:-4px 0 12px">Your card is marked by someone else in your group. You can check it here.</p>`;
  else if (!W && !fin && !S.isAdmin) h += `<p class="hint" style="margin:-4px 0 12px">${roundOpenNow(c, round) ? 'Only someone from this golfer\'s group can mark this card.' : 'This round is closed. Cards can be marked Friday to Sunday.'}</p>`;
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
    h += `<div class="keypad"><div class="wrap"><div class="kp-label"><b>Hole ${r.h}</b><span>${S.isAdmin ? '' : 'You are marking · '}Par ${r.par} · ${r.shots} shot${Math.abs(r.shots) === 1 ? '' : 's'}</span></div><div class="kp-grid">${range(1,12).map(n => `<button data-act="key" data-v="${n}" class="${n === r.par ? 'par' : ''}" aria-label="${n}">${n}</button>`).join('')}<button class="fn" data-act="key" data-v="P" aria-label="Picked up">P</button><button class="fn" data-act="key" data-v="X" aria-label="Clear hole">Clear</button></div></div></div>`;
  }
  return h;
}

/* ----- League, golfers, stats ----- */
function seasonSelect(){ const ys = seasonList(); return `<select id="season" aria-label="Season">${ys.map(y => `<option value="${y}" ${S.season === y ? 'selected' : ''}>${y}</option>`).join('')}<option value="all" ${S.season === 'all' ? 'selected' : ''}>All time</option></select>`; }
function viewLeague(){
  const rows = league(S.season); const k = cfg();
  let h = `<div class="pagehead"><div><span class="eyebrow">Order of Merit</span><h1>League table</h1></div>${seasonSelect()}</div>`;
  h += `<div class="pointskey">${k.points.map((p,i) => `<span class="chip">${ord(i+1)} · ${p} pts</span>`).join('')}<span class="chip">Played · ${k.entryPoint} pt</span></div>`;
  if (!rows.length) return h + `<section class="empty"><p class="hint">No finalised months ${S.season === 'all' ? 'yet' : 'in ' + S.season + ' yet'}. Points are added when a month is finalised.</p></section>`;
  h += `<ul class="list"><li class="lg-head"><span>Pos</span><span>Golfer</span><span>P</span><span>W</span><span>Pts</span></li>` + rows.map(r => {
    const p = D.golfers[r.id]; const tied = rows.filter(x => x.pos === r.pos).length > 1;
    return `<li><button class="lg-row ${r.pos === 1 ? 'p1' : ''}" data-act="openPlayer" data-id="${esc(r.id)}"><span class="lb-pos">${tied ? 'T' : ''}${r.pos}</span><span class="lg-name">${esc(p.name)}<small>${r.seconds ? r.seconds + '× runner-up · ' : ''}${r.won > 0.004 ? euro(r.won) + ' won' : 'Hcp ' + fmtHi(curHcp(p.id))}</small></span><span class="lg-n">${r.played}</span><span class="lg-n">${r.wins}</span><span class="lg-pts">${r.pts}</span></button></li>`;
  }).join('') + '</ul>';
  h += `<p class="hint" style="margin-top:12px">Tap a golfer for their stats. P = months played, W = wins.</p>`;
  return h;
}
function viewGolfers(){
  const ps = sortedGolfers(); const A = S.isAdmin;
  let h = `<div class="pagehead"><div><span class="eyebrow">${ps.length} golfer${ps.length === 1 ? '' : 's'}</span><h1>Golfers</h1></div>${A ? '<button class="btn small primary" data-act="newGolfer">+ Add golfer</button>' : ''}</div>`;
  if (!ps.length) return h + `<section class="empty"><p class="hint">${A ? 'Add each golfer with their handicap and the email they sign in with.' : 'No golfers yet.'}</p></section>`;
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
  let h = `<div class="panel hcprules"><p><b>Winner</b> cut ${R.win} · <b>Runner-up</b> cut ${R.second} · <b>+${R.rise}</b> after ${R.after} months played without a cut</p><p class="hint">Changes are made when the organiser finalises a month. Cards are played off the handicap on the day they're marked.</p></div>`;
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
  const st = playerStats(p.id, S.season); const lg = league(S.season).find(r => r.id === p.id);
  let h = backBtn('All golfers', 'closePlayer');
  h += `<div class="phead"><span class="avatar">${esc(initials(p.name))}</span><div><h1>${esc(p.name)}</h1><p>Handicap ${fmtHi(curHcp(p.id))} · ${p.gender === 'L' ? "Ladies'" : "Men's"} card</p></div></div>`;
  h += hcpPanel(p.id);
  h += `<div class="pagehead" style="margin-bottom:10px"><span class="label">Stats for</span><span style="display:flex;gap:8px">${S.isAdmin ? `<button class="btn small" data-act="editGolfer" data-id="${esc(p.id)}">Edit</button>` : ''}${seasonSelect()}</span></div>`;
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
    return `<li><button class="row" data-act="openComp" data-id="${esc(c.id)}"><span class="row-date"><b>${d.day}</b>${d.mon}</span><span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${r.count ? esc(monthText(r, c)) + (c.format === 'stableford' ? ' pts' : '') + ` from ${r.count} card${r.count === 1 ? '' : 's'}` : 'No counting cards'}${fin ? ` · ${r.points} league pt${r.points === 1 ? '' : 's'}` : ''}${r.prize > 0.004 ? ' · ' + euro(r.prize) : ''}</span></span><span class="pill ${fin ? 'final' : 'open'}">${fin ? place : 'Open'}</span></button></li>`; }).join('')}</ul>`;
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
function viewAdmin(){
  if (!S.loaded.adminCode) return '<p class="loading">Loading…</p>';
  if (!adminUnlocked() || S.changing) return viewLock();
  const k = cfg(); const c = k.course;
  const siOk = arr => new Set(arr).size === 18 && arr.every(x => x >= 1 && x <= 18);
  const n = (id, v, extra) => `<input type="number" id="${id}" value="${esc(v)}" ${extra || ''}>`;
  const kittyPct = 100 - k.prize.reduce((a,b)=>a+b,0);
  const admins = (D.admins && D.admins.emails) || [];
  return `<div class="pagehead"><div><span class="eyebrow">Admin</span><h1>Settings</h1></div><button class="btn small" data-act="lockAdmin">Lock</button></div>
  <form id="setupForm" class="setup" onsubmit="return false">
    <section><div class="sec-head" style="margin-top:0"><h2>Entry & payments</h2></div><div class="panel">
      <div class="grid2"><label class="field"><span>Entry fee (€)</span>${n('s-fee', k.fee, 'min="0" step="1"')}</label><label class="field"><span>Revolut username</span><input type="text" id="s-rev" value="${esc(k.revtag)}" placeholder="e.g. johnsmith" autocapitalize="off" autocorrect="off"></label></div>
      <p class="hint">Golfers see a link to revolut.me/${esc(k.revtag || 'username')}. For card payments, take the money on the club's card reader and mark the entry as Card reader.</p></div></section>
    <section><div class="sec-head"><h2>Prize money</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Winner %</span>${n('s-p1', k.prize[0] != null ? k.prize[0] : 60)}</label><label class="field"><span>Runner-up %</span>${n('s-p2', k.prize[1] != null ? k.prize[1] : 40)}</label></div>
      <p class="hint">${kittyPct > 0 ? `The other ${kittyPct}% of each pot stays in the kitty.` : kittyPct < 0 ? 'These add up to more than 100%.' : 'The whole pot goes to the top two.'}</p></div></section>
    <section><div class="sec-head"><h2>League points</h2></div><div class="panel"><div class="grid5"><label class="field"><span>1st</span>${n('s-pt1', k.points[0])}</label><label class="field"><span>2nd</span>${n('s-pt2', k.points[1])}</label><label class="field"><span>3rd</span>${n('s-pt3', k.points[2])}</label><label class="field"><span>4th</span>${n('s-pt4', k.points[3])}</label><label class="field"><span>Others</span>${n('s-pte', k.entryPoint)}</label></div><p class="hint">"Others" is the point for entering.</p></div></section>
    <section><div class="sec-head"><h2>New months</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Weekend rounds</span>${n('s-rounds', k.rounds, 'min="1" max="5"')}</label><label class="field"><span>Best cards count</span>${n('s-best', k.best, 'min="1" max="5"')}</label></div><p class="hint">Each round is open Friday to Sunday. One card per golfer per round.</p></div></section>
    <section><div class="sec-head"><h2>Handicap changes</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Winner cut</span>${n('s-cw', k.cutWinner, 'min="0" step="0.1"')}</label><label class="field"><span>Runner-up cut</span>${n('s-cr', k.cutRunner, 'min="0" step="0.1"')}</label><label class="field"><span>Rise by</span>${n('s-rb', k.riseBy, 'min="0" step="0.1"')}</label><label class="field"><span>Rise after (months)</span>${n('s-ra', k.riseAfter, 'min="1" step="1"')}</label><label class="field"><span>Highest handicap</span>${n('s-hm', k.hcpMax, 'min="0" step="1"')}</label></div>
      <p class="hint">Applied when a month is finalised. "Rise after" counts months a golfer played without a cut (winning or runner-up). Changing these recalculates everyone's handicap.</p></div></section>
    <section><div class="sec-head"><h2>Handicaps</h2></div><div class="panel"><div class="grid2"><label class="field"><span>Allowance %</span>${n('s-allow', k.allowance, 'min="0" max="100"')}</label><label class="field"><span>Default men's tees</span><select id="s-tee">${Object.entries(TEES).map(([key,t]) => `<option value="${key}" ${k.tee === key ? 'selected' : ''}>${t.name} · ${t.cr} / ${t.slope}</option>`).join('')}</select></label></div>
      <p class="hint">Shots use index × slope ÷ 113 + (rating − par), times the allowance. Ladies use the red tees. Each card keeps the golfer's index from the day it was marked.</p></div></section>
    <section><div class="panel"><details class="course" id="courseDetails" ${S.courseOpen ? 'open' : ''}><summary>Course card: par and stroke index</summary>
      <p class="hint">From the published Rathsallagh scorecard. Check it against the card in the clubhouse.</p>
      <div class="ctable"><table><thead><tr><th>Hole</th><th>Men's par</th><th>Men's SI</th><th>Ladies' par</th><th>Ladies' SI</th></tr></thead><tbody>${range(1,18).map(h => `<tr><td>${h}</td><td>${n('c-pm-'+h, c.parM[h-1])}</td><td>${n('c-sm-'+h, c.siM[h-1])}</td><td>${n('c-pl-'+h, c.parL[h-1])}</td><td>${n('c-sl-'+h, c.siL[h-1])}</td></tr>`).join('')}</tbody></table></div>
      ${!siOk(c.siM) || !siOk(c.siL) ? '<p class="warnline">Each stroke index from 1 to 18 should appear once per card.</p>' : ''}</details></div></section>
  </form>
  <section class="setup"><div class="sec-head"><h2>Organisers</h2></div><div class="panel"><ul class="plain">${admins.map(e => `<li><span>${esc(e)}${e === S.user.email ? ' (you)' : ''}</span>${admins.length > 1 && e !== S.user.email ? `<button class="btn small danger" data-act="removeAdmin" data-email="${esc(e)}">Remove</button>` : ''}</li>`).join('')}</ul>
    <form data-form="addAdmin" class="inline"><input type="email" id="aa-email" name="email" placeholder="organiser@email.com" required aria-label="Organiser email"><button class="btn small" type="submit">Add</button></form><p class="hint">Organisers can manage golfers, competitions, payments and every card.</p></div></section>
  <section class="setup"><div class="sec-head"><h2>Admin code</h2></div><div class="panel row-panel"><p class="hint">Anyone opening Admin needs the code.</p><span style="display:flex;gap:8px"><button class="btn small" data-act="changePin">Change code</button><button class="btn small" data-act="lockAdmin">Lock now</button></span></div></section>
  ${SAMPLE ? '' : `<section class="setup"><div class="panel row-panel"><p class="hint">Try every screen with made-up golfers. Nothing is saved to the league.</p><a class="btn small" href="?sample=1">Sample data</a></div></section>`}`;
}

/* ---------- Sheets ---------- */
function openSheet(s){ S.sheet = s; renderSheet(); document.body.classList.add('locked'); }
function closeSheetQuiet(){
  if (S.sheet && S.sheet.type === 'scan') { if (SCAN_CTL) { SCAN_CTL.aborted = true; SCAN_CTL = null; } (S.sheet.thumbs || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} }); }
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
    case 'golfer': h = sheetGolfer(); break;
    case 'shots': h = sheetShots(); break;
    case 'group': h = sheetGroup(); break;
    case 'scan': h = sheetScan(); break;
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
    <p class="hint" style="margin-bottom:14px">${S.isAdmin ? 'You are an organiser.' : 'You are a golfer.'}${S.myGid ? ` Handicap ${fmtHi(curHcp(S.myGid))}.` : ''}</p>
    ${S.installEvt ? '<button class="btn primary block" data-act="install">Install the app</button>' : iosTip ? '<p class="notebox">To install on iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.</p>' : ''}
    ${S.myGid ? `<button class="btn block" style="margin-top:8px" data-act="openPlayer" data-id="${esc(S.myGid)}">My stats</button>` : ''}
    <button class="btn block danger" style="margin-top:8px" data-act="signout">Sign out</button>`;
}
function sheetComp(){
  const c = S.sheet.id ? D.comps[S.sheet.id] : null; const k = cfg();
  const rs = c ? compRounds(c) : weekendRounds(defaultFirstFri(), k.rounds);
  const fmt = (c && c.format) || 'stableford'; const holes = (c && c.holes) || range(1,18);
  const is = arr => holes.length === arr.length && holes.every((h,i) => h === arr[i]);
  const preset = is(range(1,18)) ? '18' : is(range(1,14)) ? '14' : 'custom';
  const best = c ? compBest(c) : Math.min(k.best, rs.length);
  return `<form data-form="comp"><h3>${c ? 'Edit competition' : 'New month'}</h3><p class="sub">${c ? esc(c.name) : 'Weekend rounds, open Friday to Sunday.'}</p>
    <label class="field"><span>Name</span><input type="text" id="f-name" name="name" value="${esc(c ? c.name : '')}" placeholder="${esc(dParts(rs[0].from).month + ' ' + FORMATS[fmt].short)}"></label>
    <div class="grid2"><label class="field"><span>Weekend rounds</span><select id="f-rcount" name="rcount">${range(1,5).map(i => `<option value="${i}" ${i === rs.length ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
    <label class="field"><span>Best cards count</span><select id="f-best" name="best">${range(1,5).map(i => `<option value="${i}" ${i === best ? 'selected' : ''}>${i}</option>`).join('')}</select></label></div>
    <div class="field"><span>Round Fridays</span><div id="f-rounds" class="rdates">${rs.map(r => roundDateInput(r.n, r.from)).join('')}</div><p class="hint">Each round runs Friday, Saturday and Sunday.</p></div>
    <label class="field"><span>Entry fee for the month (€)</span><input type="number" id="f-fee" name="fee" min="0" step="1" value="${esc(c && c.fee != null ? c.fee : k.fee)}"></label>
    <div class="field"><span>Format</span><div class="radios">${Object.entries(FORMATS).map(([key,f]) => radio('format', key, f.name, fmt === key)).join('')}</div></div>
    <div class="field"><span>Holes</span><div class="radios">${radio('holes','18','18 holes', preset === '18')}${radio('holes','14','14 holes (1–14)', preset === '14')}${radio('holes','custom','Pick holes', preset === 'custom')}</div>
      <div class="holepick" id="holepick" ${preset === 'custom' ? '' : 'hidden'}>${range(1,18).map(h => `<label class="hp"><input type="checkbox" id="f-h-${h}" name="h" value="${h}" ${holes.includes(h) ? 'checked' : ''}><span>${h}</span></label>`).join('')}</div></div>
    <div class="grid2"><label class="field"><span>Men's tees</span><select id="f-tee" name="tee">${Object.entries(TEES).map(([key,t]) => `<option value="${key}" ${((c && c.tee) || k.tee) === key ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
    <label class="field"><span>Allowance %</span><input type="number" id="f-allow" name="allowance" min="0" max="100" value="${esc(c && c.allowance != null ? c.allowance : k.allowance)}"></label></div>
    <button class="btn primary block" type="submit">${c ? 'Save changes' : 'Create month'}</button></form>`;
}
function roundDateInput(n, from){ return `<label class="rdate"><span>R${n}</span><input type="date" id="f-r-${n}" name="r${n}" value="${esc(from)}" required></label>`; }
function sheetAddEntry(){
  const c = D.comps[S.compId]; if (!c) return null;
  const avail = sortedGolfers().filter(g => !entryOf(c.id, g.id));
  return `<form data-form="addEntries"><h3>Add entries</h3><p class="sub">${esc(c.name)} · one entry covers the month.</p>
    ${avail.length ? `<div class="checklist">${avail.map(g => `<label class="check"><input type="checkbox" id="ae-${esc(g.id)}" name="gid" value="${esc(g.id)}"><span>${esc(g.name)}</span><small>Hcp ${fmtHi(curHcp(g.id))}</small></label>`).join('')}</div>` : '<p class="hint" style="margin-bottom:14px">Everyone on the golfer list is entered. Add new golfers on the Golfers tab.</p>'}
    <label class="field"><span>Payment</span><select id="ae-pay" name="pay"><option value="">Not paid yet</option><option value="revolut">Paid by Revolut</option><option value="card">Paid on card reader</option><option value="cash">Paid in cash</option></select></label>
    ${avail.length ? '<button class="btn primary block" type="submit">Add ticked golfers</button>' : ''}</form>`;
}
function sheetPay(){
  const e = D.entries[S.sheet.id]; if (!e) return null; const c = D.comps[e.compId]; const g = D.golfers[e.golferId]; const k = cfg(); if (!c || !g) return null;
  const fee = c.fee != null ? c.fee : k.fee; const ref = `${dParts(c.date).mon} comp - ${g.name}`;
  let h = `<h3>Entry ${euro(fee)}</h3><p class="sub">${esc(g.name)} · ${esc(c.name)} · <b>${e.paid ? 'Paid · ' + esc(METHODS[e.method] || 'Paid') : 'Not paid yet'}</b></p>`;
  if (S.isAdmin) h += `<div class="paygrid">${[['revolut','Revolut'],['card','Card reader'],['cash','Cash'],['','Not paid']].map(([m,l]) => `<button class="paybtn ${(m ? (e.paid && e.method === m) : !e.paid) ? 'on' : ''}" data-act="setPay" data-m="${m}">${l}</button>`).join('')}</div>`;
  if (k.revtag) h += `<div class="revbox"><span class="label">Pay by Revolut</span><a class="btn primary block" href="https://revolut.me/${encodeURIComponent(k.revtag)}" target="_blank" rel="noopener">Open revolut.me/${esc(k.revtag)}</a><div class="refrow"><code id="refcode">${esc(ref)}</code><button class="btn small" data-act="copy" data-text="${esc(ref)}">Copy</button></div><p class="hint">Send ${euro(fee)} with this reference so the organiser can match it.</p></div>`;
  h += `<p class="hint"><b>Card:</b> pay ${euro(fee)} on the club's card reader and the organiser marks it here.</p>`;
  return h;
}
function sheetGolfer(){
  const p = S.sheet.id ? D.golfers[S.sheet.id] : null; const email = p ? golferEmails()[p.id] || '' : '';
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
function sheetShots(){
  const {cid, round, gid} = S.card || {}; const c = D.comps[cid]; const g = D.golfers[gid]; if (!c || !g) return null;
  const card = cardOf(cid, round, gid); const calc = defaultShots(g, c, cardHi(card, g)); const cur = cardShots(card, c, g); const t = g.gender === 'L' ? RED : (TEES[c.tee] || TEES.white);
  return `<form data-form="shots"><h3>Shots received</h3><p class="sub">${esc(g.name)} · Round ${round}</p>
    <label class="field"><span>Shots over ${c.holes.length} holes</span><input type="number" id="sh-val" name="shots" step="1" value="${cur}"></label>
    <p class="hint" style="margin-bottom:16px">Calculated: <b>${calc}</b> from index ${fmtHi(cardHi(card, g))}, ${t.name} tees (${t.cr} / ${t.slope}), ${c.allowance != null ? c.allowance : 95}% allowance${c.holes.length !== 18 ? `, ${c.holes.length}/18 of the round` : ''}.</p>
    <div class="confirm-actions"><button type="button" class="btn" data-act="resetShots">Use ${calc}</button><button class="btn primary" type="submit">Save</button></div></form>`;
}
function sheetGroup(){
  const sh = S.sheet; const c = D.comps[sh.cid]; if (!c) return null;
  const grp = sh.id ? D.groups[c.id + '/' + sh.id] : null; const round = grp ? grp.round : sh.round;
  const inOther = gid => { const x = groupOf(c.id, round, gid); return x && (!grp || x.id !== grp.id); };
  const entered = entriesFor(c.id).map(e => D.golfers[e.golferId]).sort(byName);
  const cur = new Set(grp ? grp.members : (sh.with ? [sh.with] : (S.isAdmin ? [] : [S.myGid])));
  const opts = entered.filter(g => !inOther(g.id) && (S.isAdmin || g.id !== S.myGid));
  const r = compRounds(c).find(x => x.n === round);
  return `<form data-form="group"><h3>${grp ? 'Change group' : 'Your group'}</h3><p class="sub">Round ${round}${r ? ' · ' + esc(roundLabel(r)) : ''}</p>
    <p class="hint" style="margin-bottom:12px">${S.isAdmin ? 'Tick 2 to 4 golfers who are playing together.' : "Tick who you're playing with (1 to 3). You'll mark their cards and one of them marks yours."}</p>
    ${opts.length ? `<div class="checklist">${opts.map(g => `<label class="check"><input type="checkbox" id="gp-${esc(g.id)}" name="gid" value="${esc(g.id)}" ${cur.has(g.id) ? 'checked' : ''}><span>${esc(g.name)}</span><small>Hcp ${fmtHi(curHcp(g.id))}</small></label>`).join('')}</div>` : '<p class="hint">Nobody else is free. Golfers must be entered and not in another group this round.</p>'}
    <p class="hint" style="margin-bottom:14px">Only golfers entered this month, and not already in a group this round, are shown.</p>
    <button class="btn primary block" type="submit">${grp ? 'Save group' : 'Create group'}</button>
    ${grp ? `<button type="button" class="btn danger block" style="margin-top:8px" data-act="delGroup">Break up this group</button>` : ''}</form>`;
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
function scanPrompt(c){
  const k = cfg().course;
  const pars = range(1,18).map(h => `${h}: par ${k.parM[h-1]}${k.parL[h-1] !== k.parM[h-1] ? ` (ladies ${k.parL[h-1]})` : ''}`).join('; ');
  const names = sortedGolfers().map(g => g.name).join(', ');
  return ['Read this photo of a golf scorecard from Rathsallagh Golf Club, Co. Wicklow, and turn the handwritten scores into data.',
    `Holes played: ${c.holes.join(', ')}. Ignore other holes.`, `Pars: ${pars}.`, `Golfers on the club list: ${names}.`, '',
    'Rules:',
    '- Read the gross strokes written for each golfer on each hole. A card holds up to four golfers.',
    '- Ignore printed hole numbers, yardages, par, stroke index, totals, handicap, nett and Stableford points columns.',
    '- Use "P" for a pick-up (struck through, dash, line, X, P or NR). Leave out blank holes.',
    '- If a figure is hard to read, give your best reading and list the hole in "unclear".',
    '- "match" is the exact name from the club list when the name on the card clearly refers to that golfer, otherwise null. Never guess a match for an unclear name.',
    '- "marker" is the name in the marker or attesting signature box for that golfer, if one is written, otherwise null.', '',
    'Reply with only JSON:',
    '{"golfers":[{"name_on_card":"as written","match":"name from list or null","marker":"name or null","scores":{"1":5,"2":4,"3":"P"},"unclear":[7]}],"notes":""}',
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
    const text = await be.scan(scanPrompt(c), img.data, img.mime); if (ctl.aborted || S.sheet !== sh) return;
    const res = parseJSON(text); if (!res || !Array.isArray(res.golfers)) throw new Error('unreadable');
    sh.rows = buildScanRows(res, c, sh.ctx); sh.notes = typeof res.notes === 'string' ? res.notes.slice(0, 300) : ''; sh.phase = 'review';
  } catch (e) {
    if (ctl.aborted || S.sheet !== sh) return; console.warn(e);
    sh.phase = 'error'; sh.err = /quota|429|exhaust/i.test(String(e && e.message)) ? 'The scanner is busy or over its free limit. Try again in a few minutes, or type the scores in.' : /app.?check|permission|403/i.test(String(e && e.message)) ? "Scanning isn't switched on for this app yet. The organiser needs to finish the Gemini setup." : "Couldn't read the card. Try a sharper photo, straight on, in good light.";
  }
  if (SCAN_CTL === ctl) SCAN_CTL = null; renderSheet();
}
function buildScanRows(res, c, ctx){
  const round = ctx.round; const mine = !S.isAdmin ? myGroup(c.id, round) : null;
  const seen = new Set();
  const rows = res.golfers.slice(0, 6).map(g => {
    const raw = (g && typeof g.scores === 'object' && g.scores) || {}; const scores = {};
    c.holes.forEach(h => { const v = raw[h] !== undefined ? raw[h] : raw[String(h)]; if (v === undefined || v === null || v === '') return; if (/^\s*p\s*$/i.test(String(v))) { scores[h] = 'P'; return; } const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 20) scores[h] = n; });
    const name = String((g && g.name_on_card) || '').slice(0, 60);
    const gid = recognise(g && typeof g.match === 'string' ? g.match : null, name);
    const markerGid = g && g.marker ? recognise(null, String(g.marker)) : null;
    const unclear = Array.isArray(g && g.unclear) ? g.unclear.map(Number).filter(h => c.holes.includes(h)) : [];
    let status = 'ok', why = '';
    if (!gid) { status = 'reject'; why = "Name not recognised from the golfer list, so this card isn't accepted."; }
    else if (seen.has(gid)) { status = 'reject'; why = 'This golfer appears twice on the card.'; }
    else if (!S.isAdmin && gid === S.myGid) { status = 'reject'; why = 'Your own card has to be marked by someone else in your group.'; }
    else if (!S.isAdmin && !(mine && mine.members.includes(gid))) { status = 'reject'; why = "Not in your group this round, so you can't mark this card."; }
    else if (S.isAdmin && !entryOf(c.id, gid)) { why = "Not entered this month. Adding the card enters them (unpaid)."; }
    if (gid) seen.add(gid);
    return {name, gid, markerGid, scores, unclear, status, why};
  }).filter(r => Object.keys(r.scores).length || r.status === 'reject');
  if (S.isAdmin) {
    const ok = rows.filter(r => r.status === 'ok');
    ok.forEach(r => { const g = groupOf(c.id, round, r.gid); const others = ok.filter(x => x !== r).map(x => x.gid);
      if (g && ok.some(x => x !== r && !g.members.includes(x.gid))) { r.status = 'reject'; r.why = `Already in another group in round ${round}.`; } else r.groupId = g ? g.id : null;
      const pool = g ? g.members.filter(x => x !== r.gid) : others;
      r.marker = r.markerGid && pool.includes(r.markerGid) ? r.markerGid : (pool.length ? pool[(ok.indexOf(r) + 1) % Math.max(1, pool.length)] || pool[0] : '');
      if (r.marker === r.gid) r.marker = pool.find(x => x !== r.gid) || ''; });
  }
  return rows;
}
function sheetScan(){
  const sh = S.sheet; const c = D.comps[sh.ctx.cid]; if (!c) return null; const round = sh.ctx.round;
  let h = `<h3>Scan scorecard</h3><p class="sub">${esc(c.name)} · Round ${round}</p>`;
  if (sh.thumbs && sh.thumbs.length) h += `<div class="thumbs">${sh.thumbs.map(u => `<img src="${esc(u)}" alt="Scorecard photo">`).join('')}</div>`;
  if (sh.phase === 'reading') return h + `<div class="reading"><span class="pulse"></span><p><b>Reading the card…</b> This usually takes 10 to 30 seconds.</p></div><button class="btn block" data-act="stopScan">Stop</button>`;
  if (sh.phase === 'error') return h + `<p class="errbox">${esc(sh.err)}</p><div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  if (!sh.rows.length) return h + `<p class="errbox">No scores found on this photo.${sh.notes ? ' ' + esc(sh.notes) : ''}</p><div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  h += `<p class="hint" style="margin-bottom:12px">Check each number against the card. Highlighted holes were hard to read. Type P for a pick-up.</p>`;
  if (sh.notes) h += `<p class="notebox">${esc(sh.notes)}</p>`;
  const okRows = sh.rows.filter(r => r.status === 'ok');
  h += sh.rows.map((r, i) => {
    if (r.status === 'reject') return `<div class="scanrow rejected"><div class="oncard"><span class="label">On the card</span><b>${esc(r.name || 'Unnamed golfer')}</b></div><p class="errbox">${esc(r.why)}</p></div>`;
    const pool = S.isAdmin ? (r.groupId ? D.groups[c.id + '/' + r.groupId].members : okRows.map(x => x.gid)).filter(x => x !== r.gid) : [];
    return `<div class="scanrow"><div class="scanrow-head"><span class="oncard"><span class="label">On the card</span><b>${esc(r.name)}</b></span><span class="oncard"><span class="label">Golfer</span><b class="okname">${esc(gName(r.gid))}</b></span></div>
      ${S.isAdmin ? `<label class="field" style="margin:0"><span>Marked by</span><select id="sm-${i}"><option value="">Not marked</option>${pool.map(x => `<option value="${esc(x)}" ${r.marker === x ? 'selected' : ''}>${esc(gName(x))}</option>`).join('')}</select></label>` : `<p class="hint">You'll be the marker for this card.</p>`}
      ${r.why ? `<p class="hint">${esc(r.why)}</p>` : ''}
      <div class="sgrid">${c.holes.map(hh => `<label class="sg ${r.unclear.includes(hh) ? 'unclear' : ''}"><span>${hh}</span><input type="text" inputmode="numeric" maxlength="2" autocomplete="off" id="sv-${i}-${hh}" value="${r.scores[hh] !== undefined ? esc(String(r.scores[hh])) : ''}" aria-label="Hole ${hh}"></label>`).join('')}</div>
      <p class="hint">${Object.keys(r.scores).length} of ${c.holes.length} holes read${r.unclear.length ? ` · check hole${r.unclear.length > 1 ? 's' : ''} ${r.unclear.join(', ')}` : ''}</p></div>`;
  }).join('');
  h += okRows.length ? `<button class="btn primary block" data-act="applyScan">Add ${okRows.length} card${okRows.length === 1 ? '' : 's'}</button><p class="hint" style="margin-top:10px">Scanned holes replace what's on each card. Blank holes are left as they are.</p>` : `<div class="confirm-actions"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary" data-act="newScan">New photo</button></div>`;
  return h;
}
async function applyScan(){
  const sh = S.sheet; const c = sh && D.comps[sh.ctx.cid]; if (!c || !sh.rows) return; const round = sh.ctx.round;
  document.querySelectorAll('#sheetIn .sg.bad').forEach(x => x.classList.remove('bad'));
  const ops = []; let bad = null; let newGroupId = null; const ok = sh.rows.map((r,i) => ({r, i})).filter(x => x.r.status === 'ok');
  if (S.isAdmin && ok.length >= 2 && ok.every(x => !x.r.groupId)) { newGroupId = newId(); ops.push({path:`comps/${c.id}/groups/${newGroupId}`, data:{compId:c.id, round, members: ok.map(x => x.r.gid), createdBy:'organiser', createdAt: Date.now()}}); }
  ok.forEach(({r, i}) => {
    const scores = {};
    c.holes.forEach(hh => { const inp = document.getElementById(`sv-${i}-${hh}`); const t = (inp ? inp.value : '').trim().toUpperCase(); if (!t) return; if (t === 'P') { scores[hh] = 'P'; return; } const n = parseInt(t, 10); if (/^\d{1,2}$/.test(t) && n >= 1 && n <= 20) scores[hh] = n; else { if (inp) inp.closest('.sg').classList.add('bad'); bad = bad || `Hole ${hh} for ${gName(r.gid)} should be a number or P.`; } });
    const prev = cardOf(c.id, round, r.gid); const g = D.golfers[r.gid];
    let groupId, markerId;
    if (S.isAdmin) { groupId = r.groupId || newGroupId || (prev && prev.groupId) || null; const sel = document.getElementById('sm-' + i); markerId = sel && sel.value ? sel.value : null; }
    else { const mg = myGroup(c.id, round); groupId = mg && mg.id; markerId = S.myGid; }
    if (S.isAdmin && !entryOf(c.id, r.gid)) ops.push({path:`comps/${c.id}/entries/${r.gid}`, data:{compId:c.id, golferId:r.gid, paid:false, method:null, paidAt:null, createdAt:Date.now()}});
    ops.push({path:`comps/${c.id}/cards/${round}_${r.gid}`, data:{compId:c.id, golferId:r.gid, round, groupId, markerId, scores:Object.assign({}, (prev && prev.scores) || {}, scores), hi: prev && prev.hi != null ? prev.hi : snapHcp(g), shots: prev && prev.shots != null ? prev.shots : null, updatedAt:Date.now(), updatedBy:S.user.uid, scanned:true}});
  });
  if (bad) { toast(bad); return; }
  if (await batch(ops)) { closeSheet(); toast(`${ok.length} card${ok.length === 1 ? '' : 's'} added. Give ${ok.length === 1 ? 'it' : 'them'} a quick check.`); }
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
  const prev = cardOf(cid, round, gid); const g = D.golfers[gid]; const grp = groupOf(cid, round, gid);
  let groupId = (grp && grp.id) || (prev && prev.groupId) || null; let markerId = prev ? prev.markerId : null;
  if (!S.isAdmin) { const mg = myGroup(cid, round); groupId = mg && mg.id; markerId = S.myGid; }
  const data = {compId:cid, golferId:gid, round, groupId, markerId, scores, hi: prev && prev.hi != null ? prev.hi : snapHcp(g), shots: prev && prev.shots != null ? prev.shots : null, updatedAt:Date.now(), updatedBy:S.user.uid};
  const path = `comps/${cid}/cards/${round}_${gid}`;
  localSet(path, data); render();
  clearTimeout(cardTimers[path]); cardTimers[path] = setTimeout(() => put(path, data), 600);
}
const ACT = {
  tab(el){ const v = el.dataset.v; if (S.view === v) { if (v === 'comps') { S.compId = null; S.card = null; } if (v === 'golfers') S.playerId = null; } else if (v === 'comps') S.card = null; S.view = v; top(); render(); },
  account(){ openSheet({type:'account'}); },
  install(){ const e = S.installEvt; if (!e) return; e.prompt(); e.userChoice.finally(() => { S.installEvt = null; closeSheet(); }); },
  async google(){ try { S.busy = true; render(); await be.signInGoogle(); } catch (e) { toast(authErr(e)); } finally { S.busy = false; render(); } },
  signinMode(el){ S.signinMode = el.dataset.v; render(); },
  async forgot(){ const em = ($('#si-email') || {}).value; if (!em) { toast('Type your email first, then tap Forgot password.'); return; } try { await be.resetPassword(em.trim()); toast('Password reset email sent.'); } catch (e) { toast(authErr(e)); } },
  async verified(){ const u = await be.reloadUser(); if (u && u.emailVerified) onUser(u); else toast("Not confirmed yet. Tap the link in the email, then try again."); },
  async resendVerify(){ try { await be.sendVerify(); toast('Sent. Check your inbox and spam folder.'); } catch (e) { toast('Could not send just now. Try again shortly.'); } },
  async signout(){ closeSheetQuiet(); await be.signOut(); S.view = 'comps'; S.compId = null; S.card = null; S.playerId = null; },
  recheck(){ onUser(S.user); },
  async bootstrap(){ if (await put('config/admins', {emails:[S.user.email], createdAt:Date.now()})) toast("You're the organiser. Set your admin code in Admin."); },
  sampleSignin(el){ be.signInEmail(el.dataset.email); },
  newComp(){ openSheet({type:'comp'}); },
  editComp(){ openSheet({type:'comp', id:S.compId}); },
  openComp(el){ const c = D.comps[el.dataset.id]; if (!c) return; S.view = 'comps'; S.compId = c.id; S.card = null; S.compTab = c.status === 'final' ? 'board' : 'entries'; S.boardSel = 'month'; top(); render(); },
  closeComp(){ S.compId = null; top(); render(); },
  compTab(el){ S.compTab = el.dataset.v; render(); },
  boardSel(el){ S.compTab = 'board'; S.boardSel = el.dataset.v === 'month' ? 'month' : Number(el.dataset.v); render(); },
  openCard(el){ const cid = el.dataset.cid, gid = el.dataset.gid; const c = D.comps[cid]; if (!c || !D.golfers[gid]) return; S.view = 'comps'; S.compId = cid; S.card = {cid, round: Number(el.dataset.round) || currentRound(c), gid}; S.activeHole = null; top(); render(); },
  cardRound(el){ if (!S.card) return; S.card = Object.assign({}, S.card, {round:Number(el.dataset.v)}); S.activeHole = null; render(); },
  closeCard(){ S.card = null; top(); render(); },
  hole(el){ S.activeHole = +el.dataset.h; render(); },
  key(el){
    const {cid, round, gid} = S.card || {}; const c = D.comps[cid]; if (!c || c.status === 'final' || !canMark(cid, round, gid)) return;
    const h = S.activeHole; if (!c.holes.includes(h)) return;
    const prev = cardOf(cid, round, gid); const scores = Object.assign({}, (prev && prev.scores) || {});
    const v = el.dataset.v; if (v === 'X') delete scores[h]; else scores[h] = v === 'P' ? 'P' : +v;
    const idx = c.holes.indexOf(h); if (v !== 'X' && idx < c.holes.length - 1) S.activeHole = c.holes[idx+1];
    saveCard(cid, round, gid, scores);
    requestAnimationFrame(() => requestAnimationFrame(() => { const a = document.querySelector('.hole.active'); if (a) a.scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }));
    if (v !== 'X' && idx === c.holes.length - 1 && Object.keys(scores).length >= c.holes.length) toast(S.isAdmin ? 'Card complete' : `Card complete, marked by you`);
  },
  editShots(){ openSheet({type:'shots'}); },
  async resetShots(){ const {cid, round, gid} = S.card; const prev = cardOf(cid, round, gid); if (prev) await put(`comps/${cid}/cards/${round}_${gid}`, Object.assign({}, prev, {shots:null, id:undefined})); closeSheet(); toast('Using calculated shots'); },
  addEntry(){ openSheet({type:'addEntry'}); },
  async selfEnter(){ const c = D.comps[S.compId]; if (!c) return; if (await put(`comps/${c.id}/entries/${S.myGid}`, {compId:c.id, golferId:S.myGid, paid:false, method:null, paidAt:null, createdAt:Date.now()})) toast("You're entered. Pay your entry to the organiser."); },
  pay(el){ openSheet({type:'pay', id:el.dataset.id}); },
  async setPay(el){ const e = D.entries[S.sheet && S.sheet.id]; if (!e) return; const m = el.dataset.m;
    const data = {compId:e.compId, golferId:e.golferId, paid:!!m, method:m || null, paidAt: m ? new Date().toISOString() : null, createdAt: e.createdAt || Date.now()};
    if (await put(`comps/${e.compId}/entries/${e.golferId}`, data)) { D.entries[S.sheet.id] = Object.assign({}, data, {id:e.golferId}); MEMO = {}; renderSheet(); toast(m ? 'Marked as paid by ' + METHODS[m] : 'Marked as not paid'); } },
  copy(el){ const text = el.dataset.text; const fb = () => { const code = $('#refcode'); if (code) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Reference selected. Copy it from here.'); }; try { navigator.clipboard.writeText(text).then(() => toast('Reference copied'), fb); } catch (_) { fb(); } },
  finalise(){
    const c = D.comps[S.compId]; if (!c) return; const lb = leaderboard(c); const unpaid = entriesFor(c.id).filter(e => !e.paid).length;
    const unmarked = lb.all.reduce((a,r) => a + r.cards.filter(sc => sc.complete && !sc.marked).length, 0);
    const changes = previewHcp(c.id, 'final');
    const bits = ['Scores lock and league points are added.']; if (changes.length) bits.push('Handicaps: ' + changes.map(x => `${gName(x.gid)} ${fmtHi(x.from)} → ${fmtHi(x.to)}`).join(', ') + '.'); if (unmarked) bits.push(`${unmarked} complete card${unmarked === 1 ? " isn't" : "s aren't"} marked and won't count.`); if (unpaid) bits.push(`${unpaid} entr${unpaid === 1 ? 'y is' : 'ies are'} unpaid.`); bits.push('You can reopen it later.');
    askConfirm('Finalise the month?', bits.join(' '), 'Finalise', async () => { const data = Object.assign({}, c, {status:'final', finalisedAt:Date.now()}); delete data.id;
      if (await put(`comps/${c.id}`, data)) { localSet(`comps/${c.id}`, data); await syncHandicaps(); S.compTab = 'board'; S.boardSel = 'month'; toast(changes.length ? `Results finalised. ${changes.length} handicap${changes.length === 1 ? '' : 's'} updated.` : 'Results finalised'); } });
  },
  reopen(){ const c = D.comps[S.compId]; if (!c) return; const changes = previewHcp(c.id, 'open');
    askConfirm('Reopen scoring?', `League points for ${c.name} are taken off until it's finalised again.${changes.length ? ' Handicaps go back: ' + changes.map(x => `${gName(x.gid)} ${fmtHi(x.from)} → ${fmtHi(x.to)}`).join(', ') + '.' : ''}`, 'Reopen', async () => {
      const data = Object.assign({}, c, {status:'open'}); delete data.id; if (await put(`comps/${c.id}`, data)) { localSet(`comps/${c.id}`, data); await syncHandicaps(); toast('Scoring reopened'); } }); },
  delComp(){
    const c = D.comps[S.compId]; if (!c) return;
    askConfirm('Delete competition?', `${c.name}, its entries, groups and cards will be removed, along with their league points. This can't be undone.`, 'Delete', async () => {
      const ops = [].concat(entriesFor(c.id).map(e => ({path:`comps/${c.id}/entries/${e.golferId}`, del:true})), Object.values(D.groups).filter(g => g.compId === c.id).map(g => ({path:`comps/${c.id}/groups/${g.id}`, del:true})), Object.values(D.cards).filter(x => x.compId === c.id).map(x => ({path:`comps/${c.id}/cards/${x.id}`, del:true})), [{path:`comps/${c.id}`, del:true}]);
      for (let i = 0; i < ops.length; i += 400) { if (!(await batch(ops.slice(i, i + 400)))) return; }
      S.compId = null; render(); toast('Competition deleted');
    }, true);
  },
  newGroup(el){ const c = D.comps[S.compId]; if (!c) return; openSheet({type:'group', cid:c.id, round:Number(el.dataset.round) || currentRound(c), with: el.dataset.with || null}); },
  editGroup(el){ const c = D.comps[S.compId]; if (!c) return; if (!D.groups[c.id + '/' + el.dataset.id]) return; openSheet({type:'group', cid:c.id, id:el.dataset.id}); },
  delGroup(){ const sh = S.sheet; const grp = D.groups[sh.cid + '/' + sh.id]; if (!grp) return;
    askConfirm('Break up this group?', 'Cards already marked inside this group will stop counting until the golfers are grouped again.', 'Break up', async () => { if (await drop(`comps/${sh.cid}/groups/${grp.id}`)) toast('Group removed'); }, true); },
  newGolfer(){ openSheet({type:'golfer'}); },
  editGolfer(el){ openSheet({type:'golfer', id:el.dataset.id}); },
  delGolfer(el){ const p = D.golfers[el.dataset.id]; if (!p) return; const email = golferEmails()[p.id];
    askConfirm('Delete golfer?', `${p.name} will be removed from the golfer list${email ? ' and can no longer sign in' : ''}. Their past cards stay in the results.`, 'Delete', async () => { const ops = [{path:`golfers/${p.id}`, del:true}]; if (email) ops.push({path:`members/${email}`, del:true}); if (await batch(ops)) { S.playerId = null; toast('Golfer deleted'); } }, true); },
  openPlayer(el){ closeSheetQuiet(); if (!D.golfers[el.dataset.id]) return; S.view = 'golfers'; S.playerId = el.dataset.id; top(); render(); },
  closePlayer(){ S.playerId = null; top(); render(); },
  golferTab(el){ S.golferTab = el.dataset.v; render(); },
  closeSheet(){ closeSheet(); },
  confirmOk(){ const f = CONFIRM_FN; closeSheet(); if (f) f(); },
  scan(el){ const c = D.comps[S.compId]; if (!c) return; const round = Number(el.dataset.round) || currentRound(c);
    if (!S.isAdmin && !myGroup(c.id, round)) { toast('Set up your group first.'); return; }
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
  lockAdmin(){ S.adminHash = null; S.pin = null; S.changing = false; try { localStorage.removeItem('rgc-admin'); } catch (_) {} top(); render(); toast('Admin locked'); },
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
    const count = Math.max(1, Math.min(5, Number(fd.get('rcount')) || 4));
    const froms = range(1, count).map(i => fd.get('r' + i)).filter(Boolean);
    if (froms.length !== count) { toast('Set a date for every round'); return; }
    if (froms.some(d => parseDate(d).getDay() !== 5)) { toast('Each round should start on a Friday'); return; }
    const sorted = froms.slice().sort();
    const rounds = sorted.map((from, i) => { const to = addDays(from, 2); const opens = parseDate(from); const closes = parseDate(addDays(from, 3)); return {n:i+1, from, to, opens: be.stamp(opens), closes: be.stamp(closes)}; });
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
    const data = Object.assign({compId:cid, golferId:gid, round, groupId: (groupOf(cid, round, gid) || {}).id || null, markerId:null, scores:{}, hi: snapHcp(g)}, prev || {}, {shots: isFinite(v) ? v : null, updatedAt:Date.now(), updatedBy:S.user.uid}); delete data.id;
    if (await put(`comps/${cid}/cards/${round}_${gid}`, data)) { closeSheet(); toast('Shots updated'); } },
  async group(f){
    const sh = S.sheet; const c = D.comps[sh.cid]; if (!c) return; const grp = sh.id ? D.groups[c.id + '/' + sh.id] : null; const round = grp ? grp.round : sh.round;
    let members = new FormData(f).getAll('gid'); if (!S.isAdmin) members = [S.myGid].concat(members.filter(x => x !== S.myGid));
    members = [...new Set(members)];
    if (members.length < 2 || members.length > 4) { toast('A group is 2 to 4 golfers.'); return; }
    if (members.some(x => { const o = groupOf(c.id, round, x); return o && (!grp || o.id !== grp.id); })) { toast('Someone ticked is already in another group this round.'); return; }
    const id = grp ? grp.id : newId();
    if (await put(`comps/${c.id}/groups/${id}`, {compId:c.id, round, members, createdBy: grp ? grp.createdBy : (S.isAdmin ? 'organiser' : S.myGid), createdAt: grp ? grp.createdAt : Date.now()})) { closeSheet(); toast(grp ? 'Group updated' : 'Group created. You can mark each other\'s cards now.'); }
  },
  async addAdmin(f){ const e = normEmail(new FormData(f).get('email')); if (!e) return; const list = [...new Set(((D.admins && D.admins.emails) || []).concat(e))]; if (await put('config/admins', Object.assign({}, D.admins, {emails:list}))) toast(`${e} is now an organiser`); }
};
let settingsTimer = null;
function saveSettings(){
  const g = id => document.getElementById(id); const k = cfg();
  const n = (id, d) => { const el = g(id); const v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : d; };
  const course = {parM:[], siM:[], parL:[], siL:[]};
  range(1,18).forEach(h => { course.parM.push(n('c-pm-'+h, k.course.parM[h-1])); course.siM.push(n('c-sm-'+h, k.course.siM[h-1])); course.parL.push(n('c-pl-'+h, k.course.parL[h-1])); course.siL.push(n('c-sl-'+h, k.course.siL[h-1])); });
  const rev = String((g('s-rev') || {}).value || '').trim().replace(/^https?:\/\/(www\.)?revolut\.me\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
  const data = { fee:n('s-fee', k.fee), revtag:rev, prize:[n('s-p1', k.prize[0]), n('s-p2', k.prize[1] != null ? k.prize[1] : 0)], points:[n('s-pt1', k.points[0]), n('s-pt2', k.points[1]), n('s-pt3', k.points[2]), n('s-pt4', k.points[3])], entryPoint:n('s-pte', k.entryPoint), rounds: Math.max(1, Math.min(5, n('s-rounds', k.rounds))), best: Math.max(1, Math.min(5, n('s-best', k.best))), allowance:n('s-allow', k.allowance), tee:(g('s-tee') || {}).value || k.tee, course, cutWinner:n('s-cw', k.cutWinner), cutRunner:n('s-cr', k.cutRunner), riseBy:n('s-rb', k.riseBy), riseAfter:Math.max(1, Math.round(n('s-ra', k.riseAfter))), hcpMax:n('s-hm', k.hcpMax) };
  D.settings = data; MEMO = {};
  clearTimeout(settingsTimer); settingsTimer = setTimeout(async () => { if (await put('config/settings', data)) syncHandicaps(); }, 400);
}

/* ---------- Sample data ---------- */
function sampleGolfers(){ return [['Mick Doyle',14.2,'M','mick@example.com'],['Ger Byrne',9.8,'M','ger@example.com'],['Aoife Kinsella',18.4,'L','aoife@example.com'],['Paddy Nolan',22.1,'M','paddy@example.com'],['Tom Kavanagh',6.3,'M','tom@example.com'],['Mary Hayden',24.6,'L','mary@example.com'],['Declan Fitzgerald',12.0,'M','declan@example.com'],['Niamh Dunne',11.7,'L','niamh@example.com']]; }
function sampleData(){
  let a = 20261024; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v); };
  const st = {}; const now = new Date();
  st['config/admins'] = {emails:['organiser@example.com']};
  st['config/settings'] = {revtag:'yourname', fee:10};
  const gs = sampleGolfers().map((g, i) => { const id = 'g' + i; st['golfers/' + id] = {name:g[0], hi:g[1], gender:g[2]}; st['members/' + g[3]] = {golferId:id, name:g[0]}; return {id, hi:g[1], gender:g[2]}; });
  const mk = (cid, name, y, m, status, fmt) => {
    const first = iso(firstFriday(y, m)); const rounds = weekendRounds(first, 4).map(r => Object.assign(r, {opens: parseDate(r.from).getTime(), closes: parseDate(addDays(r.from, 3)).getTime()}));
    st['comps/' + cid] = {name, date:first, rounds, best:3, format:fmt, holes:range(1,18), tee:'white', fee:10, allowance:95, status};
    gs.forEach((g, i) => { st[`comps/${cid}/entries/${g.id}`] = {compId:cid, golferId:g.id, paid: !(status === 'open' && i === 5), method:['revolut','card','cash'][i % 3]}; });
    rounds.forEach(r => {
      const state = roundState(r); if (state === 'upcoming') return;
      const playing = gs.filter(() => rnd() > 0.15);
      for (let i = 0; i + 1 < playing.length; i += 2) {
        const pair = playing.slice(i, i + (playing.length - i === 3 ? 3 : 2)); if (pair.length === 3) i++;
        const gid = 'grp' + cid + r.n + i; st[`comps/${cid}/groups/${gid}`] = {compId:cid, round:r.n, members:pair.map(p => p.id), createdBy:pair[0].id};
        pair.forEach((p, j) => {
          const par = p.gender === 'L' ? COURSE.parL : COURSE.parM; const scores = {};
          const upto = state === 'open' && j === 0 && i === 0 ? 11 : 18;
          range(1, upto).forEach(h => { let d = Math.round(gauss() * 0.95 + p.hi / 18 - 0.2); if (d <= -2 && rnd() > 0.25) d = -1; d = Math.min(d, 4); scores[h] = (fmt === 'stableford' && d >= 4 && rnd() < 0.4) ? 'P' : Math.max(1, par[h-1] + d); });
          const marker = state === 'open' && i === 2 && j === 1 ? null : pair[(j + 1) % pair.length].id;
          st[`comps/${cid}/cards/${r.n}_${p.id}`] = {compId:cid, golferId:p.id, round:r.n, groupId:gid, markerId:marker, scores, hi:p.hi, shots:null};
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
  if (t.id === 'scanFile') { startScan(t.files); return; }
  if (t.id === 'pinRemember') { S.pinRemember = t.checked; if (!t.checked) { try { localStorage.removeItem('rgc-admin'); } catch (_) {} } return; }
  if (t.id === 'markerSel' && S.card) { const {cid, round, gid} = S.card; const prev = cardOf(cid, round, gid); const grp = groupOf(cid, round, gid); const g = D.golfers[gid];
    const data = Object.assign({compId:cid, golferId:gid, round, scores:{}, hi: snapHcp(g), shots:null}, prev || {}, {groupId: grp ? grp.id : null, markerId: t.value || null, updatedAt:Date.now(), updatedBy:S.user.uid}); delete data.id;
    localSet(`comps/${cid}/cards/${round}_${gid}`, data); put(`comps/${cid}/cards/${round}_${gid}`, data).then(ok => ok && toast(t.value ? `Marked by ${gName(t.value)}` : 'Marker removed')); return; }
  if (t.closest('#setupForm')) { saveSettings(); return; }
  if (t.name === 'holes' && t.closest('form[data-form=comp]')) { $('#holepick').hidden = t.value !== 'custom'; return; }
  if (t.id === 'f-rcount') { const n = Number(t.value); const box = $('#f-rounds'); const have = [...box.querySelectorAll('input')].map(i => i.value); const first = have[0] || defaultFirstFri();
    box.innerHTML = range(1, n).map(i => roundDateInput(i, have[i-1] || addDays(first, 7*(i-1)))).join(''); const b = $('#f-best'); if (b && Number(b.value) > n) b.value = String(n); return; }
  if (t.id === 'f-r-1') { const box = $('#f-rounds'); const ins = [...box.querySelectorAll('input')]; ins.slice(1).forEach((inp, i) => { inp.value = addDays(t.value, 7*(i+1)); }); }
});
document.addEventListener('toggle', ev => { if (ev.target.id === 'courseDetails') S.courseOpen = ev.target.open; }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.sheet) closeSheet(); });
document.addEventListener('focusout', () => { if (deferred) { deferred = false; setTimeout(render, 0); } });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
const hv = (location.hash || '').slice(1); if (['comps','league','golfers','admin'].includes(hv)) S.view = hv;
window.__rgc = {S, D, scoreCard, leaderboard, roundBoard, league, allocShots};
boot();
