/* 오목 아레나 — 앱 본체 (로그인, 학생 홈, 매칭, 경기 진행, 점수 반영) */
(function () {
  const B = window.Backend, R = window.Rating, J = window.Renju;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ONLINE_MS = 45000;
  const AI_NAMES = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const MATCH_NAMES = { random: '랜덤 매치', select: '1:1 선택 매치', assigned: '선생님 배정', ai: 'AI 대전', friend: '친구 대전' };
  const REASON_NAMES = { five: '오목 완성', foul: '흑 금수 반칙패', resign: '기권', timeout: '시간 초과', draw: '무승부', cancel: '취소' };

  /* 역할
     - isSuper : 총관리자(master). 반 목록·가입 코드 관리, 모든 반 관리 가능
     - isMaster: 현재 반의 관리자 화면을 쓰는 사람 (반 관리자 또는 총관리자)
     - 학생    : 자기 반(cid) 안에서만 경기 */
  const S = {
    uid: null, isSuper: false, isMaster: false, masterUid: null, masterName: '선생님',
    cid: null, classMeta: null, classList: {}, loginKey: '',
    users: {}, presence: {}, active: {}, settingsRaw: {}, champion: null, seasons: {},
    myGames: {}, subs: [], classSubs: [], timers: [], screen: null, pst: 'idle',
    pref: { aiLevel: 'normal', aiColor: 'black' },
    dismissed: {}, game: null, queue: null, queueData: {}, outInvite: null, inviteModal: null, settingUp: false,
  };
  const settings = () => Object.assign({}, R.DEFAULT_SETTINGS, S.settingsRaw || {});

  // 현재 반(classes/{cid}) 아래 경로로 읽고 쓰는 도우미
  const D = {
    p: (path) => `classes/${S.cid}` + (path ? '/' + path : ''),
    get: (p) => B.get(D.p(p)),
    set: (p, v) => B.set(D.p(p), v),
    update: (p, o) => B.update(D.p(p), o),
    remove: (p) => B.remove(D.p(p)),
    on: (p, f) => B.on(D.p(p), f),
    tx: (p, f) => B.tx(D.p(p), f),
  };
  const CODE_RE = /^[a-z0-9][a-z0-9-]{1,11}$/;
  const ID_RE = /^[a-z0-9_]{2,20}$/;
  // Firebase 계정 키: 총관리자는 'master', 그 외는 '반코드.아이디'
  const accountKey = (cid, id) => (cid ? `${cid}.${id}` : id).toLowerCase();

  /* ───────────── 공통 UI ───────────── */
  const EMB = {
    bronze: '<path d="M12 1.8 20.5 5v6.2c0 5.6-3.6 9.7-8.5 11.2C7.1 20.9 3.5 16.8 3.5 11.2V5z" fill="url(#g-bronze)" stroke="#4a230c" stroke-width=".8"/><path d="M12 5.4 16.8 7.3v4c0 3.4-2 6-4.8 7.1-2.8-1.1-4.8-3.7-4.8-7.1v-4z" fill="none" stroke="#ffd9b8" stroke-opacity=".6"/><circle cx="12" cy="11.6" r="2" fill="#ffd9b8" fill-opacity=".7"/>',
    silver: '<path d="M12 1.8 20.5 5v6.2c0 5.6-3.6 9.7-8.5 11.2C7.1 20.9 3.5 16.8 3.5 11.2V5z" fill="url(#g-silver)" stroke="#4d5668" stroke-width=".8"/><path d="M8 8.8l4 2.8 4-2.8M8 12.6l4 2.8 4-2.8" fill="none" stroke="#4d5668" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    gold: '<path d="M12 1.8 20.5 5v6.2c0 5.6-3.6 9.7-8.5 11.2C7.1 20.9 3.5 16.8 3.5 11.2V5z" fill="url(#g-gold)" stroke="#7a4a05" stroke-width=".8"/><path d="M12 6.4l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff6cf" stroke="#9a6308" stroke-width=".6"/>',
    platinum: '<path d="M12 1.5 21 6.8v10.4l-9 5.3-9-5.3V6.8z" fill="url(#g-platinum)" stroke="#0b5752" stroke-width=".8"/><path d="M12 5.6 17.4 8.8v6.4L12 18.4l-5.4-3.2V8.8z" fill="#e9fffb" fill-opacity=".28" stroke="#e9fffb" stroke-opacity=".75" stroke-width=".8"/><path d="M12 5.6v12.8M6.6 8.8l10.8 6.4M17.4 8.8 6.6 15.2" stroke="#e9fffb" stroke-opacity=".35" stroke-width=".6"/>',
    diamond: '<path d="M6.3 3h11.4L22.2 9 12 22.2 1.8 9z" fill="url(#g-diamond)" stroke="#2e1f7a" stroke-width=".8"/><path d="M1.8 9h20.4M6.3 3 9 9l3 13.2L15 9l2.7-6M9 9l3-6 3 6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/><path d="M6.3 3 9 9H1.8z" fill="#fff" fill-opacity=".25"/>',
    champion: '<path d="M2.4 8.2 7 12.2l5-8.4 5 8.4 4.6-4-2.1 11.3h-15z" fill="url(#g-champion)" stroke="#7a200c" stroke-width=".8" stroke-linejoin="round"/><rect x="4.4" y="19.7" width="15.2" height="2.6" rx="1.1" fill="url(#g-champion)" stroke="#7a200c" stroke-width=".6"/><circle cx="12" cy="14.3" r="1.9" fill="#ff3d6e" stroke="#fff" stroke-width=".6"/><circle cx="7.6" cy="15.6" r="1" fill="#4fd1ff"/><circle cx="16.4" cy="15.6" r="1" fill="#4fd1ff"/><circle cx="2.4" cy="8.2" r="1.4" fill="#fff3a6"/><circle cx="12" cy="3.6" r="1.4" fill="#fff3a6"/><circle cx="21.6" cy="8.2" r="1.4" fill="#fff3a6"/>',
    placement: '<circle cx="12" cy="12" r="10" fill="url(#g-placement)" stroke="#2c3550"/><text x="12" y="16.6" text-anchor="middle" font-size="13" font-weight="800" fill="#e6ebf7" font-family="system-ui,sans-serif">?</text>',
    ai: '<rect x="3.5" y="6.5" width="17" height="13" rx="4" fill="url(#g-ai)" stroke="#1d3d99" stroke-width=".7"/><circle cx="9" cy="13" r="1.9" fill="#0c1120"/><circle cx="15" cy="13" r="1.9" fill="#0c1120"/><path d="M12 6.5V3.6" stroke="#9ef0ff" stroke-width="1.5"/><circle cx="12" cy="2.9" r="1.4" fill="#9ef0ff"/>',
    none: '<circle cx="12" cy="12" r="9" fill="#2a3350"/>',
  };
  const emblem = (id) => `<svg class="emb" viewBox="0 0 24 24">${EMB[id] || EMB.none}</svg>`;

  function tierOfUid(uid) {
    if (uid === 'AI') return { id: 'ai', name: 'AI' };
    return R.displayTier(S.users[uid], S.champion, uid);
  }
  function nameOf(uid, g) {
    if (uid === 'AI') return `AI (${AI_NAMES[g && g.aiLevel] || ''})`;
    return (S.users[uid] && S.users[uid].name) || '(삭제된 학생)';
  }
  function nameTag(uid, cls = '', opts = {}) {
    if (uid === 'AI') return `<span class="ntag t-ai ${cls}">${emblem('ai')}<span class="nm">AI${opts.level ? ' · ' + AI_NAMES[opts.level] : ''}</span></span>`;
    const u = S.users[uid];
    if (!u) return `<span class="ntag t-none ${cls}">${emblem('none')}<span class="nm">(삭제된 학생)</span></span>`;
    const t = tierOfUid(uid);
    return `<span class="ntag t-${t.id} ${cls}" title="${esc(t.name)}">${emblem(t.id)}<span class="nm">${esc(u.name)}</span>${opts.tier ? `<span class="tn">${esc(t.name)}</span>` : ''}</span>`;
  }
  function scoreText(uid, g) {
    if (uid === 'AI') return `난이도 ${AI_NAMES[g && g.aiLevel] || ''}`;
    const u = S.users[uid];
    if (!u) return '';
    if ((u.placed || 0) < R.PLACEMENT_GAMES) return S.isMaster ? `배치 ${u.placed || 0}/5 · 임시 ${u.score}점` : `배치고사 ${u.placed || 0}/5`;
    return `${u.score}점`;
  }
  const isOnline = (uid) => { const p = S.presence[uid]; return !!p && B.now() - (p.ts || 0) < ONLINE_MS; };
  function status(uid) {
    if (S.active[uid]) return 'game';
    if (!isOnline(uid)) return 'off';
    return S.presence[uid].st === 'queue' ? 'queue' : 'idle';
  }
  const STATUS_KO = { game: '경기 중', queue: '매칭 중', idle: '접속 중', off: '오프라인' };
  const statusDot = (uid) => { const s = status(uid); return `<span class="dot ${s === 'idle' ? 'on' : s}" title="${STATUS_KO[s]}"></span>`; };

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function modal(html, opts = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">${html}</div>`;
    $('#modal-root').appendChild(bg);
    let closed = false;
    const close = () => { if (closed) return; closed = true; bg.remove(); opts.onClose && opts.onClose(); };
    if (opts.dismissable !== false) bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); });
    bg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    return { el: bg.firstElementChild, bg, close, get closed() { return closed; } };
  }
  function confirmBox(title, msg, ok = '확인', danger = false) {
    return new Promise((res) => {
      let v = false;
      const m = modal(`<h3>${esc(title)}</h3><p class="muted" style="line-height:1.6">${msg}</p>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
        { onClose: () => res(v) });
      m.el.querySelector('[data-ok]').onclick = () => { v = true; m.close(); };
    });
  }
  const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  function show(name) {
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    $('#scr-' + name).classList.remove('hidden');
    S.screen = name;
    render();
  }
  let renderPending = false;
  function render() {
    if (renderPending) return;
    renderPending = true;
    const run = () => {
      if (!renderPending) return;
      renderPending = false;
      if (S.screen === 'home') renderHome();
      else if (S.screen === 'admin' && window.Admin) window.Admin.render();
      else if (S.screen === 'game') renderGame();
    };
    // 화면이 숨겨진 상태에서는 requestAnimationFrame이 멈추므로 대체 경로 사용
    if (document.hidden) setTimeout(run, 0);
    else requestAnimationFrame(run);
  }
  document.addEventListener('visibilitychange', () => { renderPending = false; render(); });

  /* ───────────── 시작 / 로그인 ───────────── */
  async function boot() {
    try {
      await B.init();
    } catch (e) {
      $('#loading-msg').textContent = e.message;
      return;
    }
    if (B.mode === 'demo') $('#demo-note').classList.remove('hidden');
    try { $('#login-class').value = localStorage.getItem('omokClassCode') || ''; } catch (e) {}
    B.onAuth(async (uid) => {
      if (S.settingUp) return;
      endSession();
      if (!uid) {
        const m = await B.get('config/master').catch(() => null);
        show(m ? 'login' : 'setup');
        return;
      }
      await startSession(uid);
    });
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-err').textContent = '';
    const code = $('#login-class').value.trim().toLowerCase();
    const id = $('#login-id').value.trim().toLowerCase();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      if (code && !(await B.get(`classes/${code}/pub`))) throw new Error(`반 코드 「${code}」를 찾을 수 없습니다.`);
      if (!code && id !== 'master') throw new Error('반 코드를 입력하세요. (총관리자만 비워 둡니다)');
      await B.signIn(accountKey(code, id), $('#login-pw').value);
      try { localStorage.setItem('omokClassCode', code); } catch (e2) {}
    } catch (err) { $('#login-err').textContent = err.message; }
    btn.disabled = false;
  });
  $('#to-signup').addEventListener('click', () => show('signup'));
  $('#to-login').addEventListener('click', () => show('login'));

  // 선생님: 가입 코드로 새 반 만들기
  $('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $('#signup-err');
    err.textContent = '';
    const joinCode = f.join.value.trim();
    const cname = f.cname.value.trim();
    const code = f.code.value.trim().toLowerCase();
    const tname = f.tname.value.trim() || '선생님';
    const id = f.tid.value.trim().toLowerCase();
    const pw = f.pw.value, pw2 = f.pw2.value;
    if (!CODE_RE.test(code)) { err.textContent = '반 코드는 영문 소문자·숫자·하이픈(-) 2~12자로, 첫 글자는 영문이나 숫자여야 해요.'; return; }
    if (!ID_RE.test(id)) { err.textContent = '관리자 아이디는 영문 소문자·숫자·_ 2~20자입니다.'; return; }
    if (pw !== pw2) { err.textContent = '비밀번호가 서로 다릅니다.'; return; }
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (await B.get(`classes/${code}/pub`)) throw new Error('이미 사용 중인 반 코드입니다. 다른 코드를 정하세요.');
      S.settingUp = true;
      let uid, reused = false;
      try { uid = await B.signUpSelf(accountKey(code, id), pw); }
      catch (e3) {
        // 삭제된 반의 관리자 계정이 남아 있는 경우: 같은 비밀번호면 재사용
        if (!/이미 있는/.test(e3.message)) throw e3;
        try { uid = await B.signIn(accountKey(code, id), pw); reused = true; }
        catch (e4) { throw new Error('이 반 코드에 같은 관리자 아이디가 이미 쓰인 적이 있어요. 다른 관리자 아이디를 정하세요.'); }
        if (await B.get('members/' + uid).catch(() => null)) { await B.signOut(); throw new Error('이미 사용 중인 관리자 계정입니다.'); }
      }
      try {
        // 데모 모드는 보안 규칙이 없으므로 직접 확인 (Firebase에서는 규칙이 확인)
        if (B.mode === 'demo') {
          const jc = await B.get('config/joinCode');
          if (!jc || jc !== joinCode) throw new Error('denied');
        }
        const now = B.now();
        await B.set('members/' + uid, { cid: code, role: 'teacher', proof: joinCode, loginId: id, name: tname });
        await B.set(`classes/${code}/meta`, { name: cname, owner: uid, teacherName: tname, createdAt: now });
        await B.set(`classes/${code}/pub`, { name: cname });
        await B.set(`classList/${code}`, { name: cname, teacherName: tname, owner: uid, createdAt: now });
      } catch (inner) {
        if (reused) await B.signOut().catch(() => {});
        else await B.deleteSelf().catch(() => {});
        throw new Error('가입 코드가 올바르지 않습니다. 총관리자에게 받은 코드를 확인하세요.');
      }
      S.settingUp = false;
      try { localStorage.setItem('omokClassCode', code); } catch (e2) {}
      await startSession(uid);
    } catch (e2) {
      S.settingUp = false;
      err.textContent = e2.message;
    }
    btn.disabled = false;
  });
  $('#demo-reset').addEventListener('click', async () => {
    if (!(await confirmBox('데모 데이터 초기화', '이 브라우저의 모든 데모 데이터(계정·점수·기록)가 삭제됩니다.', '초기화', true))) return;
    B.resetDemo();
    location.reload();
  });
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#setup-name').value.trim() || '선생님';
    const pw = $('#setup-pw').value, pw2 = $('#setup-pw2').value;
    $('#setup-err').textContent = '';
    if (pw !== pw2) { $('#setup-err').textContent = '비밀번호가 서로 다릅니다.'; return; }
    S.settingUp = true;
    try {
      const uid = await B.signUpSelf('master', pw);
      const r = await B.tx('config/master', (cur) => (cur ? undefined : uid));
      if (!r.committed) throw new Error('이미 관리자 계정이 있습니다.');
      await B.set('config/masterName', name);
      S.settingUp = false;
      await startSession(uid);
    } catch (err) {
      S.settingUp = false;
      $('#setup-err').textContent = err.message;
    }
  });

  async function startSession(uid) {
    S.uid = uid;
    let mem = null;
    try {
      S.masterUid = await B.get('config/master');
      S.isSuper = uid === S.masterUid;
      if (!S.isSuper) {
        mem = await B.get('members/' + uid);
        if (!mem || !mem.cid) throw new Error('등록되지 않은 계정입니다. 선생님께 문의하세요.');
        if (mem.role !== 'teacher' && !(await B.get(`classes/${mem.cid}/users/${uid}`))) throw new Error('등록되지 않은 계정입니다. 선생님께 문의하세요.');
      }
    } catch (err) {
      await B.signOut();
      show('login');
      $('#login-err').textContent = err.message;
      return;
    }
    S.isMaster = S.isSuper || mem.role === 'teacher';
    S.loginKey = S.isSuper ? 'master' : accountKey(mem.cid, mem.loginId || '');
    S.timers.push(setInterval(render, 20000));
    if (S.isSuper) {
      S.subs.push(B.on('classList', (v) => { S.classList = v || {}; render(); }));
      let last = null;
      try { last = localStorage.getItem('omokSuperClass'); } catch (e) {}
      show('admin');
      if (window.Admin) window.Admin.boot();
      await enterClass(last && (await B.get(`classes/${last}/pub`)) ? last : null);
      return;
    }
    await enterClass(mem.cid);
    show(S.isMaster ? 'admin' : 'home');
    if (S.isMaster && window.Admin) window.Admin.boot();
  }

  // 반 전환: 반 단위 구독을 모두 새로 연결
  async function enterClass(cid) {
    S.classSubs.forEach((u) => u());
    S.classSubs = [];
    if (window.Admin) window.Admin.leave();
    stopQueue(true);
    closeGame();
    Object.assign(S, { cid, classMeta: null, users: {}, presence: {}, active: {}, settingsRaw: {}, seasons: {}, myGames: {}, champion: null, dismissed: {} });
    if (S.isSuper) { try { localStorage.setItem('omokSuperClass', cid || ''); } catch (e) {} }
    if (!cid) { render(); return; }
    S.classMeta = (await B.get(`classes/${cid}/meta`)) || {};
    if (S.cid !== cid) return;
    S.masterName = S.classMeta.teacherName || '선생님';
    const sub = (p, f) => S.classSubs.push(D.on(p, f));
    sub('settings', (v) => { S.settingsRaw = v || {}; render(); });
    sub('users', (v) => {
      S.users = v || {};
      S.champion = R.championOf(S.users);
      if (!S.isMaster && S.uid && !S.users[S.uid]) { toast('계정이 삭제되었습니다.', 'bad'); logout(); return; }
      render();
    });
    sub('presence', (v) => { S.presence = v || {}; render(); });
    sub('active', (v) => { S.active = v || {}; onActiveChange(); render(); });
    sub('seasons', (v) => { S.seasons = v || {}; render(); });
    if (!S.isMaster) {
      sub('userGames/' + S.uid, (v) => { S.myGames = v || {}; render(); });
      sub('invites/' + S.uid, (v) => onInvites(v || {}));
      // 학생만 접속 상태를 기록
      S.pst = 'idle';
      const pval = () => ({ ts: B.now(), st: S.pst });
      B.setupPresence(D.p('presence/' + S.uid), pval);
      D.set('presence/' + S.uid, pval()).catch(() => {});
      S.timers.push(setInterval(heartbeat, 15000));
    }
    if (S.isMaster && window.Admin) window.Admin.enter();
    render();
  }
  function heartbeat() { if (S.uid && S.cid && !S.isMaster) D.set('presence/' + S.uid, { ts: B.now(), st: S.pst }).catch(() => {}); }

  function endSession() {
    S.subs.forEach((u) => u());
    S.classSubs.forEach((u) => u());
    S.subs = [];
    S.classSubs = [];
    S.timers.forEach((t) => clearInterval(t));
    S.timers = [];
    stopQueue(false);
    cancelOutInvite(false);
    closeGame();
    if (window.Admin) window.Admin.leave();
    $('#modal-root').innerHTML = '';
    Object.assign(S, { uid: null, isSuper: false, isMaster: false, cid: null, classMeta: null, classList: {}, users: {}, presence: {}, active: {}, myGames: {}, dismissed: {} });
  }
  async function logout() {
    const uid = S.uid;
    stopQueue(true);
    cancelOutInvite(true);
    if (uid && S.cid && !S.isMaster) await D.remove('presence/' + uid).catch(() => {});
    await B.signOut();
  }
  window.addEventListener('beforeunload', () => { if (B.mode === 'demo' && S.uid && S.cid && !S.isMaster) D.remove('presence/' + S.uid); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="logout"]');
    if (a) logout();
  });

  /* ───────────── 학생 홈 ───────────── */
  function rankingOrder() {
    const ids = Object.keys(S.users);
    const placed = ids.filter((u) => (S.users[u].placed || 0) >= R.PLACEMENT_GAMES)
      .sort((a, b) => (a === S.champion ? -1 : b === S.champion ? 1 : S.users[b].score - S.users[a].score || (S.users[b].wins || 0) - (S.users[a].wins || 0)));
    const placing = ids.filter((u) => (S.users[u].placed || 0) < R.PLACEMENT_GAMES)
      .sort((a, b) => (S.users[b].placed || 0) - (S.users[a].placed || 0) || String(S.users[a].name).localeCompare(S.users[b].name));
    return { placed, placing };
  }

  function renderHome() {
    const me = S.users[S.uid];
    if (!me) return;
    const st = settings();
    const t = tierOfUid(S.uid);
    const placing = (me.placed || 0) < R.PLACEMENT_GAMES;
    const { placed, placing: plist } = rankingOrder();
    const myRank = placed.indexOf(S.uid) + 1;
    $('#home-me').innerHTML = `${nameTag(S.uid)}<span class="scoretxt muted">${esc(scoreText(S.uid))}</span>`;

    const gid = S.active[S.uid];
    $('#home-banner').innerHTML = gid
      ? `<div class="banner"><span style="font-size:1.6em">⚔️</span><div><b>참여할 경기가 있어요</b><div class="muted" style="color:#c9d4ff">진행 중이거나 선생님이 배정한 경기입니다.</div></div><button class="btn primary lg" data-act="rejoin">경기로 가기</button></div>`
      : '';

    // 프로필
    let prof;
    if (placing) {
      prof = `<div class="profile"><div class="big-emb">${emblem('placement')}</div><div class="info">
        <div class="muted">현재 티어</div><div class="tier-name tier-color-placement">배치고사 진행 중</div>
        <div class="muted">랭크전 <b style="color:var(--text)">${me.placed || 0}/${R.PLACEMENT_GAMES}</b>판 완료 — 5판을 모두 마치면 티어가 공개돼요.</div>
        <div class="progress"><i style="width:${((me.placed || 0) / R.PLACEMENT_GAMES) * 100}%"></i></div></div></div>`;
    } else {
      const real = R.tierOf(me.score);
      const idx = R.TIERS.indexOf(real);
      const next = R.TIERS[idx + 1];
      const wk = me.week && me.week.key === R.weekKey(B.now()) ? me.week.count : 0;
      prof = `<div class="profile"><div class="big-emb">${emblem(t.id)}</div><div class="info">
        <div class="muted">현재 티어${t.id === 'champion' ? ` <span class="pill">점수 티어: ${real.name}</span>` : ''}</div>
        <div class="tier-name tier-color-${t.id}">${esc(t.name)}</div>
        <div class="score"><b>${me.score}</b>점 · 전체 <b>${myRank}</b>위</div>
        <div class="stats"><span>승 <b>${me.wins || 0}</b></span><span>패 <b>${me.losses || 0}</b></span><span>무 <b>${me.draws || 0}</b></span>
        ${st.weeklyLimit > 0 ? `<span>이번 주 점수 반영 <b>${wk}/${st.weeklyLimit}</b></span>` : ''}</div>
        ${next ? `<div class="muted" style="margin-top:6px;font-size:.88em">${next.name}까지 ${next.min - me.score}점</div><div class="progress"><i style="width:${Math.max(4, Math.min(100, ((me.score - (real.min === -Infinity ? next.min - 100 : real.min)) / (next.min - (real.min === -Infinity ? next.min - 100 : real.min))) * 100))}%"></i></div>` : ''}
        </div></div>`;
    }
    const busy = !!gid;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-pref="${key}" data-val="${v}" class="${S.pref[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

    // 순위표
    const rankItems = placed.map((u, i) => `<li class="${u === S.uid ? 'me' : ''}"><span class="no">${i + 1}</span>${statusDot(u)}${nameTag(u)}<span class="sc">${S.users[u].score}</span></li>`).join('')
      + plist.map((u) => `<li class="${u === S.uid ? 'me' : ''}"><span class="no">-</span>${statusDot(u)}${nameTag(u)}<span class="sc muted" style="font-weight:500;font-size:.85em">배치 ${S.users[u].placed || 0}/5</span></li>`).join('');

    // 최근 기록
    const games = Object.entries(S.myGames).map(([k, v]) => Object.assign({ id: k }, v)).sort((a, b) => b.ts - a.ts).slice(0, 12);
    const histItems = games.map((h) => {
      const res = h.result === 'win' ? ['win', '승'] : h.result === 'loss' ? ['loss', '패'] : ['draw', '무'];
      let d = '';
      if (h.mode === 'rank') {
        if (h.placement) d = '<span class="delta muted">배치</span>';
        else if (!h.counted) d = '<span class="delta muted">연습</span>';
        else d = `<span class="delta ${h.delta > 0 ? 'up' : h.delta < 0 ? 'down' : ''}">${h.delta > 0 ? '+' : ''}${h.delta}</span>`;
      } else d = '<span class="delta muted">일반</span>';
      return `<li><span class="res ${res[0]}">${res[1]}</span>${h.opp === 'AI' ? nameTag('AI', '', { level: h.aiLevel }) : nameTag(h.opp)}<span class="muted" style="font-size:.85em;white-space:nowrap">${h.mode === 'rank' ? '랭크' : '일반'} · ${h.moves}수</span>${d}</li>`;
    }).join('');

    const lastSeason = Object.values(S.seasons || {}).sort((a, b) => b.endedAt - a.endedAt)[0];

    $('#home-main').innerHTML = `
      <div class="col">
        <div class="panel">${prof}</div>
        <div class="panel mode rank">
          <h2>🏆 랭크전</h2>
          <p class="sub">이기면 점수가 오르고 지면 내려가요. 빨리 이길수록 점수 변동이 커요.</p>
          <div class="mode-btns">
            <button class="mode-btn" data-act="random" ${busy ? 'disabled' : ''}><span class="ic">🎲</span><span class="t">랜덤 매치</span><span class="d">접속자 중 비슷한 티어와 자동 매칭<br>점수 변동 <b>큼</b> (×${st.multRandom})</span></button>
            <button class="mode-btn" data-act="select" ${busy ? 'disabled' : ''}><span class="ic">🤝</span><span class="t">1:1 선택 매치</span><span class="d">상대를 골라 대결 신청<br>점수 변동 <b>작음</b> (×${st.multSelect})</span></button>
          </div>
        </div>
        <div class="panel mode normal">
          <h2>🎮 일반전</h2>
          <p class="sub">점수 변동 없이 자유롭게 연습해요.</p>
          <div class="opt-row"><span class="lbl">AI 난이도</span>${seg('aiLevel', [['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']])}</div>
          <div class="opt-row"><span class="lbl">내 돌</span>${seg('aiColor', [['black', '⚫ 흑(먼저)'], ['white', '⚪ 백'], ['random', '랜덤']])}</div>
          <div class="mode-btns">
            <button class="mode-btn" data-act="ai" ${busy ? 'disabled' : ''}><span class="ic">🤖</span><span class="t">AI와 대전</span><span class="d">혼자 연습하기</span></button>
            <button class="mode-btn" data-act="friend" ${busy ? 'disabled' : ''}><span class="ic">👥</span><span class="t">친구와 대전</span><span class="d">접속한 친구에게 대결 신청</span></button>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="panel"><h3>📊 순위표 ${S.champion ? `<span class="muted">챔피언: ${esc(nameOf(S.champion))}</span>` : ''}</h3>
          ${lastSeason ? `<p class="muted" style="margin:-4px 0 10px;font-size:.86em">지난 시즌(${esc(lastSeason.name)}) 챔피언 👑 <b style="color:var(--c-champion)">${esc(lastSeason.championName || '-')}</b></p>` : ''}
          <ul class="rank-list">${rankItems || '<li class="empty">아직 등록된 학생이 없어요</li>'}</ul></div>
        <div class="panel"><h3>🕘 최근 경기</h3><ul class="hist">${histItems || '<li class="empty">아직 경기 기록이 없어요</li>'}</ul></div>
        <div class="panel rules"><h3>📘 렌주룰 요약</h3>
          <ul>
            <li><b>흑(먼저 둠)</b>은 <b>삼삼 · 사사 · 장목(6목 이상)</b> 자리에 둘 수 없어요. 두면 <b style="color:var(--bad)">반칙패</b>!</li>
            <li>흑은 정확히 5개일 때만 승리. (오목이 되는 수는 금수여도 승리)</li>
            <li><b>백</b>은 금수가 없고, 6목 이상도 승리로 인정돼요.</li>
            <li>랭크전 한 수 제한 시간 ${st.moveTimeRank}초 · 시간이 지나면 패배.</li>
            <li>점수 = 기본점수(짧게 이길수록 큼, 최대 40) ± 상대 점수차 보정</li>
          </ul></div>
      </div>`;
  }

  $('#scr-home').addEventListener('click', (e) => {
    const p = e.target.closest('[data-pref]');
    if (p) { S.pref[p.dataset.pref] = p.dataset.val; render(); return; }
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    const act = a.dataset.act;
    if (act === 'rejoin') { const g = S.active[S.uid]; if (g) { delete S.dismissed[g]; openGame(g); } }
    else if (act === 'random') startQueue();
    else if (act === 'select') pickOpponent('rank');
    else if (act === 'ai') startAI();
    else if (act === 'friend') pickOpponent('normal');
  });

  /* ───────────── 매칭 ───────────── */
  async function createPvp(a, b, mode, matchType, ready, gid) {
    const st = settings();
    gid = gid || B.newKey();
    const now = B.now();
    // 흑백 추첨 (암호학적 난수로 50:50)
    const coin = crypto.getRandomValues(new Uint32Array(1))[0] & 1;
    const [black, white] = coin ? [a, b] : [b, a];
    const pre = {};
    for (const u of [black, white]) pre[u] = { score: S.users[u].score, placed: S.users[u].placed || 0 };
    const g = {
      id: gid, mode, matchType, black, white, status: ready ? 'active' : 'waiting',
      ready: ready ? { [black]: true, [white]: true } : {}, moves: [], createdAt: now, turnStart: now,
      timeLimit: Number(mode === 'rank' ? st.moveTimeRank : st.moveTimeNormal) || 0, pre, by: S.uid,
    };
    await D.update('', {
      ['games/' + gid]: g, ['active/' + black]: gid, ['active/' + white]: gid,
      ['live/' + gid]: { black, white, mode, matchType, createdAt: now },
    });
    return gid;
  }

  async function startAI() {
    if (S.active[S.uid]) return toast('이미 참여 중인 경기가 있어요.');
    const color = S.pref.aiColor === 'random' ? (Math.random() < 0.5 ? 'black' : 'white') : S.pref.aiColor;
    const gid = B.newKey(), now = B.now();
    const black = color === 'black' ? S.uid : 'AI', white = color === 'black' ? 'AI' : S.uid;
    const g = { id: gid, mode: 'normal', matchType: 'ai', aiLevel: S.pref.aiLevel, black, white, status: 'active', ready: {}, moves: [], createdAt: now, turnStart: now, timeLimit: 0, pre: {}, by: S.uid };
    await D.update('', { ['games/' + gid]: g, ['active/' + S.uid]: gid, ['live/' + gid]: { black, white, mode: 'normal', matchType: 'ai', aiLevel: S.pref.aiLevel, createdAt: now } });
  }

  async function startQueue() {
    const me = S.users[S.uid];
    if (S.active[S.uid]) return toast('이미 참여 중인 경기가 있어요.');
    const st = settings();
    const wk = me.week && me.week.key === R.weekKey(B.now()) ? me.week.count : 0;
    if ((me.placed || 0) >= R.PLACEMENT_GAMES && st.weeklyLimit > 0 && wk >= st.weeklyLimit) {
      if (!(await confirmBox('이번 주 점수 반영 횟수 초과', `이번 주 랭크전 ${st.weeklyLimit}경기를 모두 했어요. 계속하면 <b>점수가 반영되지 않는 연습 경기</b>로 기록돼요.`, '그래도 매칭'))) return;
    }
    const now = B.now();
    await D.set('queue/' + S.uid, { uid: S.uid, score: me.score, since: now });
    S.pst = 'queue';
    heartbeat();
    const m = modal(`<div class="searching"><div class="rings"><i></i><i></i><i></i><span class="stone b"></span></div>
      <h3>상대를 찾는 중…</h3><p class="muted" id="q-info">비슷한 티어(±1)의 접속자를 우선으로 찾고 있어요.</p>
      <p style="font-size:1.4em;font-weight:800;font-variant-numeric:tabular-nums" id="q-time">0:00</p>
      <div class="foot" style="justify-content:center"><button class="btn ghost" data-close>매칭 취소</button></div></div>`,
      { dismissable: false, onClose: () => stopQueue(true) });
    S.queue = {
      since: now, modal: m,
      unsub: D.on('queue', (q) => { S.queueData = q || {}; tryMatch(); }),
      timer: setInterval(() => {
        const s = Math.floor((B.now() - now) / 1000);
        const el = $('#q-time');
        if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s > 20 && $('#q-info')) $('#q-info').textContent = '범위를 넓혀 모든 티어에서 찾고 있어요.';
        tryMatch();
      }, 1000),
    };
  }
  function stopQueue(removeEntry) {
    const q = S.queue;
    if (!q) return;
    S.queue = null;
    q.unsub && q.unsub();
    clearInterval(q.timer);
    q.modal && q.modal.close();
    if (removeEntry && S.uid) D.remove('queue/' + S.uid).catch(() => {});
    if (S.pst === 'queue') { S.pst = 'idle'; heartbeat(); }
  }
  let matching = false;
  async function tryMatch() {
    if (!S.queue || matching) return;
    const q = S.queueData || {};
    const mine = q[S.uid];
    const me = S.users[S.uid];
    if (!mine || !me) return;
    const now = B.now();
    if (mine.match) {
      // 매칭 후 경기가 만들어지지 않으면 다시 대기
      if (now - (mine.matchAt || 0) > 12000) D.tx('queue/' + S.uid, (c) => (c && c.match ? Object.assign(c, { match: null, matchAt: null }) : undefined));
      return;
    }
    const waited = now - mine.since;
    const myT = R.tierIndex(me.score);
    const last = (me.recentOpp || []).slice(-1)[0];
    let best = null;
    for (const [u, e] of Object.entries(q)) {
      if (u === S.uid || e.match || !isOnline(u) || S.active[u] || !S.users[u]) continue;
      const ou = S.users[u];
      const td = Math.abs(R.tierIndex(ou.score) - myT);
      if (td > 1 && waited < 20000) continue;
      const cost = Math.abs(ou.score - me.score) + td * 100 + (u === last ? 300 : 0);
      if (!best || cost < best.cost) best = { u, cost };
    }
    if (!best) return;
    matching = true;
    try {
      const gid = B.newKey();
      const r = await D.tx('queue', (qq) => {
        if (!qq || !qq[S.uid] || !qq[best.u] || qq[S.uid].match || qq[best.u].match) return undefined;
        qq[S.uid].match = gid; qq[best.u].match = gid;
        qq[S.uid].matchAt = qq[best.u].matchAt = B.now();
        return qq;
      });
      if (r.committed) {
        await createPvp(S.uid, best.u, 'rank', 'random', true, gid);
        await D.update('', { ['queue/' + S.uid]: null, ['queue/' + best.u]: null });
      }
    } catch (e) { console.warn(e); }
    matching = false;
  }

  function pickOpponent(kind) {
    const others = Object.keys(S.users).filter((u) => u !== S.uid)
      .sort((a, b) => ['idle', 'queue', 'game', 'off'].indexOf(status(a)) - ['idle', 'queue', 'game', 'off'].indexOf(status(b)) || String(S.users[a].name).localeCompare(S.users[b].name));
    const st = settings();
    const m = modal(`<h3>${kind === 'rank' ? '🤝 1:1 선택 매치 (랭크전)' : '👥 친구와 대전 (일반전)'}</h3>
      <p class="muted" style="margin-top:-4px">${kind === 'rank' ? `점수 변동 ×${st.multSelect} · 같은 상대와 ${st.sameOppStreak}연속째부터는 이겨도 점수 없음(진 사람만 하락)` : '점수 변동 없음'}</p>
      <div class="pick-list">${others.map((u) => {
        const s = status(u);
        return `<button class="pick-item" data-u="${u}" ${s !== 'idle' ? 'disabled' : ''}>${statusDot(u)}${nameTag(u)}<span class="st">${STATUS_KO[s]}</span></button>`;
      }).join('') || '<p class="empty">다른 학생이 없어요</p>'}</div>
      <div class="foot"><button class="btn ghost" data-close>닫기</button></div>`, { wide: true });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('.pick-item');
      if (!b || b.disabled) return;
      m.close();
      sendInvite(b.dataset.u, kind);
    });
  }

  async function sendInvite(to, kind) {
    if (S.active[S.uid]) return toast('이미 참여 중인 경기가 있어요.');
    const path = `invites/${to}/${S.uid}`;
    await D.set(path, { from: S.uid, kind, ts: B.now() });
    const m = modal(`<div class="searching"><div class="rings"><i></i><i></i><i></i><span class="stone w"></span></div>
      <h3>${esc(nameOf(to))}님에게 대결 신청 중…</h3><p class="muted">${kind === 'rank' ? '랭크전 1:1 선택 매치' : '일반전 친구 대전'} · 상대가 수락하면 바로 시작해요.</p>
      <div class="foot" style="justify-content:center"><button class="btn ghost" data-close>신청 취소</button></div></div>`,
      { dismissable: false, onClose: () => cancelOutInvite(true) });
    let seen = false;
    S.outInvite = {
      path, modal: m,
      unsub: D.on(path, (v) => {
        if (v) { seen = true; return; }
        if (!seen) return;
        const had = S.outInvite;
        cancelOutInvite(false);
        if (had && !S.active[S.uid]) toast('상대가 신청을 받지 않았어요.');
      }),
      timer: setTimeout(() => { cancelOutInvite(true); toast('응답이 없어 신청을 취소했어요.'); }, 45000),
    };
  }
  function cancelOutInvite(remove) {
    const o = S.outInvite;
    if (!o) return;
    S.outInvite = null;
    o.unsub && o.unsub();
    clearTimeout(o.timer);
    o.modal && o.modal.close();
    if (remove) D.remove(o.path).catch(() => {});
  }

  function onInvites(v) {
    S.invitesRaw = v;
    const now = B.now();
    const list = Object.entries(v).filter(([, x]) => x && now - x.ts < 60000);
    if (S.inviteModal && !v[S.inviteModal.from]) { S.inviteModal.m.close(); S.inviteModal = null; }
    if (S.inviteModal || !list.length || S.screen === 'game') return;
    const [from, inv] = list[0];
    const m = modal(`<h3>⚔️ 대결 신청이 왔어요!</h3>
      <p style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${nameTag(from, 'lg')}<span>님이 <b>${inv.kind === 'rank' ? '랭크전 (1:1 선택 매치)' : '일반전 (친구 대전)'}</b>을 신청했어요.</span></p>
      <div class="foot"><button class="btn ghost" data-no>거절</button><button class="btn primary lg" data-yes>수락하고 시작</button></div>`,
      { dismissable: false, onClose: () => { S.inviteModal = null; } });
    S.inviteModal = { from, m };
    m.el.querySelector('[data-no]').onclick = () => { m.close(); D.remove(`invites/${S.uid}/${from}`); };
    m.el.querySelector('[data-yes]').onclick = async () => {
      m.close();
      if (S.active[S.uid]) { toast('이미 참여 중인 경기가 있어요.'); return D.remove(`invites/${S.uid}/${from}`); }
      if (S.active[from]) { toast('상대가 이미 다른 경기 중이에요.'); return D.remove(`invites/${S.uid}/${from}`); }
      stopQueue(true);
      const rank = inv.kind === 'rank';
      await createPvp(from, S.uid, rank ? 'rank' : 'normal', rank ? 'select' : 'friend', true);
      await D.remove(`invites/${S.uid}/${from}`);
    };
  }

  function onActiveChange() {
    if (S.isMaster || !S.uid) return;
    const gid = S.active[S.uid];
    if (gid && !(S.game && S.game.gid === gid) && !S.dismissed[gid]) openGame(gid);
  }

  /* ───────────── 경기 ───────────── */
  const turnColor = (moves) => ((moves || []).length % 2 === 0 ? 1 : 2);
  const uidOfColor = (g, c) => (c === 1 ? g.black : g.white);
  const colorOf = (g, uid) => (g.black === uid ? 1 : g.white === uid ? 2 : 0);
  let boardView = null;

  function finishGame(g, winner, reason, detail) {
    g.status = 'finished';
    g.result = { winner: winner || null, reason, detail: detail || null, moves: (g.moves || []).length, at: B.now() };
  }

  async function playMove(gid, idx, asUid) {
    return D.tx('games/' + gid, (g) => {
      if (!g || g.status !== 'active') return undefined;
      const moves = g.moves || [];
      const color = turnColor(moves);
      if (uidOfColor(g, color) !== asUid) return undefined;
      const b = J.boardFromMoves(moves);
      if (b[idx] !== 0) return undefined;
      const ev = J.evaluateMove(b, idx, color);
      moves.push(idx);
      g.moves = moves;
      g.turnStart = B.now();
      if (ev.end === 'five') finishGame(g, asUid, 'five');
      else if (ev.end === 'foul') finishGame(g, uidOfColor(g, 2), 'foul', ev.reason);
      else if (moves.length >= J.N * J.N) finishGame(g, null, 'draw');
      return g;
    });
  }

  function openGame(gid, opts = {}) {
    closeGame();
    stopQueue(true);
    cancelOutInvite(false);
    if (S.inviteModal) { S.inviteModal.m.close(); S.inviteModal = null; }
    S.game = { gid, spectate: !!opts.spectate, data: null, ghost: -1, aiBusy: false, hideOverlay: false, numbers: false, claiming: false };
    if (!S.isMaster) { S.pst = 'game'; heartbeat(); }
    show('game');
    if (!boardView) boardView = new BoardView($('#g-board'), { interactive: true, labels: true, onTap: onBoardTap });
    boardView.set({ moves: [], win: [], forbidden: [], ghost: -1 });
    $('#g-num').classList.remove('on');
    S.game.unsub = D.on('games/' + gid, (g) => {
      if (!S.game || S.game.gid !== gid) return;
      S.game.data = g;
      onGameData();
    });
    S.game.tick = setInterval(gameTick, 250);
  }
  function closeGame() {
    const G = S.game;
    if (!G) return;
    G.unsub && G.unsub();
    clearInterval(G.tick);
    S.game = null;
    $('#g-overlay').classList.add('hidden');
  }
  function leaveGame() {
    const G = S.game;
    if (G && !G.spectate && G.data && ['active', 'waiting'].includes(G.data.status)) S.dismissed[G.gid] = true;
    closeGame();
    if (!S.isMaster) { S.pst = 'idle'; heartbeat(); }
    show(S.isMaster ? 'admin' : 'home');
    // 경기 중에 도착한 대결 신청을 다시 보여줌
    if (!S.isMaster && S.invitesRaw) onInvites(S.invitesRaw);
  }

  $('#g-back').addEventListener('click', async () => {
    const G = S.game;
    if (!G) return show(S.isMaster ? 'admin' : 'home');
    const g = G.data;
    if (!G.spectate && g && g.status === 'active') {
      if (g.matchType === 'ai') {
        if (!(await confirmBox('AI 대전 나가기', '진행 중인 AI 대전을 끝내고 나갈까요? (일반전이라 점수 변동은 없어요)', '나가기'))) return;
        await D.tx('games/' + g.id, (x) => (x && x.status === 'active' ? Object.assign(x, { status: 'cancelled', result: { reason: 'cancel', moves: (x.moves || []).length } }) : undefined));
        finalize(g.id);
      } else if (!(await confirmBox('경기에서 나가기', '경기 중에 나가면 제한 시간이 지나 <b>시간 초과 패배</b>가 될 수 있어요. 홈 화면의 「경기로 가기」로 다시 들어올 수 있어요.', '나가기'))) return;
    }
    leaveGame();
  });
  $('#g-num').addEventListener('click', () => {
    if (!S.game) return;
    S.game.numbers = !S.game.numbers;
    $('#g-num').classList.toggle('on', S.game.numbers);
    renderGame();
  });

  function onBoardTap(i) {
    const G = S.game;
    if (!G || G.spectate || !G.data) return;
    const g = G.data;
    if (g.status !== 'active') return;
    const my = colorOf(g, S.uid);
    const moves = g.moves || [];
    if (!my || turnColor(moves) !== my) return;
    if (J.boardFromMoves(moves)[i] !== 0) return;
    if (settings().confirmMove && G.ghost !== i) { G.ghost = i; renderGame(); return; }
    submitMove(i);
  }
  async function submitMove(i) {
    const G = S.game;
    if (!G || i < 0) return;
    G.ghost = -1;
    renderGame();
    try {
      const r = await playMove(G.gid, i, S.uid);
      if (!r.committed) toast('착수하지 못했어요. 다시 시도하세요.', 'bad');
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function resign() {
    const G = S.game;
    if (!G || !G.data) return;
    if (!(await confirmBox('기권', '정말 기권할까요? 기권하면 패배로 처리돼요.', '기권하기', true))) return;
    await D.tx('games/' + G.gid, (g) => {
      if (!g || g.status !== 'active') return undefined;
      const my = colorOf(g, S.uid);
      if (!my) return undefined;
      finishGame(g, uidOfColor(g, 3 - my), 'resign');
      return g;
    });
  }

  function onGameData() {
    const G = S.game;
    const g = G.data;
    if (!g) { toast('경기를 찾을 수 없어요.', 'bad'); leaveGame(); return; }
    const participant = !!colorOf(g, S.uid);
    if (g.status === 'waiting' && participant) {
      const ready = g.ready || {};
      if (ready[g.black] && ready[g.white]) {
        D.tx('games/' + g.id, (x) => {
          if (!x || x.status !== 'waiting') return undefined;
          const r = x.ready || {};
          if (!r[x.black] || !r[x.white]) return undefined;
          x.status = 'active';
          x.turnStart = B.now();
          return x;
        });
      }
    }
    if ((g.status === 'finished' || g.status === 'cancelled') && !g.scored && (participant || S.isMaster)) finalize(g.id);
    if (g.status === 'active') G.hideOverlay = false;
    // 대국 시작 시 흑백 추첨 결과를 잠깐 보여줌
    if (g.status === 'active' && participant && g.matchType !== 'ai' && !G.announced && !(g.moves || []).length) {
      G.announced = true;
      G.announceUntil = Date.now() + 2500;
      setTimeout(() => { if (S.game === G) renderGame(); }, 2600);
    }
    renderGame();
    maybeAIMove();
  }

  function maybeAIMove() {
    const G = S.game;
    if (!G || G.spectate || G.aiBusy) return;
    const g = G.data;
    if (!g || g.matchType !== 'ai' || g.status !== 'active') return;
    const moves = g.moves || [];
    if (uidOfColor(g, turnColor(moves)) !== 'AI' || !colorOf(g, S.uid)) return;
    G.aiBusy = true;
    const n = moves.length;
    setTimeout(async () => {
      try {
        if (!S.game || S.game !== G) return;
        const cur = G.data;
        if (!cur || cur.status !== 'active' || (cur.moves || []).length !== n) return;
        const i = window.OmokAI.pick(cur.moves || [], cur.aiLevel);
        await playMove(cur.id, i, 'AI');
      } catch (e) { console.warn(e); }
      finally { G.aiBusy = false; if (S.game === G) setTimeout(maybeAIMove, 50); }
    }, 420);
  }

  function gameTick() {
    const G = S.game;
    if (!G || !G.data) return;
    const g = G.data;
    const now = B.now();
    [1, 2].forEach((c) => {
      const card = $('#pc-' + c);
      const bar = card && card.querySelector('.timer');
      const tm = card && card.querySelector('.tm');
      if (!bar) return;
      const myTurn = g.status === 'active' && turnColor(g.moves) === c;
      if (!g.timeLimit || g.status !== 'active') { bar.style.visibility = 'hidden'; if (tm) tm.textContent = ''; return; }
      bar.style.visibility = myTurn ? 'visible' : 'hidden';
      if (!myTurn) { if (tm) tm.textContent = ''; return; }
      const remain = g.timeLimit * 1000 - (now - g.turnStart);
      const frac = Math.max(0, Math.min(1, remain / (g.timeLimit * 1000)));
      bar.firstElementChild.style.width = frac * 100 + '%';
      bar.className = 'timer' + (frac < 0.2 ? ' crit' : frac < 0.45 ? ' warn' : '');
      if (tm) tm.textContent = `⏱ ${Math.max(0, Math.ceil(remain / 1000))}초`;
    });
    // 시간 초과 판정 (참가자 또는 관리자 누구든 처리)
    if (g.status === 'active' && g.timeLimit > 0 && now - g.turnStart > g.timeLimit * 1000 + 1500 && !G.claiming && (colorOf(g, S.uid) || S.isMaster)) {
      G.claiming = true;
      D.tx('games/' + g.id, (x) => {
        if (!x || x.status !== 'active' || !(B.now() - x.turnStart > x.timeLimit * 1000 + 1500)) return undefined;
        const c = turnColor(x.moves);
        finishGame(x, uidOfColor(x, 3 - c), 'timeout');
        return x;
      }).finally(() => { G.claiming = false; });
    }
  }

  function modeTitle(g) {
    const m = g.mode === 'rank' ? '🏆 랭크전' : '🎮 일반전';
    const t = g.matchType === 'ai' ? `AI 대전 (${AI_NAMES[g.aiLevel]})` : MATCH_NAMES[g.matchType] || '';
    return `${m} · ${t}`;
  }

  function renderGame() {
    const G = S.game;
    if (!G) return;
    const g = G.data;
    if (!g) { $('#g-title').textContent = '불러오는 중…'; return; }
    const st = settings();
    const moves = g.moves || [];
    const my = colorOf(g, S.uid);
    const tc = turnColor(moves);
    const active = g.status === 'active';
    $('#g-title').innerHTML = `${G.spectate ? '<span class="spectate-tag">관전</span>' : ''}${esc(modeTitle(g))}`;
    $('#g-back').textContent = G.spectate ? '← 목록으로' : '← 나가기';

    [1, 2].forEach((c) => {
      const uid = uidOfColor(g, c);
      const card = $('#pc-' + c);
      card.classList.toggle('turn', active && tc === c);
      card.innerHTML = `<div class="row"><span class="stone ${c === 1 ? 'b' : 'w'}"></span>${nameTag(uid, '', { level: g.aiLevel })}${uid === S.uid ? '<span class="you">나</span>' : ''}</div>
        <div class="sub"><span>${c === 1 ? '흑 · 금수 있음' : '백'} · ${esc(scoreText(uid, g))}</span><span class="tm"></span></div>
        <div class="timer" style="visibility:hidden"><i></i></div>`;
    });

    // 금수 표시
    let forb = [];
    const showF = st.showForbidden === 'all' || (st.showForbidden === 'normal' && g.mode === 'normal');
    const board = J.boardFromMoves(moves);
    if (active && tc === 1 && showF && (my === 1 || G.spectate)) forb = J.forbiddenPoints(board);
    let win = [];
    if (g.status === 'finished' && g.result && g.result.reason === 'five' && moves.length) {
      win = J.winningLine(board, moves[moves.length - 1]);
    }
    boardView.set({ moves, win, forbidden: forb, ghost: active && my && tc === my ? G.ghost : -1, ghostColor: my || 1, numbers: G.numbers });

    // 상태
    const stEl = $('#g-status');
    stEl.classList.remove('warn');
    let html = '';
    if (g.status === 'waiting') {
      const r = g.ready || {};
      html = `준비 대기 중<span class="small">흑 ${r[g.black] ? '✅' : '⏳'} · 백 ${r[g.white] ? '✅' : '⏳'}</span>`;
    } else if (active) {
      if (G.spectate || !my) html = `${tc === 1 ? '⚫ 흑' : '⚪ 백'} 차례 · ${moves.length}수 진행`;
      else if (tc === my) {
        html = `내 차례예요!<span class="small">${moves.length}수 진행 · ${st.confirmMove ? '같은 자리를 한 번 더 누르거나 [착수]를 누르세요' : '놓을 자리를 누르세요'}</span>`;
        if (G.ghost >= 0 && my === 1) {
          const f = J.forbidden(board, G.ghost);
          if (f && showF) { stEl.classList.add('warn'); html = `⚠️ 금수 자리 — ${J.REASON_KO[f]}<span class="small">여기에 두면 반칙패가 돼요!</span>`; }
        }
      } else html = `상대 차례예요…<span class="small">${moves.length}수 진행 · ${esc(nameOf(uidOfColor(g, tc), g))} 생각 중</span>`;
    } else if (g.status === 'finished') {
      const r = g.result || {};
      html = r.winner ? `${esc(nameOf(r.winner, g))} 승리` : '무승부';
      html += `<span class="small">${REASON_NAMES[r.reason] || ''}${r.reason === 'foul' ? ` (${J.REASON_KO[r.detail] || ''})` : ''} · ${r.moves}수</span>`;
    } else if (g.status === 'cancelled') html = '취소된 경기';
    stEl.innerHTML = html;

    // 조작 버튼
    const ctl = $('#g-controls');
    let c = '';
    if (!G.spectate && my && active) {
      if (st.confirmMove) c += `<button class="btn primary place" data-g="place" ${tc === my && G.ghost >= 0 ? '' : 'disabled'}>착수</button>`;
      c += `<button class="btn danger" data-g="resign">기권</button>`;
    }
    if (G.spectate && (active || g.status === 'waiting')) c += `<button class="btn danger" data-g="cancel">경기 무효(취소)</button>`;
    if ((g.status === 'finished' || g.status === 'cancelled') && G.hideOverlay) c += `<button class="btn" data-g="showres">결과 보기</button>`;
    ctl.innerHTML = c;

    renderOverlay();
  }

  $('#g-controls').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-g]');
    if (!b || b.disabled || !S.game) return;
    const k = b.dataset.g;
    if (k === 'place') submitMove(S.game.ghost);
    else if (k === 'resign') resign();
    else if (k === 'showres') { S.game.hideOverlay = false; renderGame(); }
    else if (k === 'cancel') {
      if (!(await confirmBox('경기 무효', '이 경기를 취소할까요? 점수는 반영되지 않아요.', '경기 취소', true))) return;
      await cancelGame(S.game.gid);
    }
  });

  async function cancelGame(gid) {
    await D.tx('games/' + gid, (x) => (x && (x.status === 'active' || x.status === 'waiting') ? Object.assign(x, { status: 'cancelled', result: { reason: 'cancel', moves: (x.moves || []).length } }) : undefined));
    await finalize(gid);
  }

  function renderOverlay() {
    const G = S.game;
    const g = G.data;
    const ov = $('#g-overlay');
    const participant = !!colorOf(g, S.uid);
    if (g.status === 'active' && G.announceUntil && Date.now() < G.announceUntil) {
      const my = colorOf(g, S.uid);
      const opp = my === 1 ? g.white : g.black;
      ov.innerHTML = `<div class="ov-card reveal"><div class="muted">🎲 흑백 추첨 결과</div>
        <div style="display:flex;justify-content:center;margin:14px 0"><span class="stone ${my === 1 ? 'b' : 'w'}" style="width:64px;height:64px"></span></div>
        <h2 style="font-size:1.8em">나는 ${my === 1 ? '흑' : '백'}</h2>
        <div class="reason">${my === 1 ? '먼저 둡니다 · 삼삼·사사·장목 금수 주의!' : '두 번째로 둡니다 · 금수 없음'}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px">상대 ${nameTag(opp)} ${my === 1 ? '⚪ 백' : '⚫ 흑'}</div></div>`;
      ov.classList.remove('hidden');
      ov.onclick = () => { G.announceUntil = 0; ov.onclick = null; renderGame(); };
      return;
    }
    ov.onclick = null;
    if (g.status === 'waiting') {
      const r = g.ready || {};
      const meReady = r[S.uid];
      ov.innerHTML = `<div class="ov-card"><div style="font-size:2.2em">📋</div><h3 style="margin:.2em 0">${g.matchType === 'assigned' ? `${esc(S.masterName)}이(가) 배정한 경기` : '경기 준비'}</h3>
        <p class="muted">${esc(modeTitle(g))}</p>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:center;margin:14px 0">
          <div><span class="stone b sm"></span> ${nameTag(g.black)} ${r[g.black] ? '✅ 준비 완료' : '⏳ 대기'}</div>
          <div><span class="stone w sm"></span> ${nameTag(g.white)} ${r[g.white] ? '✅ 준비 완료' : '⏳ 대기'}</div>
        </div>
        ${participant && !meReady ? '<button class="btn primary lg" data-ov="ready">준비 완료!</button>' : participant ? '<p class="muted">상대가 준비하면 바로 시작해요.</p>' : ''}
      </div>`;
      ov.classList.remove('hidden');
      ov.querySelector('[data-ov="ready"]')?.addEventListener('click', () => D.set(`games/${g.id}/ready/${S.uid}`, true));
      return;
    }
    if (!(g.status === 'finished' || g.status === 'cancelled') || G.hideOverlay) { ov.classList.add('hidden'); return; }
    const r = g.result || {};
    let title = '', cls = '';
    if (g.status === 'cancelled') title = '경기 취소';
    else if (!r.winner) title = '무승부';
    else if (participant) { title = r.winner === S.uid ? '승리!' : '패배'; cls = r.winner === S.uid ? 'win' : 'loss'; }
    else title = `${nameOf(r.winner, g)} 승리`;
    let reason = '';
    if (g.status === 'finished') {
      if (r.reason === 'five') reason = `${r.winner === g.black ? '흑' : '백'} 오목 완성 · 총 ${r.moves}수`;
      else if (r.reason === 'foul') reason = `흑 금수 반칙패 — ${J.REASON_KO[r.detail] || ''} · ${r.moves}수`;
      else if (r.reason === 'resign') reason = `기권 · ${r.moves}수`;
      else if (r.reason === 'timeout') reason = `시간 초과 · ${r.moves}수`;
      else if (r.reason === 'draw') reason = '판이 가득 찼어요';
    }
    let box = '';
    if (g.status === 'finished' && g.mode === 'rank') {
      const D = g.deltas;
      if (!D) box = '<div class="score-box muted">점수 계산 중…</div>';
      else if (participant) box = scoreBox(D[S.uid]);
      else box = [g.black, g.white].map((u) => `<div class="score-box" style="text-align:left">${nameTag(u)} ${deltaLine(D[u], true)}</div>`).join('');
    } else if (g.status === 'finished') box = '<div class="score-box muted">일반전 — 점수 변동 없음</div>';

    const btns = [`<button class="btn ghost" data-ov="board">판 보기</button>`];
    if (G.spectate) btns.push('<button class="btn primary" data-ov="home">목록으로</button>');
    else {
      if (g.matchType === 'ai') btns.push('<button class="btn good" data-ov="again">다시 하기</button>');
      btns.push('<button class="btn primary" data-ov="home">홈으로</button>');
    }
    ov.innerHTML = `<div class="ov-card"><h2 class="${cls}">${esc(title)}</h2><div class="reason">${esc(reason)}</div>${box}<div class="btns">${btns.join('')}</div></div>`;
    ov.classList.remove('hidden');
    ov.querySelector('[data-ov="board"]').onclick = () => { G.hideOverlay = true; renderGame(); };
    ov.querySelector('[data-ov="home"]').onclick = () => leaveGame();
    const ag = ov.querySelector('[data-ov="again"]');
    if (ag) ag.onclick = () => { S.pref.aiLevel = g.aiLevel; leaveGame(); startAI(); };
  }

  function deltaLine(d, withNote) {
    if (!d) return '';
    if (d.placement) return `<span class="muted"> 배치고사 ${d.post ? d.post.placed : ''}/5</span>${S.isMaster ? ` <b>${d.delta > 0 ? '+' : ''}${d.delta}</b>` : ''}`;
    const cls = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
    return ` <b class="delta ${cls}">${d.delta > 0 ? '+' : ''}${d.delta}점</b>${withNote && d.note ? `<div class="muted" style="font-size:.8em">${esc(d.note)}</div>` : ''}`;
  }
  function scoreBox(d) {
    if (!d) return '';
    const post = d.post || {}, pre = d.pre || {};
    if (d.placement) {
      if ((post.placed || 0) >= R.PLACEMENT_GAMES) {
        const u = S.users[S.uid];
        const t = R.displayTier(u || { score: post.score, placed: 5 }, S.champion, S.uid);
        return `<div class="score-box"><div class="muted">배치고사 완료!</div><div class="reveal">${emblem(t.id)}</div>
          <div class="tier-name tier-color-${t.id}" style="font-size:1.6em;font-weight:800">${esc(t.name)}</div>
          <div>시작 점수 <b>${post.score}</b>점</div></div>`;
      }
      return `<div class="score-box"><div class="muted">배치고사</div><div class="big">${post.placed || 0} / ${R.PLACEMENT_GAMES}</div>
        <div class="formula">5판을 모두 마치면 티어와 점수가 공개돼요.</div></div>`;
    }
    const cls = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
    const tb = R.tierOf(pre.score || 0), ta = R.tierOf(post.score || 0);
    const change = tb !== ta ? (R.TIERS.indexOf(ta) > R.TIERS.indexOf(tb) ? `<div style="margin-top:8px;font-weight:800;color:var(--good)">🎉 ${ta.name} 승급!</div>` : `<div style="margin-top:8px;font-weight:700;color:var(--bad)">${ta.name}(으)로 강등</div>`) : '';
    const det = d.detail ? `기본 ${d.detail.B} ${d.detail.C >= 0 ? '+' : '−'} 보정 ${Math.abs(d.detail.C)}${d.detail.mult !== 1 ? ` × ${d.detail.mult}` : ''}` : '';
    return `<div class="score-box"><div class="big delta ${cls}" style="margin:0">${d.delta > 0 ? '+' : ''}${d.delta}점</div>
      <div>${pre.score ?? ''} → <b>${post.score ?? ''}</b>점</div>
      ${det ? `<div class="formula">${det}</div>` : ''}${d.note ? `<div class="formula" style="color:var(--warn)">${esc(d.note)}</div>` : ''}${change}</div>`;
  }

  /* ───────────── 결과 반영 (한 번만 실행) ───────────── */
  const finalizing = new Set();
  async function finalize(gid) {
    if (finalizing.has(gid)) return;
    finalizing.add(gid);
    try {
      const r = await D.tx(`games/${gid}/scored`, (cur) => (cur ? undefined : true));
      if (!r.committed) return;
      const g = await D.get('games/' + gid);
      if (!g) return;
      const humans = [g.black, g.white].filter((u) => u && u !== 'AI');
      for (const u of humans) await D.tx('active/' + u, (cur) => (cur === gid ? null : undefined));
      await D.remove('live/' + gid);
      if (g.status === 'cancelled') return;
      const now = B.now();
      const res = g.result || {};
      const winner = res.winner || null;
      const upd = {};
      let info = null;
      if (g.mode === 'rank' && humans.length === 2) {
        const users = { [g.black]: await D.get('users/' + g.black), [g.white]: await D.get('users/' + g.white) };
        if (users[g.black] && users[g.white]) {
          info = R.computeRank(g, users, settings(), now);
          for (const u of humans) {
            const opp = u === g.black ? g.white : g.black;
            const t = await D.tx('users/' + u, (cur) => (cur ? R.applyToUser(cur, info[u], winner === u, !winner, opp, now) : undefined));
            const nu = t.value || {};
            info[u].pre = { score: users[u].score, placed: users[u].placed || 0 };
            info[u].post = { score: nu.score, placed: nu.placed || 0 };
          }
          upd[`games/${gid}/deltas`] = info;
        }
      } else {
        for (const u of humans) {
          await D.tx('users/' + u, (cur) => {
            if (!cur) return undefined;
            cur.nGames = (cur.nGames || 0) + 1;
            if (winner === u) cur.nWins = (cur.nWins || 0) + 1;
            else if (winner) cur.nLosses = (cur.nLosses || 0) + 1;
            return cur;
          });
        }
      }
      for (const u of humans) {
        const opp = u === g.black ? g.white : g.black;
        const d = info && info[u];
        upd[`userGames/${u}/${gid}`] = {
          ts: now, mode: g.mode, matchType: g.matchType, opp, color: u === g.black ? 1 : 2,
          result: !winner ? 'draw' : winner === u ? 'win' : 'loss', reason: res.reason || '', moves: res.moves || 0,
          aiLevel: g.aiLevel || '', delta: d ? d.delta : 0, counted: d ? d.counted : false, placement: d ? d.placement : false, note: d ? d.note : '',
        };
      }
      const log = { ts: now, mode: g.mode, matchType: g.matchType, black: g.black, white: g.white, winner: winner || '', reason: res.reason || '', detail: res.detail || '', moves: res.moves || 0, aiLevel: g.aiLevel || '' };
      if (info) {
        log.deltas = {};
        for (const u of humans) log.deltas[u] = { delta: info[u].delta, counted: info[u].counted, placement: info[u].placement, post: info[u].post.score };
      }
      upd['log/' + gid] = log;
      await D.update('', upd);
    } catch (e) {
      console.error('finalize', e);
    } finally {
      finalizing.delete(gid);
    }
  }

  window.App = {
    S, B, D, R, J, $, $$, esc, enterClass, accountKey, CODE_RE, ID_RE, emblem, nameTag, nameOf, scoreText, status, statusDot, STATUS_KO, isOnline, toast, modal, confirmBox,
    settings, fmtTime, render, show, openGame, createPvp, cancelGame, finalize, rankingOrder, tierOfUid, logout,
    AI_NAMES, MATCH_NAMES, REASON_NAMES,
  };
  window.addEventListener('DOMContentLoaded', boot);
})();
