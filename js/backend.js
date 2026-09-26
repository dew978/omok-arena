/* 데이터 계층: Firebase(실제 운영) / 데모(이 브라우저 localStorage, 여러 탭 대전 가능)
   두 구현 모두 같은 인터페이스를 제공합니다. */
(function () {
  const EMAIL_DOMAIN = 'omok.example.com';
  const toEmail = (id) => `${String(id).toLowerCase()}@${EMAIL_DOMAIN}`;
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (path) => String(path || '').split('/').filter(Boolean);

  function getAt(root, ps) {
    let cur = root;
    for (const p of ps) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[p];
    }
    return cur === undefined ? null : cur;
  }
  function setAt(root, ps, val) {
    if (!ps.length) return val == null ? {} : val;
    let cur = root;
    const stack = [];
    for (let i = 0; i < ps.length - 1; i++) {
      if (cur[ps[i]] == null || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {};
      stack.push([cur, ps[i]]);
      cur = cur[ps[i]];
    }
    const last = ps[ps.length - 1];
    if (val == null) delete cur[last];
    else cur[last] = val;
    // 비어 있는 상위 노드 정리
    for (let i = stack.length - 1; i >= 0; i--) {
      const [obj, k] = stack[i];
      if (obj[k] && typeof obj[k] === 'object' && !Object.keys(obj[k]).length) delete obj[k];
    }
    return root;
  }
  // 배열로 저장된 값을 Firebase처럼 정규화 (null 요소 제거는 하지 않음)
  const norm = (v) => (v == null ? null : clone(v));

  let pushCounter = 0;
  function newKey() {
    const t = Date.now().toString(36).padStart(9, '0');
    const r = Math.random().toString(36).slice(2, 8);
    return `${t}${(pushCounter++ % 1296).toString(36).padStart(2, '0')}${r}`;
  }

  /* ───────────── 데모 백엔드 ───────────── */
  function DemoBackend() {
    const KEY = 'omokArenaDemoDB_v1';
    const AUTH_KEY = 'omokArenaDemoAuth_v1';
    const SESSION_KEY = 'omokArenaDemoUid';
    const listeners = new Set();
    let authCbs = [];

    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); };
    const loadAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch (e) { return {}; } };
    const saveAuth = (a) => localStorage.setItem(AUTH_KEY, JSON.stringify(a));

    function notify() {
      const db = load();
      for (const l of listeners) {
        const v = getAt(db, l.ps);
        const s = JSON.stringify(v);
        // 백그라운드 탭에서 setTimeout이 지연되지 않도록 마이크로태스크 사용
        if (s !== l.last) { l.last = s; const c = clone(v); queueMicrotask(() => l.active && l.cb(c)); }
      }
    }
    window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

    function write(mut) { const db = load(); const r = mut(db); save(r || db); notify(); }

    let uid = sessionStorage.getItem(SESSION_KEY);
    const api = {
      mode: 'demo',
      async init() {},
      now: () => Date.now(),
      newKey,
      async get(path) { return clone(getAt(load(), parts(path))); },
      async set(path, val) { write((db) => setAt(db, parts(path), norm(val))); },
      async update(path, obj) {
        write((db) => {
          for (const [k, v] of Object.entries(obj)) db = setAt(db, parts(path).concat(parts(k)), norm(v));
          return db;
        });
      },
      async remove(path) { write((db) => setAt(db, parts(path), null)); },
      on(path, cb) {
        const l = { ps: parts(path), cb, last: undefined, active: true };
        listeners.add(l);
        const v = getAt(load(), l.ps);
        l.last = JSON.stringify(v);
        const c = clone(v);
        queueMicrotask(() => l.active && cb(c));
        return () => { l.active = false; listeners.delete(l); };
      },
      async tx(path, fn) {
        const db = load();
        const cur = clone(getAt(db, parts(path)));
        const next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        save(setAt(db, parts(path), norm(next)));
        notify();
        return { committed: true, value: clone(next) };
      },
      // ── 인증 ──
      currentUid: () => uid,
      onAuth(cb) { authCbs.push(cb); setTimeout(() => cb(uid), 0); },
      async signIn(loginId, pw) {
        const a = loadAuth()[String(loginId).toLowerCase()];
        if (!a || a.pw !== pw) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
        uid = a.uid;
        sessionStorage.setItem(SESSION_KEY, uid);
        authCbs.forEach((f) => f(uid));
        return uid;
      },
      async signOut() { uid = null; sessionStorage.removeItem(SESSION_KEY); authCbs.forEach((f) => f(null)); },
      async createAccount(loginId, pw) {
        const a = loadAuth();
        const id = String(loginId).toLowerCase();
        if (a[id]) throw new Error(`이미 있는 아이디입니다: ${loginId}`);
        if (String(pw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        const newUid = 'u' + newKey();
        a[id] = { uid: newUid, pw };
        saveAuth(a);
        return newUid;
      },
      async signUpSelf(loginId, pw) { const u = await api.createAccount(loginId, pw); await api.signIn(loginId, pw); return u; },
      async setPassword(loginId, oldPw, newPw) {
        const a = loadAuth();
        const id = String(loginId).toLowerCase();
        if (!a[id]) throw new Error('계정을 찾을 수 없습니다.');
        if (String(newPw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        a[id].pw = newPw;
        saveAuth(a);
      },
      async deleteAccount(loginId) {
        const a = loadAuth();
        delete a[String(loginId).toLowerCase()];
        saveAuth(a);
      },
      setupPresence() {},
      resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(SESSION_KEY); },
    };
    return api;
  }

  /* ───────────── Firebase 백엔드 ───────────── */
  function FirebaseBackend(config) {
    const V = '10.12.2';
    const libs = ['app', 'auth', 'database'].map((n) => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}-compat.js`);
    let db, auth, second, offset = 0;
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Firebase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
      document.head.appendChild(s);
    });
    const koErr = (e) => {
      const c = (e && e.code) || '';
      if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      if (/email-already-in-use/.test(c)) return new Error('이미 있는 아이디입니다.');
      if (/weak-password/.test(c)) return new Error('비밀번호는 6자 이상이어야 합니다.');
      if (/too-many-requests/.test(c)) return new Error('시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
      if (/network/.test(c)) return new Error('네트워크 오류입니다. 인터넷 연결을 확인하세요.');
      if (/PERMISSION_DENIED|permission/i.test(String(e && e.message))) return new Error('권한이 없습니다. (보안 규칙 확인)');
      return e instanceof Error ? e : new Error(String(e));
    };

    const api = {
      mode: 'firebase',
      async init() {
        for (const s of libs) await loadScript(s);
        const app = firebase.initializeApp(config);
        second = firebase.initializeApp(config, 'secondary');
        db = firebase.database(app);
        auth = firebase.auth(app);
        db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
      },
      now: () => Date.now() + offset,
      newKey: () => db.ref().push().key,
      async get(path) { try { return (await db.ref(path).get()).val(); } catch (e) { throw koErr(e); } },
      async set(path, val) { try { await db.ref(path).set(clone(val)); } catch (e) { throw koErr(e); } },
      async update(path, obj) { try { await db.ref(path || '/').update(clone(obj)); } catch (e) { throw koErr(e); } },
      async remove(path) { try { await db.ref(path).remove(); } catch (e) { throw koErr(e); } },
      on(path, cb) {
        const ref = db.ref(path);
        const h = ref.on('value', (s) => cb(s.val()), (e) => console.warn('listen', path, e));
        return () => ref.off('value', h);
      },
      async tx(path, fn) {
        // 트랜잭션은 로컬 캐시에서 먼저 실행되므로, 임시 리스너로 캐시를 채운 뒤 실행
        const ref = db.ref(path);
        let h;
        await new Promise((res) => { h = ref.on('value', () => res(), () => res()); });
        try {
          const r = await ref.transaction((cur) => {
            const next = fn(cur == null ? null : cur);
            return next === undefined ? undefined : clone(next);
          }, undefined, false);
          return { committed: r.committed, value: r.snapshot.val() };
        } catch (e) { throw koErr(e); }
        finally { ref.off('value', h); }
      },
      currentUid: () => (auth.currentUser ? auth.currentUser.uid : null),
      onAuth(cb) { auth.onAuthStateChanged((u) => cb(u ? u.uid : null)); },
      async signIn(loginId, pw) {
        try { return (await auth.signInWithEmailAndPassword(toEmail(loginId), pw)).user.uid; } catch (e) { throw koErr(e); }
      },
      async signOut() { await auth.signOut(); },
      // 관리자 세션을 유지한 채 보조 앱으로 계정 생성
      async createAccount(loginId, pw) {
        try {
          const c = await second.auth().createUserWithEmailAndPassword(toEmail(loginId), pw);
          const u = c.user.uid;
          await second.auth().signOut();
          return u;
        } catch (e) { throw koErr(e); }
      },
      async signUpSelf(loginId, pw) {
        try { return (await auth.createUserWithEmailAndPassword(toEmail(loginId), pw)).user.uid; } catch (e) { throw koErr(e); }
      },
      async setPassword(loginId, oldPw, newPw) {
        try {
          const c = await second.auth().signInWithEmailAndPassword(toEmail(loginId), oldPw);
          await c.user.updatePassword(newPw);
          await second.auth().signOut();
        } catch (e) { throw koErr(e); }
      },
      async deleteAccount(loginId, pw) {
        try {
          const c = await second.auth().signInWithEmailAndPassword(toEmail(loginId), pw);
          await c.user.delete();
        } catch (e) { throw koErr(e); }
      },
      setupPresence(uid, getVal) {
        const ref = db.ref('presence/' + uid);
        db.ref('.info/connected').on('value', (s) => {
          if (s.val() !== true) return;
          ref.onDisconnect().remove().then(() => ref.set(getVal()));
        });
      },
    };
    return api;
  }

  window.Backend = window.OMOK_FIREBASE_CONFIG ? FirebaseBackend(window.OMOK_FIREBASE_CONFIG) : DemoBackend();
})();
