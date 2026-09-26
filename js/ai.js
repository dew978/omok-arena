/* 오목 AI: 쉬움 / 보통 / 어려움
   - 창(5칸) 단위 패턴 점수 + 위협(4, 열린3) 인식
   - 어려움: 연속 4 공격(VCF) 탐색과 상대 VCF 차단 */
(function () {
  const { N, BLACK, WHITE, DIRS, rc, inb, at, lineLen, completions, isStraightFour, isOpenThree, forbidden } = window.Renju;
  const W = [0, 2, 24, 260, 3200, 200000];

  function candidates(b, dist = 2) {
    const out = [];
    let any = false;
    for (let i = 0; i < N * N; i++) {
      if (b[i] !== 0) continue;
      const [r, c] = rc(i);
      let ok = false;
      for (let dr = -dist; dr <= dist && !ok; dr++)
        for (let dc = -dist; dc <= dist; dc++) {
          if (inb(r + dr, c + dc) && b[(r + dr) * N + c + dc] !== 0) { ok = true; break; }
        }
      if (ok) { out.push(i); any = true; }
    }
    if (!any) out.push(7 * N + 7);
    return out;
  }

  // 창 단위 점수 (color가 p에 둘 경우)
  function windowScore(b, p, color) {
    const opp = 3 - color;
    let s = 0;
    for (const [dr, dc] of DIRS) {
      for (let st = -4; st <= 0; st++) {
        let own = 0, blocked = false;
        for (let t = st; t < st + 5; t++) {
          const q = at(p, dr, dc, t);
          if (q < 0 || b[q] === opp) { blocked = true; break; }
          if (b[q] === color) own++;
        }
        if (!blocked) s += W[Math.min(5, own + 1)];
      }
    }
    return s;
  }

  // 위협 분석 (color가 p에 둔다고 가정)
  function threats(b, p, color) {
    if (b[p] !== 0) return null;
    if (color === BLACK && forbidden(b, p, 1)) {
      // 금수여도 오목 완성은 승리
      b[p] = BLACK;
      let five = false;
      for (const [dr, dc] of DIRS) if (lineLen(b, p, dr, dc, BLACK) === 5) five = true;
      b[p] = 0;
      return five ? { five: true, fours: 0, straight: false, threes: 0 } : { forbidden: true };
    }
    b[p] = color;
    let five = false, fours = 0, straight = false, threes = 0;
    for (const [dr, dc] of DIRS) {
      const len = lineLen(b, p, dr, dc, color);
      if (color === BLACK ? len === 5 : len >= 5) five = true;
    }
    if (!five) {
      for (const [dr, dc] of DIRS) {
        const keys = new Set(completions(b, p, dr, dc, color, 4).map((x) => x.key));
        fours += keys.size;
        if (keys.size && isStraightFour(b, p, dr, dc, color)) straight = true;
        else if (!keys.size && isOpenThree(b, p, dr, dc, color, 0)) threes++;
      }
    }
    b[p] = 0;
    return { five, fours, straight, threes };
  }

  function threatValue(t, color) {
    if (!t || t.forbidden) return -1e9;
    if (t.five) return 1e9;
    if (t.straight) return 5e7;
    if (t.fours >= 2 && color === WHITE) return 5e7;
    if (t.fours >= 1 && t.threes >= 1) return 1e7;
    if (t.threes >= 2 && color === WHITE) return 5e6;
    return t.fours * 6000 + t.threes * 4000;
  }

  // 한 수에 오목이 되는 자리들
  function winningSpots(b, color, cand) {
    const out = [];
    for (const i of cand) {
      if (b[i] !== 0) continue;
      b[i] = color;
      let five = false;
      for (const [dr, dc] of DIRS) {
        const len = lineLen(b, i, dr, dc, color);
        if (color === BLACK ? len === 5 : len >= 5) five = true;
      }
      b[i] = 0;
      if (five) out.push(i);
    }
    return out;
  }

  // 연속 4로 이기는 첫 수 탐색(VCF). 없으면 -1
  function vcf(b, color, depth, budget) {
    if (depth <= 0 || budget.n <= 0) return -1;
    const opp = 3 - color;
    const cand = candidates(b, 2);
    for (const q of cand) {
      if (budget.n-- <= 0) return -1;
      if (b[q] !== 0) continue;
      // 빠른 필터: 한 방향에 자기 돌 3개 이상인 창이 있어야 4가 됨
      let promising = false;
      for (const [dr, dc] of DIRS) {
        for (let st = -4; st <= 0 && !promising; st++) {
          let own = 0, blocked = false;
          for (let t = st; t < st + 5; t++) {
            const x = at(q, dr, dc, t);
            if (x < 0 || b[x] === opp) { blocked = true; break; }
            if (b[x] === color) own++;
          }
          if (!blocked && own >= 3) promising = true;
        }
        if (promising) break;
      }
      if (!promising) continue;
      if (color === BLACK && forbidden(b, q, 1)) continue;
      b[q] = color;
      const spots = new Set();
      let five = false;
      for (const [dr, dc] of DIRS) {
        const len = lineLen(b, q, dr, dc, color);
        if (color === BLACK ? len === 5 : len >= 5) five = true;
        for (const x of completions(b, q, dr, dc, color, 4)) spots.add(x.spot);
      }
      let win = false;
      if (five || spots.size >= 2) win = true;
      else if (spots.size === 1) {
        const s = [...spots][0];
        // 상대가 막는 자리가 흑의 금수면 막을 수 없음
        if (opp === BLACK && forbidden(b, s, 1)) win = true;
        else {
          b[s] = opp;
          let oppFive = false;
          for (const [dr, dc] of DIRS) {
            const len = lineLen(b, s, dr, dc, opp);
            if (opp === BLACK ? len === 5 : len >= 5) oppFive = true;
          }
          if (!oppFive && vcf(b, color, depth - 1, budget) >= 0) win = true;
          b[s] = 0;
        }
      }
      b[q] = 0;
      if (win) return q;
    }
    return -1;
  }

  function legal(b, i, color) {
    return b[i] === 0 && !(color === BLACK && forbidden(b, i, 1) && winningSpots(b, BLACK, [i]).length === 0);
  }

  function pick(movesList, level) {
    const b = window.Renju.boardFromMoves(movesList);
    const color = movesList.length % 2 === 0 ? BLACK : WHITE;
    const opp = 3 - color;
    if (movesList.length === 0) return 7 * N + 7;
    const cand = candidates(b, 2).filter((i) => legal(b, i, color));
    if (!cand.length) return b.findIndex((v, i) => v === 0 && legal(b, i, color));

    // 1. 바로 이기기
    const myWin = winningSpots(b, color, cand);
    if (myWin.length) return myWin[0];
    // 2. 상대 오목 막기 (쉬움은 가끔 놓침)
    const oppWin = winningSpots(b, opp, candidates(b, 2));
    const blockable = oppWin.filter((i) => legal(b, i, color));
    if (blockable.length && !(level === 'easy' && Math.random() < 0.2)) return blockable[0];

    // 3. 어려움: 내 VCF
    if (level === 'hard') {
      const v = vcf(b, color, 10, { n: 6000 });
      if (v >= 0 && legal(b, v, color)) return v;
    }

    // 4. 점수 평가
    const scored = cand.map((i) => {
      const atk = threatValue(threats(b, i, color), color) + windowScore(b, i, color);
      const tOpp = threats(b, i, opp);
      let def = tOpp && !tOpp.forbidden ? threatValue(tOpp, opp) + windowScore(b, i, opp) : windowScore(b, i, opp) * 0.5;
      const defW = level === 'easy' ? 0.45 : level === 'normal' ? 0.85 : 0.95;
      // 가운데 선호
      const [r, c] = rc(i);
      const center = -(Math.abs(r - 7) + Math.abs(c - 7));
      return { i, s: atk + def * defW + center };
    }).sort((x, y) => y.s - x.s);

    if (level === 'easy') {
      const top = scored.slice(0, 6);
      // 결정적인 수가 아니면 무작위성
      if (top[0].s < 1e6 || Math.random() < 0.35) return top[Math.floor(Math.random() * top.length)].i;
      return top[0].i;
    }
    if (level === 'normal') {
      const top = scored.slice(0, 3).filter((x) => x.s >= scored[0].s * 0.92);
      return top[Math.floor(Math.random() * top.length)].i;
    }

    // 어려움: 상대 VCF가 있으면 이를 막는 후보 우선
    const oppV = vcf(b, opp, 8, { n: 3000 });
    if (oppV >= 0) {
      for (const x of scored.slice(0, 10)) {
        b[x.i] = color;
        const still = vcf(b, opp, 8, { n: 2000 });
        b[x.i] = 0;
        if (still < 0) return x.i;
      }
    }
    // 상위 후보 2수 앞보기
    const top = scored.slice(0, 8);
    let best = top[0], bestVal = -Infinity;
    for (const x of top) {
      b[x.i] = color;
      const replies = candidates(b, 2).filter((i) => b[i] === 0);
      let worst = -Infinity;
      for (const y of replies) {
        if (opp === BLACK && forbidden(b, y, 1)) continue;
        const v = threatValue(threats(b, y, opp), opp) + windowScore(b, y, opp);
        if (v > worst) worst = v;
      }
      b[x.i] = 0;
      const val = x.s - worst * 0.6;
      if (val > bestVal) { bestVal = val; best = x; }
    }
    return best.i;
  }

  window.OmokAI = { pick, vcf };
})();
