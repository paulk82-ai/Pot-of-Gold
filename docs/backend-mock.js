// Sample backend: keeps everything in this browser only. Used for "Try with sample data"
// and for testing. It copies the main Firestore rules so the app behaves the same way.
export async function init(cfg){
  const KEY = 'rgc-sample-v2';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) {} };
  let user = null; try { user = JSON.parse(sessionStorage.getItem(KEY + '-user') || 'null'); } catch (_) {}
  const authCbs = new Set(); const docW = new Map(); const colW = new Map(); const grpW = new Map();
  const segs = p => p.split('/');
  const fire = path => {
    setTimeout(() => {
      (docW.get(path) || []).forEach(f => f(store[path] ? { id: segs(path).pop(), path, data: store[path] } : null));
      const col = segs(path).slice(0, -1).join('/');
      (colW.get(col) || []).forEach(f => f(listCol(col)));
      const name = segs(path).slice(-2, -1)[0];
      (grpW.get(name) || []).forEach(f => f(listGroup(name)));
    }, 0);
  };
  const listCol = col => Object.keys(store).filter(k => { const s = segs(k); return s.length === segs(col).length + 1 && k.startsWith(col + '/'); }).map(k => ({ id: segs(k).pop(), path: k, data: store[k] }));
  const listGroup = name => Object.keys(store).filter(k => { const s = segs(k); return s.length >= 2 && s[s.length - 2] === name; }).map(k => ({ id: segs(k).pop(), path: k, data: store[k] }));
  const setUser = u => { user = u; try { sessionStorage.setItem(KEY + '-user', JSON.stringify(u)); } catch (_) {} authCbs.forEach(f => f(user)); };
  const deny = msg => { const e = new Error(msg || 'Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; };

  // ---- rules copy ----
  const email = () => user && user.email;
  const isAdmin = () => !!(user && user.emailVerified && store['config/admins'] && (store['config/admins'].emails || []).includes(email()));
  const myGid = () => { const m = user && user.emailVerified && store['members/' + email()]; return m ? m.golferId : null; };
  const roundOpen = (comp, n) => { const r = (comp.rounds || [])[n - 1]; if (!r) return false; const now = Date.now(); return now >= r.opens && now < r.closes; };
  function check(path, data){
    if (!user) throw deny();
    const s = segs(path);
    if (isAdmin()) return;
    if (path === 'config/admins' && !store[path] && data && JSON.stringify(data.emails) === JSON.stringify([email()]) && user.emailVerified) return;
    const g = myGid(); if (!g) throw deny();
    if (s[0] === 'comps' && s.length === 4) {
      const comp = store['comps/' + s[1]]; if (!comp || comp.status !== 'open') throw deny('This competition is closed.');
      if (s[2] === 'entries') { if (data && s[3] === g && data.golferId === g && data.paid === false && !store[path]) return; throw deny(); }
      if (s[2] === 'groups') {
        const cur = store[path]; const m = data ? data.members || [] : [];
        if (!data) { if (cur && cur.members.includes(g) && roundOpen(comp, cur.round)) return; throw deny(); }
        if (!m.includes(g) || m.length < 2 || m.length > 4) throw deny('A group needs you and 1 to 3 others.');
        if (cur && (!cur.members.includes(g) || cur.round !== data.round)) throw deny();
        if (!roundOpen(comp, data.round)) throw deny('This round is not open.');
        if (!m.every(x => store[`comps/${s[1]}/entries/${x}`])) throw deny('Everyone in a group must be entered.');
        return;
      }
      if (s[2] === 'cards') {
        if (!data) throw deny();
        const grp = store[`comps/${s[1]}/groups/${data.groupId}`];
        if (data.golferId === g) throw deny("You can't mark your own card.");
        if (data.markerId !== g) throw deny();
        if (!grp || grp.round !== data.round || !grp.members.includes(g) || !grp.members.includes(data.golferId)) throw deny('Only someone from the group can mark this card.');
        if (s[3] !== `${data.round}_${data.golferId}`) throw deny();
        if (!roundOpen(comp, data.round)) throw deny('This round is not open.');
        return;
      }
    }
    throw deny();
  }

  return {
    kind: 'mock',
    onAuth(cb){ authCbs.add(cb); setTimeout(() => cb(user), 0); return () => authCbs.delete(cb); },
    async signInGoogle(){ setUser({ uid: 'u-' + (cfg.mockEmail || 'organiser@example.com'), email: (cfg.mockEmail || 'organiser@example.com').toLowerCase(), emailVerified: true, name: 'Sample user', provider: 'google.com' }); },
    async signInEmail(e){ setUser({ uid: 'u-' + e.toLowerCase(), email: e.toLowerCase(), emailVerified: true, name: '', provider: 'password' }); },
    async signUpEmail(e){ setUser({ uid: 'u-' + e.toLowerCase(), email: e.toLowerCase(), emailVerified: true, name: '', provider: 'password' }); },
    async sendVerify(){}, async reloadUser(){ return user; }, async resetPassword(){},
    async signOut(){ setUser(null); },
    watch(path, cb){
      const isDoc = segs(path).length % 2 === 0; const m = isDoc ? docW : colW;
      if (!m.has(path)) m.set(path, new Set()); m.get(path).add(cb);
      setTimeout(() => cb(isDoc ? (store[path] ? { id: segs(path).pop(), path, data: store[path] } : null) : listCol(path)), 0);
      return () => m.get(path).delete(cb);
    },
    watchGroup(name, cb){ if (!grpW.has(name)) grpW.set(name, new Set()); grpW.get(name).add(cb); setTimeout(() => cb(listGroup(name)), 0); return () => grpW.get(name).delete(cb); },
    async set(path, data){ check(path, data); store[path] = JSON.parse(JSON.stringify(data)); persist(); fire(path); },
    async del(path){ check(path, null); delete store[path]; persist(); fire(path); },
    async batch(ops){ ops.forEach(o => check(o.path, o.del ? null : o.data)); ops.forEach(o => { if (o.del) delete store[o.path]; else store[o.path] = JSON.parse(JSON.stringify(o.data)); }); persist(); ops.forEach(o => fire(o.path)); },
    newId: () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4),
    stamp: date => date.getTime(),
    async scan(promptText){
      await new Promise(r => setTimeout(r, 700));
      if (window.__mockScan) return JSON.stringify(window.__mockScan(promptText));
      return JSON.stringify({ golfers: [], notes: 'Sample mode does not read real photos.' });
    },
    _seed(data){ store = data; persist(); Object.keys(store).forEach(fire); },
    _store: () => store
  };
}
