/* 관리자(master) 화면: 실시간 경기, 매치 배정, 학생 관리, 순위표, 경기 기록, 설정 */
(function () {
  const A = window.App;
  const { S, B, D, R, $, esc, nameTag, nameOf, emblem, toast, modal, confirmBox, status, statusDot, STATUS_KO } = A;
  const MAX_STUDENTS = 25;
  let tab = 'live';
  let subs = [];
  let live = {}, log = {}, secrets = {}, queue = {};
  const minis = new Map();
  const sel = new Set();
  let preview = null; // {pairs, leftover, mode}
  let classBarKey = '';
  const counts = {}; // 반별 학생 수 (총관리자 화면)

  const main = () => $('#admin-main');
  const setTab = (t) => {
    tab = t;
    $$('#admin-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  };

  const Admin = {
    // 로그인 직후 한 번
    boot() {
      $$('.super-only').forEach((b) => b.classList.toggle('hidden', !S.isSuper));
      $('#admin-role').textContent = S.isSuper ? '총관리자' : '반 관리자';
      classBarKey = '';
      setTab(S.isSuper && !S.cid ? 'classes' : 'live');
      main().dataset.tab = '';
      A.render();
    },
    // 반에 들어갈 때마다
    enter() {
      live = {}; log = {}; secrets = {}; queue = {};
      sel.clear();
      preview = null;
      if (tab === 'classes' && !S.isSuper) setTab('live');
      main().dataset.tab = '';
      subs.push(D.on('live', (v) => { live = v || {}; A.render(); }));
      subs.push(D.on('log', (v) => { log = v || {}; if (tab === 'log') A.render(); }));
      subs.push(D.on('secrets', (v) => { secrets = v || {}; if (tab === 'students') A.render(); }));
      subs.push(D.on('queue', (v) => { queue = v || {}; }));
    },
    leave() {
      subs.forEach((u) => u());
      subs = [];
      live = {};
      clearMinis();
      main().dataset.tab = '';
      main().innerHTML = '';
    },
    render() {
      renderClassBar();
      const n = Object.keys(live).length;
      const lb = $('#admin-tabs [data-tab="live"]');
      lb.innerHTML = `실시간 경기${n ? `<span class="cnt">${n}</span>` : ''}`;
      // 반을 고르기 전에는 반 관리 탭만 사용
      $$('#admin-tabs button').forEach((b) => { if (b.dataset.tab !== 'classes') b.disabled = !S.cid; });
      if (!S.cid && tab !== 'classes') setTab(S.isSuper ? 'classes' : 'live');
      if (!S.cid && tab !== 'classes') { main().innerHTML = '<p class="empty">반 정보를 불러오는 중…</p>'; main().dataset.tab = ''; return; }
      if (main().dataset.tab !== tab) {
        clearMinis();
        main().dataset.tab = tab;
        main().dataset.key = '';
        SKELETON[tab]();
      }
      RENDER[tab]();
    },
  };
  function $$(s, r = document) { return [...r.querySelectorAll(s)]; }

  $('#admin-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.disabled) return;
    setTab(b.dataset.tab);
    A.render();
  });

  // 상단: 현재 반 표시 (총관리자는 반 선택)
  function renderClassBar() {
    const el = $('#admin-class');
    const list = S.classList || {};
    const key = JSON.stringify([S.isSuper, S.cid, S.classMeta && S.classMeta.name, Object.entries(list).map(([k, v]) => k + v.name)]);
    if (key === classBarKey) return;
    classBarKey = key;
    const meta = S.classMeta || {};
    if (S.isSuper) {
      const opts = Object.entries(list).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([cid, c]) => `<option value="${esc(cid)}" ${cid === S.cid ? 'selected' : ''}>${esc(c.name)} (${esc(cid)})</option>`).join('');
      el.innerHTML = `<select id="cls-sel"><option value="">— 반 선택 —</option>${opts}</select>`;
      $('#cls-sel').onchange = (e) => { setTab(e.target.value ? 'live' : 'classes'); A.enterClass(e.target.value || null); };
    } else {
      el.innerHTML = S.cid ? `<span class="cls">${esc(meta.name || '')}</span><span class="code" title="학생 로그인 시 입력하는 반 코드">반 코드 ${esc(S.cid)}</span>` : '';
    }
  }

  /* ───────────── 반 관리 (총관리자) ───────────── */
  const SKELETON = {}, RENDER = {};
  SKELETON.classes = () => {
    main().innerHTML = `<div class="a-head"><h2>반 관리</h2><span class="muted" id="cl-cnt"></span></div>
      <div class="two-col">
        <div class="tbl-wrap" id="cl-table"></div>
        <div class="col" style="gap:18px">
          <div class="panel"><h3>가입 코드</h3>
            <p class="muted" style="margin-top:0;font-size:.88em;line-height:1.55">선생님이 로그인 화면의 <b>「선생님: 새 반 만들기」</b>에서 이 코드를 입력하면 새 반과 반 관리자 계정이 만들어져요.
            코드를 바꾸면 이전 코드로는 더 이상 가입할 수 없어요. (이미 만든 반은 그대로)</p>
            <label>가입 코드<input id="jc" autocapitalize="none" spellcheck="false" placeholder="아직 정하지 않음 — 정하기 전에는 아무도 반을 만들 수 없어요"></label>
            <div class="foot"><button class="btn ghost" id="jc-gen">무작위 생성</button><button class="btn primary" id="jc-save">저장</button></div></div>
          <div class="panel"><h3>동시 사용 한도</h3>
            <p class="muted" style="margin:0;font-size:.88em;line-height:1.55">Firebase 무료 요금제는 <b>동시 접속 100명</b>까지예요. 25명 반이면 <b>4개 반까지 동시에</b> 수업할 수 있어요.
            수업 시간이 겹치는 반이 더 많아지면 Firebase를 종량제(Blaze)로 바꿔야 해요.</p></div>
          <div class="panel hidden" id="legacy"><h3>이전 버전 데이터</h3>
            <p class="muted" style="margin-top:0;font-size:.88em;line-height:1.55" id="legacy-info"></p>
            <div class="foot"><button class="btn danger" id="legacy-go">이전 데이터 정리</button></div></div>
        </div>
      </div>`;
    B.get('config/joinCode').then((v) => { if ($('#jc')) $('#jc').value = v || ''; }).catch(() => {});
    $('#jc-gen').onclick = () => {
      const a = 'abcdefghjkmnpqrstuvwxyz23456789';
      $('#jc').value = Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => a[n % a.length]).join('');
    };
    $('#jc-save').onclick = async () => {
      const v = $('#jc').value.trim();
      if (v.length < 4) return toast('가입 코드는 4자 이상으로 정하세요.', 'bad');
      await B.set('config/joinCode', v);
      toast('가입 코드를 저장했어요. 새 반을 만들 선생님에게 알려 주세요.', 'good');
    };
    $('#cl-table').addEventListener('click', onClassAction);
    // 이전 버전(반 구분 없던 시절) 데이터가 남아 있는지 확인
    B.get('users').then((u) => {
      const n = Object.keys(u || {}).length;
      if (!$('#legacy')) return;
      $('#legacy').classList.toggle('hidden', !n);
      $('#legacy-info').innerHTML = `반 기능이 생기기 전에 만든 학생 <b>${n}명</b>과 그 경기 기록이 남아 있어요. 새 구조에서는 쓰이지 않아요.<br>정리하면 이 학생 계정과 기록이 <b>영구 삭제</b>돼요. (총관리자 계정은 유지)`;
    }).catch(() => {});
    $('#legacy-go').onclick = cleanupLegacy;
    refreshCounts();
  };
  const counting = new Set();
  // 반별 학생 수: 탭을 열 때 전부, 이후에는 20초 지난 것만 다시 셈
  function refreshCounts(onlyStale) {
    const now = Date.now();
    for (const cid of Object.keys(S.classList || {})) {
      if (counting.has(cid) || (onlyStale && counts[cid] && now - counts[cid].at < 20000)) continue;
      counting.add(cid);
      B.get(`classes/${cid}/users`).finally(() => counting.delete(cid))
        .then((u) => { counts[cid] = { n: Object.keys(u || {}).length, at: Date.now() }; }, () => { counts[cid] = { n: '?', at: Date.now() }; })
        .then(() => { if (tab === 'classes' && $('#cl-table')) RENDER.classes(); });
    }
  }
  RENDER.classes = () => {
    const list = Object.entries(S.classList || {}).sort((a, b) => a[0].localeCompare(b[0]));
    refreshCounts(true);
    $('#cl-cnt').textContent = `${list.length}개 반`;
    $('#cl-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>반 코드</th><th>반 이름</th><th>담당 선생님</th><th class="num">학생</th><th>만든 날</th><th></th></tr></thead><tbody>
      ${list.map(([cid, c]) => `<tr${cid === S.cid ? ' style="background:rgba(70,89,62,.12)"' : ''}><td><span class="code-big">${esc(cid)}</span></td><td><b>${esc(c.name)}</b></td><td>${esc(c.teacherName || '')}</td>
        <td class="num">${counts[cid] ? counts[cid].n : '…'} / ${MAX_STUDENTS}</td><td>${c.createdAt ? A.fmtTime(c.createdAt) : ''}</td>
        <td><div class="row-actions"><button class="btn xs primary" data-c="open" data-cid="${esc(cid)}">관리하기</button><button class="btn xs danger" data-c="del" data-cid="${esc(cid)}">반 삭제</button></div></td></tr>`).join('')}
      </tbody></table>` : `<p class="empty" style="padding:30px;line-height:1.7">아직 만들어진 반이 없어요.<br>오른쪽에서 <b>가입 코드</b>를 정해 선생님에게 알려 주세요.</p>`;
  };
  async function onClassAction(e) {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const cid = b.dataset.cid;
    const c = (S.classList || {})[cid] || {};
    if (b.dataset.c === 'open') { setTab('live'); await A.enterClass(cid); return; }
    if (!(await confirmBox('반 삭제', `<b>${esc(c.name)}</b> (반 코드 ${esc(cid)})을 삭제할까요?<br>이 반의 <b>학생 계정·점수·경기 기록이 모두 영구 삭제</b>되고 되돌릴 수 없어요.`, '반 삭제', true))) return;
    try {
      const users = (await B.get(`classes/${cid}/users`)) || {};
      const secs = (await B.get(`classes/${cid}/secrets`)) || {};
      const meta = (await B.get(`classes/${cid}/meta`)) || {};
      for (const [uid, u] of Object.entries(users)) {
        try { await B.deleteAccount(A.accountKey(cid, u.loginId), secs[uid] && secs[uid].pw); } catch (err) { console.warn('계정 삭제 실패', uid, err); }
      }
      const upd = { [`classes/${cid}`]: null, [`classList/${cid}`]: null };
      for (const uid of Object.keys(users)) upd['members/' + uid] = null;
      if (meta.owner) upd['members/' + meta.owner] = null;
      await B.update('', upd);
      delete counts[cid];
      if (S.cid === cid) await A.enterClass(null);
      toast('반을 삭제했어요.', 'good');
    } catch (err) { toast(err.message, 'bad'); }
  }
  async function cleanupLegacy() {
    if (!(await confirmBox('이전 데이터 정리', '반 기능 이전에 만든 학생 계정과 경기 기록을 <b>영구 삭제</b>할까요? 되돌릴 수 없어요.', '정리하기', true))) return;
    try {
      const users = (await B.get('users')) || {};
      const secs = (await B.get('secrets')) || {};
      for (const [uid, u] of Object.entries(users)) {
        try { await B.deleteAccount(u.loginId, secs[uid] && secs[uid].pw); } catch (err) { console.warn('계정 삭제 실패', uid, err); }
      }
      const upd = {};
      for (const k of ['users', 'secrets', 'presence', 'queue', 'invites', 'active', 'games', 'live', 'userGames', 'log', 'seasons', 'config/settings']) upd[k] = null;
      await B.update('', upd);
      $('#legacy').classList.add('hidden');
      toast('이전 데이터를 정리했어요.', 'good');
    } catch (err) { toast(err.message, 'bad'); }
  }

  function clearMinis() {
    for (const m of minis.values()) { m.unsub(); m.view.destroy(); }
    minis.clear();
  }

  /* ───────────── 실시간 경기 ───────────── */
  SKELETON.live = () => {
    main().innerHTML = `<div class="a-head"><h2>실시간 경기</h2><span class="muted" id="live-sum"></span><span class="sp"></span>
      <span class="muted" style="font-size:.9em">카드를 누르면 큰 화면으로 볼 수 있어요</span></div>
      <div class="live-grid" id="live-grid"></div>
      <div id="live-empty" class="panel empty hidden" style="padding:40px">진행 중인 경기가 없어요. 「매치 배정」에서 경기를 만들 수 있어요.</div>
      <div class="panel" style="margin-top:18px"><h3>접속 현황</h3><div id="live-online" class="stu-pick"></div></div>`;
  };
  RENDER.live = () => {
    const gids = Object.keys(live).sort((a, b) => (live[b].createdAt || 0) - (live[a].createdAt || 0));
    const key = gids.join(',');
    const grid = $('#live-grid');
    if (main().dataset.key !== key) {
      main().dataset.key = key;
      clearMinis();
      grid.innerHTML = gids.map((g) => `<div class="live-card" data-gid="${g}"><canvas></canvas><div class="vs"></div><div class="meta"></div></div>`).join('');
      for (const gid of gids) {
        const card = grid.querySelector(`[data-gid="${gid}"]`);
        const view = new BoardView(card.querySelector('canvas'), { mini: true });
        const m = { view, data: null, card };
        m.unsub = D.on('games/' + gid, (g) => { m.data = g; paintMini(m); });
        minis.set(gid, m);
      }
    }
    for (const m of minis.values()) paintMini(m);
    $('#live-empty').classList.toggle('hidden', gids.length > 0);
    const act = gids.filter((g) => minis.get(g) && minis.get(g).data && minis.get(g).data.status === 'active').length;
    $('#live-sum').textContent = gids.length ? `진행 ${act} · 대기 ${gids.length - act}` : '';
    const ids = Object.keys(S.users).sort((a, b) => ['game', 'queue', 'idle', 'off'].indexOf(status(a)) - ['game', 'queue', 'idle', 'off'].indexOf(status(b)) || String(S.users[a].name).localeCompare(S.users[b].name));
    $('#live-online').innerHTML = ids.map((u) => `<label class="${status(u) === 'off' ? 'dis' : ''}">${statusDot(u)}${nameTag(u)}<span class="st">${STATUS_KO[status(u)]}</span></label>`).join('') || '<p class="empty">등록된 학생이 없어요</p>';
  };
  function paintMini(m) {
    const g = m.data;
    if (!g) return;
    m.view.set({ moves: g.moves || [] });
    const moves = (g.moves || []).length;
    const turn = moves % 2 === 0 ? 1 : 2;
    const title = g.mode === 'rank' ? '🏆 랭크' : '🎮 일반';
    const type = g.matchType === 'ai' ? `AI ${A.AI_NAMES[g.aiLevel] || ''}` : A.MATCH_NAMES[g.matchType];
    m.card.querySelector('.vs').innerHTML = `
      <div class="row"><span class="stone b sm"></span>${nameTag(g.black, '', { level: g.aiLevel })}${g.status === 'active' && turn === 1 ? ' <span class="pill">차례</span>' : ''}</div>
      <div class="row"><span class="stone w sm"></span>${nameTag(g.white, '', { level: g.aiLevel })}${g.status === 'active' && turn === 2 ? ' <span class="pill">차례</span>' : ''}</div>`;
    const stTxt = g.status === 'waiting' ? '⏳ 준비 대기' : g.status === 'active' ? `${moves}수 진행` : g.status === 'finished' ? '종료' : '취소';
    m.card.querySelector('.meta').innerHTML = `<span>${title} · ${esc(type)}</span><span>${stTxt}</span>`;
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest('.live-card');
    if (c && S.isMaster) A.openGame(c.dataset.gid, { spectate: true });
  });

  /* ───────────── 매치 배정 ───────────── */
  SKELETON.match = () => {
    main().innerHTML = `<div class="a-head"><h2>매치 배정</h2><span class="sp"></span>
      <button class="btn sm ghost" data-m="all">접속자 전체 선택</button><button class="btn sm ghost" data-m="none">선택 해제</button></div>
      <div class="two-col">
        <div class="panel"><h3>학생 선택 <span class="muted" id="m-cnt"></span></h3><div class="stu-pick" id="m-pick"></div></div>
        <div class="col" style="gap:18px">
          <div class="panel"><h3>경기 종류</h3>
            <div class="seg" id="m-mode"><button data-v="rank" class="on">🏆 랭크전</button><button data-v="normal">🎮 일반전</button></div>
            <p class="muted" style="font-size:.88em;line-height:1.5">선생님 배정 랭크전은 점수 배율 ×<span id="m-mult"></span> 로 반영돼요.<br>배정된 학생 화면에 경기 준비 창이 뜨고, 두 명 모두 「준비 완료」를 누르면 시작해요.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
              <button class="btn primary" data-m="pair">선택한 2명 경기 만들기</button>
              <button class="btn good" data-m="random">🎲 랜덤 매치 편성</button>
            </div>
            <p class="muted" style="font-size:.84em;margin-top:10px">랜덤 매치: 2명 이상 선택하면 선택한 학생끼리, 아무도 선택하지 않으면 <b>접속 중이고 경기 중이 아닌</b> 학생 전체를 ±1티어 우선으로 짝지어요.</p>
          </div>
          <div class="panel" id="m-preview-wrap"><h3>편성 미리보기</h3><div id="m-preview"><p class="empty">랜덤 매치 편성을 누르면 여기에 짝이 표시돼요.</p></div></div>
        </div>
      </div>`;
    const seg = $('#m-mode');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('#m-mode button').forEach((x) => x.classList.toggle('on', x === b));
      if (preview) { preview.mode = b.dataset.v; RENDER.match(); }
    });
    $('#m-pick').addEventListener('change', (e) => {
      const cb = e.target;
      if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
      RENDER.match();
    });
  };
  const matchMode = () => ($('#m-mode .on') || {}).dataset?.v || 'rank';
  RENDER.match = () => {
    const ids = Object.keys(S.users).sort((a, b) => ['idle', 'queue', 'off', 'game'].indexOf(status(a)) - ['idle', 'queue', 'off', 'game'].indexOf(status(b)) || String(S.users[a].name).localeCompare(S.users[b].name));
    for (const u of [...sel]) if (!S.users[u] || status(u) === 'game') sel.delete(u);
    $('#m-pick').innerHTML = ids.map((u) => {
      const s = status(u);
      return `<label class="${sel.has(u) ? 'sel' : ''} ${s === 'game' ? 'dis' : ''}"><input type="checkbox" value="${u}" ${sel.has(u) ? 'checked' : ''} ${s === 'game' ? 'disabled' : ''}>${statusDot(u)}${nameTag(u)}<span class="st">${STATUS_KO[s]}</span></label>`;
    }).join('') || '<p class="empty">먼저 「학생 관리」에서 학생을 등록하세요.</p>';
    $('#m-cnt').textContent = sel.size ? `${sel.size}명 선택` : '';
    $('#m-mult').textContent = A.settings().multAssigned;
    const pv = $('#m-preview');
    if (!preview) return;
    pv.innerHTML = `<div class="pairs">${preview.pairs.map(([a, b]) => `<div class="p">${nameTag(a)}<span class="muted">${esc(A.scoreText(a))}</span><span class="vsx">VS</span>${nameTag(b)}<span class="muted">${esc(A.scoreText(b))}</span></div>`).join('')}</div>
      ${preview.leftover.length ? `<p class="muted">짝이 없는 학생: ${preview.leftover.map((u) => esc(nameOf(u))).join(', ')}</p>` : ''}
      <div class="foot"><button class="btn ghost" data-m="reshuffle">다시 섞기</button><button class="btn primary" data-m="confirm">${preview.pairs.length}경기 확정 (${preview.mode === 'rank' ? '랭크전' : '일반전'})</button></div>`;
  };

  function pairUp(uids) {
    const arr = uids.map((u) => ({ u, k: S.users[u].score + (Math.random() - 0.5) * 80, t: R.tierIndex(S.users[u].score) }))
      .sort((a, b) => b.k - a.k);
    const used = new Set(), pairs = [];
    for (let i = 0; i < arr.length; i++) {
      if (used.has(arr[i].u)) continue;
      const a = arr[i];
      const last = (S.users[a.u].recentOpp || []).slice(-1)[0];
      let pick = -1, fallback = -1;
      for (let j = i + 1; j < arr.length; j++) {
        if (used.has(arr[j].u)) continue;
        if (fallback < 0) fallback = j;
        if (Math.abs(arr[j].t - a.t) <= 1 && arr[j].u !== last) { pick = j; break; }
      }
      if (pick < 0) pick = fallback;
      if (pick < 0) continue;
      used.add(a.u); used.add(arr[pick].u);
      pairs.push([a.u, arr[pick].u]);
    }
    return { pairs, leftover: uids.filter((u) => !used.has(u)) };
  }

  main().addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const k = b.dataset.m;
    if (k === 'all') { Object.keys(S.users).forEach((u) => { if (['idle', 'queue'].includes(status(u))) sel.add(u); }); RENDER.match(); }
    else if (k === 'none') { sel.clear(); RENDER.match(); }
    else if (k === 'pair') {
      if (sel.size !== 2) return toast('정확히 2명을 선택하세요.', 'bad');
      const [a, c] = [...sel];
      await makeGames([[a, c]], matchMode());
      sel.clear();
      RENDER.match();
    } else if (k === 'random' || k === 'reshuffle') {
      let c = sel.size >= 2 ? [...sel] : Object.keys(S.users).filter((u) => ['idle', 'queue'].includes(status(u)));
      c = c.filter((u) => status(u) !== 'game');
      if (c.length < 2) return toast('짝을 지을 학생이 2명 이상 필요해요. (접속 중인 학생 기준)', 'bad');
      preview = Object.assign(pairUp(c), { mode: matchMode() });
      RENDER.match();
    } else if (k === 'confirm' && preview) {
      const p = preview;
      preview = null;
      await makeGames(p.pairs, p.mode);
      sel.clear();
      $('#m-preview').innerHTML = '<p class="empty">경기를 만들었어요. 「실시간 경기」에서 확인하세요.</p>';
      RENDER.match();
    }
  });

  async function makeGames(pairs, mode) {
    let n = 0;
    for (const [a, b] of pairs) {
      if (S.active[a] || S.active[b]) { toast(`${nameOf(a)} 또는 ${nameOf(b)}은(는) 이미 경기 중이라 건너뛰었어요.`, 'bad'); continue; }
      await D.update('', { ['queue/' + a]: null, ['queue/' + b]: null });
      await A.createPvp(a, b, mode, 'assigned', false);
      n++;
    }
    if (n) toast(`${n}경기를 배정했어요.`, 'good');
  }

  /* ───────────── 학생 관리 ───────────── */
  const genPw = () => String(Math.floor(100000 + Math.random() * 900000));
  SKELETON.students = () => {
    main().innerHTML = `<div class="a-head"><h2>학생 관리</h2><span class="muted" id="s-cnt"></span><span class="sp"></span>
      <span class="muted">학생 로그인 = 반 코드 <span class="code-big" style="color:var(--text)">${esc(S.cid)}</span> + 아이디 + 비밀번호</span></div>
      <div class="two-col" style="margin-bottom:18px">
        <div class="panel"><h3>학생 한 명 추가</h3>
          <form id="s-add" class="form-grid">
            <label>아이디 (영문·숫자)<input name="id" required pattern="[A-Za-z0-9_]{2,20}" autocapitalize="none" placeholder="예: kim01"></label>
            <label>이름<input name="name" required placeholder="예: 김민준"></label>
            <label>비밀번호 (6자 이상)<input name="pw" required minlength="6" value="${genPw()}"></label>
            <div style="display:flex;align-items:flex-end"><button class="btn primary" style="width:100%">추가</button></div>
          </form></div>
        <div class="panel"><h3>여러 명 한꺼번에 등록</h3>
          <p class="muted" style="margin:0 0 6px;font-size:.88em">한 줄에 한 명씩 <b>아이디,이름,비밀번호</b> — 비밀번호를 비우면 6자리 숫자가 자동으로 만들어져요.</p>
          <textarea id="s-bulk" rows="5" placeholder="kim01,김민준,123456&#10;lee02,이서연&#10;park03,박지호"></textarea>
          <div class="foot" style="margin-top:10px"><button class="btn primary" id="s-bulk-go">일괄 등록</button></div></div>
      </div>
      <div class="tbl-wrap" id="s-table"></div>`;
    $('#s-add').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button');
      btn.disabled = true;
      try {
        await addStudent(f.id.value.trim(), f.name.value.trim(), f.pw.value.trim());
        toast(`${f.name.value} 학생을 추가했어요.`, 'good');
        f.reset();
        f.pw.value = genPw();
      } catch (err) { toast(err.message, 'bad'); }
      btn.disabled = false;
    });
    $('#s-bulk-go').addEventListener('click', async (e) => {
      const lines = $('#s-bulk').value.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      e.target.disabled = true;
      let ok = 0; const fails = [];
      for (const line of lines) {
        const [id, name, pw] = line.split(/[,\t]/).map((x) => (x || '').trim());
        try { await addStudent(id, name, pw || genPw()); ok++; }
        catch (err) { fails.push(`${id || line}: ${err.message}`); }
      }
      e.target.disabled = false;
      $('#s-bulk').value = fails.length ? lines.filter((l) => fails.some((f) => f.startsWith(l.split(/[,\t]/)[0]))).join('\n') : '';
      toast(`${ok}명 등록 완료${fails.length ? ` · 실패 ${fails.length}명` : ''}`, fails.length ? 'bad' : 'good');
      if (fails.length) modal(`<h3>등록하지 못한 학생</h3><ul>${fails.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><div class="foot"><button class="btn" data-close>닫기</button></div>`);
    });
    $('#s-table').addEventListener('click', onStudentAction);
  };
  RENDER.students = () => {
    const ids = Object.keys(S.users).sort((a, b) => String(S.users[a].loginId).localeCompare(S.users[b].loginId));
    $('#s-cnt').textContent = `${ids.length} / ${MAX_STUDENTS}명`;
    if (!ids.length) { $('#s-table').innerHTML = '<p class="empty" style="padding:30px">아직 등록된 학생이 없어요.</p>'; return; }
    $('#s-table').innerHTML = `<table class="tbl"><thead><tr><th>이름</th><th>아이디</th><th>비밀번호</th><th class="num">점수</th><th>배치</th><th class="num">랭크 승/패/무</th><th class="num">일반전</th><th>상태</th><th>관리</th></tr></thead><tbody>
      ${ids.map((u) => {
        const x = S.users[u];
        const pw = secrets[u] && secrets[u].pw;
        return `<tr><td>${nameTag(u)}</td><td>${esc(x.loginId)}</td>
          <td>${pw ? `<button class="btn xs ghost" data-s="showpw" data-u="${u}">보기</button>` : '<span class="muted">-</span>'}</td>
          <td class="num"><b>${x.score}</b></td><td>${(x.placed || 0) >= 5 ? '완료' : `${x.placed || 0}/5`}</td>
          <td class="num">${x.wins || 0} / ${x.losses || 0} / ${x.draws || 0}</td>
          <td class="num">${x.nWins || 0}승 ${x.nLosses || 0}패</td>
          <td>${statusDot(u)} ${STATUS_KO[status(u)]}</td>
          <td><div class="row-actions">
            <button class="btn xs" data-s="edit" data-u="${u}">정보·점수 수정</button>
            <button class="btn xs" data-s="pw" data-u="${u}">비밀번호 변경</button>
            <button class="btn xs danger" data-s="del" data-u="${u}">삭제</button></div></td></tr>`;
      }).join('')}</tbody></table>`;
  };

  async function addStudent(id, name, pw) {
    if (!/^[A-Za-z0-9_]{2,20}$/.test(id || '')) throw new Error('아이디는 영문·숫자·_ 2~20자');
    if (!name) throw new Error('이름을 입력하세요');
    if (String(pw).length < 6) throw new Error('비밀번호는 6자 이상');
    if (Object.keys(S.users).length >= MAX_STUDENTS) throw new Error(`한 반에 최대 ${MAX_STUDENTS}명까지 등록할 수 있어요`);
    if (Object.values(S.users).some((u) => String(u.loginId).toLowerCase() === id.toLowerCase())) throw new Error('이미 있는 아이디');
    const uid = await B.createAccount(A.accountKey(S.cid, id), pw);
    await B.set('members/' + uid, { cid: S.cid, role: 'student' });
    await D.update('', {
      ['users/' + uid]: { loginId: id.toLowerCase(), name, score: R.START_SCORE, placed: 0, wins: 0, losses: 0, draws: 0, rankGames: 0, createdAt: B.now() },
      ['secrets/' + uid]: { pw, loginId: id.toLowerCase() },
    });
    S.users[uid] = { loginId: id.toLowerCase(), name, score: R.START_SCORE, placed: 0 };
  }

  async function onStudentAction(e) {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const u = b.dataset.u, x = S.users[u];
    if (!x) return;
    const k = b.dataset.s;
    if (k === 'showpw') { b.outerHTML = `<code>${esc(secrets[u].pw)}</code>`; return; }
    if (k === 'edit') {
      const m = modal(`<h3>${esc(x.name)} 정보 수정</h3>
        <form class="form-grid" id="ed">
          <label>이름<input name="name" value="${esc(x.name)}" required></label>
          <label>점수<input name="score" type="number" value="${x.score}" required></label>
          <label>배치고사 완료 판 수 (0~5)<input name="placed" type="number" min="0" max="5" value="${x.placed || 0}"></label>
          <label>오늘 반영 경기 수<input name="day" type="number" min="0" value="${R.dayCount(x, B.now())}"></label>
        </form>
        <p class="muted" style="font-size:.85em">점수를 직접 고치면 순위·티어가 바로 바뀌어요. 부정 경기 처리는 「경기 기록」의 무효 처리를 권장해요.</p>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
      m.el.querySelector('[data-ok]').onclick = async () => {
        const f = m.el.querySelector('#ed');
        const placed = Math.max(0, Math.min(5, parseInt(f.placed.value, 10) || 0));
        const now = B.now();
        await D.update('users/' + u, {
          name: f.name.value.trim() || x.name, score: parseInt(f.score.value, 10) || 0, placed,
          // 오늘 둔 상대 순서(같은 상대 연속 수 계산용)는 그대로 두고 반영 경기 수만 고침
          day: { key: R.dayKey(now), count: Math.max(0, parseInt(f.day.value, 10) || 0), opp: R.dayOpps(S.users[u], now) }, week: null, scoreAt: now,
        });
        m.close();
        toast('저장했어요.', 'good');
      };
    } else if (k === 'pw') {
      const m = modal(`<h3>${esc(x.name)} 비밀번호 변경</h3>
        <label>새 비밀번호 (6자 이상)<input id="npw" value="${genPw()}" minlength="6"></label>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>변경</button></div>`);
      m.el.querySelector('[data-ok]').onclick = async () => {
        const npw = m.el.querySelector('#npw').value.trim();
        try {
          const old = secrets[u] && secrets[u].pw;
          if (!old) throw new Error('저장된 기존 비밀번호가 없어 변경할 수 없어요.');
          await B.setPassword(A.accountKey(S.cid, x.loginId), old, npw);
          await D.set('secrets/' + u, { pw: npw, loginId: x.loginId });
          m.close();
          toast('비밀번호를 변경했어요.', 'good');
        } catch (err) { toast(err.message, 'bad'); }
      };
    } else if (k === 'del') {
      if (!(await confirmBox('학생 삭제', `<b>${esc(x.name)}</b>(${esc(x.loginId)}) 학생을 삭제할까요? 점수와 개인 기록이 모두 사라져요. 되돌릴 수 없어요.`, '삭제', true))) return;
      try { await B.deleteAccount(A.accountKey(S.cid, x.loginId), secrets[u] && secrets[u].pw); }
      catch (err) { console.warn('계정 삭제 실패(데이터만 삭제):', err); }
      const gid = S.active[u];
      if (gid) await A.cancelGame(gid);
      await D.update('', { ['users/' + u]: null, ['secrets/' + u]: null, ['active/' + u]: null, ['presence/' + u]: null, ['queue/' + u]: null, ['userGames/' + u]: null, ['invites/' + u]: null });
      await B.remove('members/' + u);
      toast('삭제했어요.');
    }
  }

  /* ───────────── 순위표 ───────────── */
  SKELETON.ranking = () => { main().innerHTML = '<div id="rk"></div>'; };
  RENDER.ranking = () => {
    const { placed, placing } = A.rankingOrder();
    const dist = {};
    R.TIERS.forEach((t) => (dist[t.id] = 0));
    placed.forEach((u) => dist[R.tierOf(S.users[u].score).id]++);
    const max = Math.max(1, ...Object.values(dist));
    const colors = { bronze: 'var(--c-bronze)', silver: 'var(--c-silver)', gold: 'var(--c-gold)', platinum: 'var(--c-platinum)', diamond: 'var(--c-diamond)' };
    $('#rk').innerHTML = `<div class="a-head"><h2>순위표</h2><span class="sp"></span><span class="muted">챔피언은 배치고사를 마친 학생 중 점수 1위</span></div>
      <div class="two-col">
        <div class="tbl-wrap big-rank"><table class="tbl"><thead><tr><th>순위</th><th>학생</th><th>티어</th><th class="num">점수</th><th class="num">승/패</th><th class="num">승률</th></tr></thead><tbody>
          ${placed.map((u, i) => {
            const x = S.users[u];
            const t = A.tierOfUid(u);
            const g = (x.wins || 0) + (x.losses || 0);
            return `<tr><td><b>${i + 1}</b></td><td>${statusDot(u)} ${nameTag(u, 'lg')}</td><td class="tier-color-${t.id}"><b>${esc(t.name)}</b></td><td class="num"><b>${x.score}</b></td><td class="num">${x.wins || 0} / ${x.losses || 0}</td><td class="num">${g ? Math.round(((x.wins || 0) / g) * 100) + '%' : '-'}</td></tr>`;
          }).join('')}
          ${placing.map((u) => `<tr><td class="muted">-</td><td>${statusDot(u)} ${nameTag(u, 'lg')}</td><td class="muted">배치 ${S.users[u].placed || 0}/5</td><td class="num muted">${S.users[u].score}</td><td class="num">${S.users[u].wins || 0} / ${S.users[u].losses || 0}</td><td></td></tr>`).join('')}
          ${!placed.length && !placing.length ? '<tr><td colspan="6" class="empty">학생이 없어요</td></tr>' : ''}
        </tbody></table></div>
        <div class="col" style="gap:18px">
          <div class="panel"><h3>티어 분포 <span class="muted">배치 완료 ${placed.length}명</span></h3><div class="tier-bars">
            ${R.TIERS.slice().reverse().map((t) => `<div class="tb"><span class="ntag t-${t.id}">${emblem(t.id)}<span class="nm">${t.name}</span></span><div class="bar"><i style="width:${(dist[t.id] / max) * 100}%;background:${colors[t.id]}"></i></div><b>${dist[t.id]}</b></div>`).join('')}
          </div></div>
          <div class="panel"><h3>티어 기준</h3><dl class="kv">
            <dt>${emblem('champion')}</dt><dd><b class="tier-color-champion">챔피언</b> — 전체 점수 1위</dd>
            <dt>${emblem('diamond')}</dt><dd><b class="tier-color-diamond">다이아</b> 1175점 이상</dd>
            <dt>${emblem('platinum')}</dt><dd><b class="tier-color-platinum">플래티넘</b> 1100~1174점</dd>
            <dt>${emblem('gold')}</dt><dd><b class="tier-color-gold">골드</b> 1000~1099점</dd>
            <dt>${emblem('silver')}</dt><dd><b class="tier-color-silver">실버</b> 900~999점</dd>
            <dt>${emblem('bronze')}</dt><dd><b class="tier-color-bronze">브론즈</b> 899점 이하</dd>
          </dl></div>
        </div>
      </div>`;
    $$('#rk dl svg').forEach((s) => { s.style.width = '26px'; s.style.height = '26px'; });
  };

  /* ───────────── 경기 기록 ───────────── */
  SKELETON.log = () => {
    main().innerHTML = `<div class="a-head"><h2>경기 기록</h2><span class="muted" id="lg-cnt"></span><span class="sp"></span>
      <div class="seg" id="lg-f"><button data-v="all" class="on">전체</button><button data-v="rank">랭크전</button><button data-v="normal">일반전</button></div></div>
      <div class="tbl-wrap" id="lg"></div>`;
    $('#lg-f').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('#lg-f button').forEach((x) => x.classList.toggle('on', x === b));
      RENDER.log();
    });
    $('#lg').addEventListener('click', onLogAction);
  };
  RENDER.log = () => {
    const f = ($('#lg-f .on') || {}).dataset?.v || 'all';
    const rows = Object.entries(log).map(([id, v]) => Object.assign({ id }, v)).filter((x) => f === 'all' || x.mode === f).sort((a, b) => b.ts - a.ts).slice(0, 300);
    $('#lg-cnt').textContent = `${rows.length}건`;
    if (!rows.length) { $('#lg').innerHTML = '<p class="empty" style="padding:30px">기록이 없어요.</p>'; return; }
    const dl = (x, u) => {
      const d = x.deltas && x.deltas[u];
      if (!d) return '';
      if (x.voided) return '<span class="muted">무효</span>';
      const cls = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
      return `<span class="delta ${cls}">${d.delta > 0 ? '+' : ''}${d.delta}</span>${d.placement ? ' <span class="muted">(배치)</span>' : ''}${!d.counted ? ' <span class="muted">(연습)</span>' : ''}`;
    };
    $('#lg').innerHTML = `<table class="tbl"><thead><tr><th>시간</th><th>종류</th><th>흑</th><th>백</th><th>결과</th><th class="num">수</th><th></th></tr></thead><tbody>
      ${rows.map((x) => `<tr style="${x.voided ? 'opacity:.5' : ''}"><td>${A.fmtTime(x.ts)}</td>
        <td>${x.mode === 'rank' ? '🏆 랭크' : '🎮 일반'} · ${esc(x.matchType === 'ai' ? 'AI ' + (A.AI_NAMES[x.aiLevel] || '') : A.MATCH_NAMES[x.matchType] || '')}</td>
        <td>${nameTag(x.black, '', { level: x.aiLevel })} ${dl(x, x.black)}</td>
        <td>${nameTag(x.white, '', { level: x.aiLevel })} ${dl(x, x.white)}</td>
        <td>${x.winner ? `<b>${x.winner === x.black ? '흑' : '백'} 승</b>` : '무승부'} <span class="muted">${esc(A.REASON_NAMES[x.reason] || '')}${x.reason === 'foul' ? ` (${esc(window.Renju.REASON_KO[x.detail] || '')})` : ''}</span></td>
        <td class="num">${x.moves}</td>
        <td><div class="row-actions"><button class="btn xs" data-l="view" data-g="${x.id}">기보</button>
          ${x.mode === 'rank' && x.deltas && !x.voided ? `<button class="btn xs danger" data-l="void" data-g="${x.id}">무효 처리</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table>`;
  };
  async function onLogAction(e) {
    const b = e.target.closest('[data-l]');
    if (!b) return;
    const gid = b.dataset.g, x = log[gid];
    if (b.dataset.l === 'view') { A.openGame(gid, { spectate: true }); return; }
    if (!x || x.voided) return;
    if (!(await confirmBox('경기 무효 처리', `이 경기의 점수 변동을 되돌려요.<br>${esc(nameOf(x.black))} ${x.deltas[x.black] ? x.deltas[x.black].delta : 0}점, ${esc(nameOf(x.white))} ${x.deltas[x.white] ? x.deltas[x.white].delta : 0}점을 취소하고 승패 기록도 빼요.<br><span style="font-size:.9em">※ 이후 경기들의 상대 보정값은 다시 계산하지 않아요.</span>`, '무효 처리', true))) return;
    const now = B.now();
    for (const u of [x.black, x.white]) {
      const d = x.deltas[u];
      if (!d || !S.users[u]) continue;
      await D.tx('users/' + u, (cur) => {
        if (!cur) return undefined;
        if (d.counted) {
          cur.score = Math.max(0, (cur.score || 0) - d.delta);
          if (d.placement) cur.placed = Math.max(0, (cur.placed || 0) - 1);
          else if (cur.day && cur.day.key === R.dayKey(x.ts) && cur.day.key === R.dayKey(now)) cur.day.count = Math.max(0, (cur.day.count || 0) - 1); // 오늘 둔 경기면 오늘 한도도 돌려줌
        }
        cur.rankGames = Math.max(0, (cur.rankGames || 0) - 1);
        if (!x.winner) cur.draws = Math.max(0, (cur.draws || 0) - 1);
        else if (x.winner === u) cur.wins = Math.max(0, (cur.wins || 0) - 1);
        else cur.losses = Math.max(0, (cur.losses || 0) - 1);
        return cur;
      });
    }
    const upd = { [`log/${gid}/voided`]: true };
    for (const u of [x.black, x.white]) if (S.users[u]) Object.assign(upd, { [`userGames/${u}/${gid}/counted`]: false, [`userGames/${u}/${gid}/delta`]: 0, [`userGames/${u}/${gid}/note`]: '무효 처리' });
    await D.update('', upd);
    toast('무효 처리했어요.', 'good');
  }

  /* ───────────── 설정 ───────────── */
  const FIELDS = [
    ['moveTimeRank', '랭크전 한 수 제한 시간(초)', 'number', '시간이 지나면 시간 초과 패배'],
    ['moveTimeNormal', '일반전 한 수 제한 시간(초)', 'number', '0이면 무제한 (AI 대전은 항상 무제한)'],
    ['multRandom', '랜덤 매치 점수 배율', 'number', '1.0 = md 문서 기준 그대로'],
    ['multSelect', '1:1 선택 매치 점수 배율', 'number', '랜덤보다 작게 (예: 0.7)'],
    ['multAssigned', '선생님 배정 매치 배율', 'number', ''],
    ['placementMult', '배치고사 배율', 'number', 'md 기준 1.2'],
    ['sameOppStreak', '1:1 선택 매치: 하루에 같은 상대 연속 n판째부터 승점 0', 'number', '진 사람만 하락. 기본 3. 날짜가 바뀌면 다시 1판째부터 셈'],
    ['dailyLimit', '하루 점수 반영 랭크전 수', 'number', '0이면 무제한. 초과분은 연습 경기(배치고사 제외). 날짜가 바뀌면 다시 0부터'],
    ['resignBase', '9수 미만 기권·시간패 기본점수', 'number', '너무 이른 기권으로 점수를 주고받는 것 방지'],
  ];
  SKELETON.settings = () => {
    const st = A.settings();
    main().innerHTML = `<div class="a-head"><h2>설정</h2></div>
      <div class="two-col">
        <div class="panel"><h3>경기·점수 규칙</h3>
          <form id="st-f" class="form-grid">
            ${FIELDS.map(([k, l, t, h]) => `<label>${l}<input name="${k}" type="${t}" step="any" value="${st[k]}">${h ? `<small>${h}</small>` : ''}</label>`).join('')}
            <label>금수 자리 표시 (빨간 X)<select name="showForbidden">
              <option value="normal" ${st.showForbidden === 'normal' ? 'selected' : ''}>일반전에서만 표시</option>
              <option value="all" ${st.showForbidden === 'all' ? 'selected' : ''}>랭크전도 표시</option>
              <option value="none" ${st.showForbidden === 'none' ? 'selected' : ''}>표시 안 함</option></select><small>표시하지 않으면 학생이 직접 판단해야 해요</small></label>
            <label>착수 방식<select name="confirmMove">
              <option value="true" ${st.confirmMove ? 'selected' : ''}>두 번 눌러 착수 (태블릿 권장)</option>
              <option value="false" ${!st.confirmMove ? 'selected' : ''}>한 번 누르면 바로 착수</option></select></label>
          </form>
          <div class="foot"><button class="btn ghost" id="st-def">기본값으로</button><button class="btn primary" id="st-save">저장</button></div>
        </div>
        <div class="col" style="gap:18px">
          <div class="panel"><h3>시즌</h3>
            <p class="muted" style="font-size:.88em;line-height:1.5;margin-top:0">시즌을 끝내면 현재 챔피언과 상위 순위가 기록으로 남아요. md 문서는 매 시즌 완전 초기화보다 점수 유지를 권장해요.</p>
            <label>끝낼 시즌 이름<input id="se-name" value="시즌 ${Object.keys(S.seasons || {}).length + 1}"></label>
            <label>다음 시즌 점수<select id="se-mode"><option value="keep">점수·티어 그대로 유지</option><option value="reset">전원 1000점으로 초기화 + 배치고사 다시</option></select></label>
            <div class="foot"><button class="btn danger" id="se-end">시즌 종료 & 챔피언 기록</button></div>
            <div id="se-list"></div>
          </div>
          <div class="panel"><h3>반 정보</h3>
            <p class="muted" style="margin-top:0;font-size:.88em">반 코드 <span class="code-big" style="color:var(--text)">${esc(S.cid)}</span> — 학생들이 로그인할 때 입력해요. (반 코드는 바꿀 수 없어요)</p>
            <label>반 이름<input id="cn-name" value="${esc((S.classMeta || {}).name || '')}"></label>
            <label>선생님 표시 이름<input id="cn-teacher" value="${esc((S.classMeta || {}).teacherName || '')}"></label>
            <div class="foot"><button class="btn" id="cn-save">저장</button></div>
          </div>
          <div class="panel"><h3>${S.isSuper ? '총관리자 계정' : '관리자 계정'}</h3>
            <label>현재 비밀번호<input id="mp-old" type="password"></label>
            <label>새 비밀번호 (6자 이상)<input id="mp-new" type="password"></label>
            <div class="foot"><button class="btn" id="mp-go">비밀번호 변경</button></div>
            ${B.mode === 'demo' ? '<hr style="border-color:var(--line)"><p class="muted" style="font-size:.88em">데모 모드입니다. 실제 운영하려면 README의 Firebase 설정을 따라 주세요.</p><button class="btn danger sm" id="demo-reset2">데모 데이터 초기화</button>' : ''}
          </div>
        </div>
      </div>`;
    $('#st-save').onclick = async () => {
      const f = $('#st-f');
      const out = {};
      for (const [k] of FIELDS) {
        const v = parseFloat(f[k].value);
        if (!isFinite(v) || v < 0) return toast(`값을 확인하세요: ${k}`, 'bad');
        out[k] = v;
      }
      out.showForbidden = f.showForbidden.value;
      out.confirmMove = f.confirmMove.value === 'true';
      await D.set('settings', out);
      toast('설정을 저장했어요.', 'good');
    };
    $('#st-def').onclick = async () => {
      if (!(await confirmBox('기본값으로', '모든 규칙 설정을 기본값으로 되돌릴까요?', '되돌리기'))) return;
      await D.set('settings', R.DEFAULT_SETTINGS);
      main().dataset.tab = '';
      A.render();
    };
    $('#se-end').onclick = endSeason;
    $('#cn-save').onclick = async () => {
      const name = $('#cn-name').value.trim(), teacherName = $('#cn-teacher').value.trim();
      if (!name) return toast('반 이름을 입력하세요.', 'bad');
      await B.update('', {
        [`classes/${S.cid}/meta/name`]: name, [`classes/${S.cid}/meta/teacherName`]: teacherName,
        [`classes/${S.cid}/pub/name`]: name, [`classList/${S.cid}/name`]: name, [`classList/${S.cid}/teacherName`]: teacherName,
      });
      Object.assign(S.classMeta, { name, teacherName });
      S.masterName = teacherName || '선생님';
      toast('반 정보를 저장했어요.', 'good');
      A.render();
    };
    $('#mp-go').onclick = async () => {
      try {
        await B.setPassword(S.loginKey, $('#mp-old').value, $('#mp-new').value);
        toast('관리자 비밀번호를 변경했어요.', 'good');
        $('#mp-old').value = $('#mp-new').value = '';
      } catch (err) { toast(err.message, 'bad'); }
    };
    const dr = $('#demo-reset2');
    if (dr) dr.onclick = async () => {
      if (!(await confirmBox('데모 데이터 초기화', '이 브라우저의 모든 데모 데이터(계정·점수·기록)가 삭제됩니다.', '초기화', true))) return;
      B.resetDemo();
      location.reload();
    };
  };
  RENDER.settings = () => {
    const list = Object.values(S.seasons || {}).sort((a, b) => b.endedAt - a.endedAt);
    const el = $('#se-list');
    if (!el) return;
    el.innerHTML = list.length ? `<h3 style="margin-top:16px">지난 시즌</h3><ul class="hist">${list.map((s) => `<li>${emblem('champion').replace('class="emb"', 'class="emb" style="width:24px;height:24px"')}<b>${esc(s.name)}</b><span class="muted">${A.fmtTime(s.endedAt)}</span><span class="delta" style="color:var(--c-champion)">${esc(s.championName || '-')} ${s.championScore ?? ''}점</span></li>`).join('')}</ul>` : '';
  };

  async function endSeason() {
    const name = $('#se-name').value.trim() || '시즌';
    const reset = $('#se-mode').value === 'reset';
    const champ = S.champion;
    if (!(await confirmBox('시즌 종료', `<b>${esc(name)}</b>을(를) 종료하고 챔피언 <b>${esc(champ ? nameOf(champ) : '없음')}</b>을(를) 기록할까요?${reset ? '<br><b style="color:var(--bad)">모든 학생 점수가 1000점으로 초기화되고 배치고사를 다시 해요.</b>' : ''}`, '시즌 종료', true))) return;
    const { placed } = A.rankingOrder();
    const now = B.now();
    const key = B.newKey();
    await D.set('seasons/' + key, {
      name, endedAt: now, champion: champ || '', championName: champ ? nameOf(champ) : '', championScore: champ ? S.users[champ].score : null,
      top: placed.slice(0, 10).map((u, i) => ({ rank: i + 1, uid: u, name: nameOf(u), score: S.users[u].score, tier: R.tierOf(S.users[u].score).name })),
    });
    if (reset) {
      const upd = {};
      for (const u of Object.keys(S.users)) {
        Object.assign(upd, { [`users/${u}/score`]: R.START_SCORE, [`users/${u}/placed`]: 0, [`users/${u}/wins`]: 0, [`users/${u}/losses`]: 0, [`users/${u}/draws`]: 0, [`users/${u}/rankGames`]: 0, [`users/${u}/day`]: null, [`users/${u}/week`]: null, [`users/${u}/recentOpp`]: null, [`users/${u}/placedAt`]: null, [`users/${u}/scoreAt`]: null });
      }
      await D.update('', upd);
    }
    toast('시즌을 종료했어요.', 'good');
    main().dataset.tab = '';
    A.render();
  }

  window.Admin = Admin;
})();
