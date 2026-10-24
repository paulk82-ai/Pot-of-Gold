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

  let ai = null;
  async function model(){
    if (ai) return ai;
    const AI = await import(`${base}/firebase-ai.js`);
    const inst = AI.getAI(app, { backend: new AI.GoogleAIBackend() });
    ai = AI.getGenerativeModel(inst, { model: cfg.geminiModel || 'gemini-3.8-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0 } });
    return ai;
  }

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
    stamp: date => F.Timestamp.fromDate(date),
    async scan(prompt, imageBase64, mimeType){
      const m = await model();
      const res = await m.generateContent([prompt, { inlineData: { data: imageBase64, mimeType } }]);
      return res.response.text();
    }
  };
}
