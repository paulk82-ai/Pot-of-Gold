// Firebase backend: sign-in, shared data and Gemini scanning.
// Loaded only when docs/config.js has a Firebase config filled in.
const V = '12.12.1';
const base = `https://www.gstatic.com/firebasejs/${V}`;

export async function init(cfg){
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const app = initializeApp(cfg.firebase);

  if (cfg.recaptchaEnterpriseSiteKey) {
    try {
      const AC = await import(`${base}/firebase-app-check.js`);
      AC.initializeAppCheck(app, { provider: new AC.ReCaptchaEnterpriseProvider(cfg.recaptchaEnterpriseSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.warn('App Check not started', e); }
  }

  const auth = A.getAuth(app);
  try { await A.setPersistence(auth, A.browserLocalPersistence); } catch (_) {}

  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (_) { db = F.getFirestore(app); }

  const ref = path => {
    const parts = path.split('/');
    return parts.length % 2 === 0 ? F.doc(db, path) : F.collection(db, path);
  };
  const userOf = u => u ? { uid: u.uid, email: (u.email || '').toLowerCase(), emailVerified: !!u.emailVerified, name: u.displayName || '', provider: (u.providerData[0] || {}).providerId || '' } : null;
  const docOut = d => ({ id: d.id, path: d.ref.path, data: d.data() });
  // Replace undefined with null, keep Timestamps and other class instances as they are.
  const clean = v => {
    if (v === undefined) return null;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o;
    }
    return v;
  };

  // Scanning tries the main model first. If it's over its limit (the free Flash tier allows only about 20 scans a day
  // and 5 a minute), busy, or retired, it moves on to the next model, which has its own, much bigger allowance.
  // Gemini 3 Flash thinks at MEDIUM by default, which is slow for reading a card: ask for LOW. Flash-Lite is already minimal.
  let aiInst = null; const models = {}; const noThink = new Set();
  const waitFor = name => /lite/.test(name) ? 30000 : 40000;
  async function model(name){
    if (models[name]) return models[name];
    if (!aiInst) { const AI = await import(`${base}/firebase-ai.js`); aiInst = { AI, inst: AI.getAI(app, { backend: new AI.GoogleAIBackend() }) }; }
    const gc = { responseMimeType: 'application/json' };
    if (/^gemini-[3-9][\d.]*-flash$/.test(name) && !noThink.has(name)) gc.thinkingConfig = { thinkingLevel: 'LOW' };
    models[name] = aiInst.AI.getGenerativeModel(aiInst.inst, { model: name, generationConfig: gc }, { timeout: waitFor(name) });
    return models[name];
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms + 2000))]);
  const scanModels = () => [...new Set([cfg.geminiModel || 'gemini-3.8-flash'].concat(cfg.geminiFallback || ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']))];
  const tryNext = e => /quota|429|exhaust|rate.?limit|too many|overload|unavailable|503|500|not.?found|404|not supported|deprecat|retired|timed? ?out|timeout|abort/i.test(String((e && (e.message || e.code)) || e));

  return {
    kind: 'firebase',
    onAuth(cb){ return A.onAuthStateChanged(auth, u => cb(userOf(u))); },
    async signInGoogle(){
      const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await A.signInWithRedirect(auth, p);
        else throw e;
      }
    },
    signInEmail: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    async signUpEmail(email, pw){ const r = await A.createUserWithEmailAndPassword(auth, email, pw); await A.sendEmailVerification(r.user); },
    async sendVerify(){ if (auth.currentUser) await A.sendEmailVerification(auth.currentUser); },
    async reloadUser(){ if (!auth.currentUser) return null; await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); return userOf(auth.currentUser); },
    resetPassword: email => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),
    watch(path, cb, err){
      const r = ref(path);
      if (r.type === 'document') return F.onSnapshot(r, d => cb(d.exists() ? { id: d.id, path: d.ref.path, data: d.data() } : null), err);
      return F.onSnapshot(r, s => cb(s.docs.map(docOut)), err);
    },
    watchGroup(name, cb, err){ return F.onSnapshot(F.collectionGroup(db, name), s => cb(s.docs.map(docOut)), err); },
    set: (path, data) => F.setDoc(F.doc(db, path), clean(data)),
    del: path => F.deleteDoc(F.doc(db, path)),
    async batch(ops){
      const b = F.writeBatch(db);
      ops.forEach(o => o.del ? b.delete(F.doc(db, o.path)) : b.set(F.doc(db, o.path), clean(o.data)));
      await b.commit();
    },
    newId: () => F.doc(F.collection(db, '_ids')).id,
    // Phone reminders (Firebase Cloud Messaging): a token for this phone, tied to the app's own service worker.
    async pushToken(vapidKey){
      const M = await import(`${base}/firebase-messaging.js`);
      if (!(await M.isSupported())) { const e = new Error('Notifications are not supported on this phone or browser.'); e.code = 'unsupported'; throw e; }
      const reg = await navigator.serviceWorker.ready;
      return M.getToken(M.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
    },
    async pushDrop(){ try { const M = await import(`${base}/firebase-messaging.js`); await M.deleteToken(M.getMessaging(app)); } catch (_) {} },
    stamp: date => F.Timestamp.fromDate(date),
    // check(text) says whether the reply is usable; if not, the next model has a go. Any failure moves on to the next
    // model except ones every model would hit (offline, App Check). The final error lists what each model said.
    async scan(prompt, imageBase64, mimeType, check, onTry){
      const fails = []; const list = scanModels();
      for (const [i, name] of list.entries()) {
        try {
          if (onTry) onTry(i, list.length);
          const ask = async () => { const m = await model(name); return withTimeout(m.generateContent([prompt, { inlineData: { data: imageBase64, mimeType } }]), waitFor(name)); };
          let res;
          try { res = await ask(); }
          catch (e) { if (!/thinking/i.test(String(e && e.message)) || noThink.has(name)) throw e; noThink.add(name); delete models[name]; res = await ask(); }
          const text = res.response.text();
          if (!check || check(text)) return text;
          fails.push(`${name}: unreadable reply ${JSON.stringify(String(text || '').slice(0, 80))}`);
        } catch (e) {
          console.warn('Scan with ' + name + ' failed', e); const msg = String((e && (e.message || e.code)) || e);
          fails.push(`${name}: ${msg.replace(/https?:\/\/\S+/g, '').slice(0, 160)}`);
          if (/app.?check|offline|failed to fetch|load failed|network/i.test(msg) && !tryNext(e)) break;
        }
      }
      const err = new Error(fails.join(' | ') || 'no scan models'); if (fails.length && fails.every(f => / unreadable reply /.test(f))) err.unreadable = true; throw err;
    }
  };
}
