/* 점수·티어 계산 (class_omok_rank_system.md 기준)
   기본 점수 B = max(18, 49 - 전체 착수 수)  (9수 미만 종료는 9수로 간주)
   보정 C  : 경기 전 점수차 d = 패자 - 승자
   정규전 Δ = B + C, 배치고사 Δ = 반올림((B + C) × 1.2)
   배치 5판 종료 시 min(1099, 점수) */
(function () {
  const TIERS = [
    { id: 'bronze', name: '브론즈', min: -Infinity },
    { id: 'silver', name: '실버', min: 900 },
    { id: 'gold', name: '골드', min: 1000 },
    { id: 'platinum', name: '플래티넘', min: 1100 },
    { id: 'diamond', name: '다이아', min: 1175 },
  ];
  const PLACEMENT_GAMES = 5;
  const PLACEMENT_CAP = 1099;
  const START_SCORE = 1000;

  const DEFAULT_SETTINGS = {
    moveTimeRank: 60,        // 랭크전 한 수 제한 시간(초)
    moveTimeNormal: 90,      // 일반전 한 수 제한 시간(초), 0이면 무제한
    multRandom: 1.0,         // 랜덤 매치 배율
    multAssigned: 1.0,       // 선생님 배정 매치 배율
    multSelect: 0.7,         // 1:1 선택 매치 배율 (랜덤보다 작게)
    placementMult: 1.2,      // 배치고사 배율
    sameOppStreak: 3,        // 1:1 선택 매치 연속 동일 상대 n판째부터 승자 0점
    weeklyLimit: 4,          // 주당 점수 반영 정규 랭크전 수 (0=무제한)
    resignBase: 30,          // 9수 미만 기권·시간패 기본 점수
    showForbidden: 'normal', // 금수 자리 표시: all | normal | none
    confirmMove: true,       // 두 번 눌러 착수(태블릿 오터치 방지)
  };

  function tierOf(score) {
    let t = TIERS[0];
    for (const x of TIERS) if (score >= x.min) t = x;
    return t;
  }
  const tierIndex = (score) => TIERS.indexOf(tierOf(score));

  function baseScore(moves, reason, settings) {
    if ((reason === 'resign' || reason === 'timeout') && moves < 9) return settings.resignBase;
    return Math.max(18, 49 - Math.max(9, moves));
  }
  function correction(winnerPre, loserPre) {
    const d = loserPre - winnerPre;
    if (d >= 200) return 8;
    if (d >= 100) return 4;
    if (d <= -200) return -8;
    if (d <= -100) return -4;
    return 0;
  }

  // ISO 주차 키 (예: 2026-W39)
  function weekKey(ts) {
    const d = new Date(ts);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
  }

  // 같은 상대와의 연속 경기 수 (이번 경기 포함)
  function streakWith(recent, oppUid) {
    let n = 0;
    for (let i = (recent || []).length - 1; i >= 0; i--) {
      if (recent[i] === oppUid) n++;
      else break;
    }
    return n + 1;
  }

  /* 랭크전 점수 계산
     game: {black, white, matchType, result:{winner, reason, moves}, pre:{uid:{score}}}
     users: {uid: userRecord(경기 직전)}
     반환: {uid: {delta, counted, placement, note}} */
  function computeRank(game, users, settings, now) {
    settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const res = game.result;
    const out = {};
    const ids = [game.black, game.white];
    if (!res || !res.winner) {
      ids.forEach((u) => (out[u] = { delta: 0, counted: false, placement: false, note: '무승부' }));
      return out;
    }
    const winner = res.winner, loser = winner === game.black ? game.white : game.black;
    const preW = (game.pre && game.pre[winner] && game.pre[winner].score) ?? users[winner].score;
    const preL = (game.pre && game.pre[loser] && game.pre[loser].score) ?? users[loser].score;
    const B = baseScore(res.moves, res.reason, settings);
    const C = correction(preW, preL);
    const raw = B + C;
    const typeMult = game.matchType === 'select' ? settings.multSelect
      : game.matchType === 'assigned' ? settings.multAssigned : settings.multRandom;
    const wk = weekKey(now);

    let streakZero = false;
    if (game.matchType === 'select') {
      const s = Math.max(streakWith(users[winner].recentOpp, loser), streakWith(users[loser].recentOpp, winner));
      if (s >= settings.sameOppStreak) streakZero = true;
    }

    for (const uid of [winner, loser]) {
      const u = users[uid];
      const placement = (u.placed || 0) < PLACEMENT_GAMES;
      const weekCount = u.week && u.week.key === wk ? u.week.count : 0;
      const overLimit = !placement && settings.weeklyLimit > 0 && weekCount >= settings.weeklyLimit;
      const mult = typeMult * (placement ? settings.placementMult : 1);
      let delta = Math.round(raw * mult);
      let note = '';
      if (overLimit) { delta = 0; note = `주간 ${settings.weeklyLimit}경기 초과 — 연습 경기로 기록`; }
      else if (uid === winner && streakZero) { delta = 0; note = `같은 상대 ${settings.sameOppStreak}연속 이상 — 승점 없음`; }
      out[uid] = {
        delta: uid === winner ? delta : -delta,
        counted: !overLimit,
        placement,
        note,
        detail: { B, C, mult: Math.round(mult * 100) / 100 },
      };
    }
    return out;
  }

  // 사용자 레코드에 결과를 적용한 새 레코드 (트랜잭션 안에서 사용)
  function applyToUser(u, info, won, draw, oppUid, now) {
    u = Object.assign({}, u);
    const wk = weekKey(now);
    if (!u.week || u.week.key !== wk) u.week = { key: wk, count: 0 };
    else u.week = Object.assign({}, u.week);
    if (info.counted) {
      u.score = Math.max(0, (u.score ?? START_SCORE) + info.delta);
      if (info.delta) u.scoreAt = now;
      if (info.placement) {
        u.placed = (u.placed || 0) + 1;
        if (u.placed >= PLACEMENT_GAMES) {
          u.score = Math.min(PLACEMENT_CAP, u.score);
          u.placedAt = now;
        }
      } else u.week.count += 1;
    }
    u.rankGames = (u.rankGames || 0) + 1;
    if (draw) u.draws = (u.draws || 0) + 1;
    else if (won) u.wins = (u.wins || 0) + 1;
    else u.losses = (u.losses || 0) + 1;
    const r = (u.recentOpp || []).slice(-9);
    r.push(oppUid);
    u.recentOpp = r;
    return u;
  }

  // 챔피언: 배치 완료자 중 점수 1위 (동점: 승수 많은 순 → 패수 적은 순 → 먼저 도달)
  function championOf(users) {
    let best = null;
    for (const [uid, u] of Object.entries(users || {})) {
      if ((u.placed || 0) < PLACEMENT_GAMES) continue;
      const k = [u.score, u.wins || 0, -(u.losses || 0), -(u.scoreAt || u.placedAt || 0)];
      if (!best || cmp(k, best.k) > 0) best = { uid, k };
    }
    return best ? best.uid : null;
    function cmp(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
  }

  // 화면 표시용 티어 정보
  function displayTier(u, championUid, uid) {
    if (!u) return { id: 'none', name: '' };
    if ((u.placed || 0) < PLACEMENT_GAMES) return { id: 'placement', name: `배치고사 ${u.placed || 0}/${PLACEMENT_GAMES}` };
    if (uid && uid === championUid) return { id: 'champion', name: '챔피언' };
    return tierOf(u.score);
  }

  window.Rating = {
    TIERS, PLACEMENT_GAMES, PLACEMENT_CAP, START_SCORE, DEFAULT_SETTINGS,
    tierOf, tierIndex, baseScore, correction, computeRank, applyToUser, championOf, displayTier, weekKey, streakWith,
  };
})();
