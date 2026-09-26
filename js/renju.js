/* 렌주룰 엔진: 승리 판정, 흑 금수(3-3, 4-4, 장목) 판정
   보드: 길이 225 배열, 0=빈칸, 1=흑, 2=백 */
(function () {
  const N = 15;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const BLACK = 1, WHITE = 2;

  const rc = (i) => [Math.floor(i / N), i % N];
  const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  // (r,c)를 지나는 한 방향의 연속 돌 구간 [시작오프셋, 끝오프셋]
  function segment(b, p, dr, dc, color) {
    const [r, c] = rc(p);
    let a = 0, z = 0;
    while (inb(r + (a - 1) * dr, c + (a - 1) * dc) && b[(r + (a - 1) * dr) * N + c + (a - 1) * dc] === color) a--;
    while (inb(r + (z + 1) * dr, c + (z + 1) * dc) && b[(r + (z + 1) * dr) * N + c + (z + 1) * dc] === color) z++;
    return [a, z];
  }
  function lineLen(b, p, dr, dc, color) {
    const [a, z] = segment(b, p, dr, dc, color);
    return z - a + 1;
  }
  const isFiveLen = (len, color) => (color === BLACK ? len === 5 : len >= 5);

  // p 방향 d의 k번째 칸 인덱스(범위 밖이면 -1)
  function at(p, dr, dc, k) {
    const [r, c] = rc(p);
    const rr = r + k * dr, cc = c + k * dc;
    return inb(rr, cc) ? rr * N + cc : -1;
  }

  // p(이미 놓인 돌)를 포함하는 오목 완성점들을 {spot, key}로 반환 (한 방향)
  function completions(b, p, dr, dc, color, range) {
    const out = [];
    for (let k = -range; k <= range; k++) {
      if (k === 0) continue;
      const q = at(p, dr, dc, k);
      if (q < 0 || b[q] !== 0) continue;
      b[q] = color;
      const [a, z] = segment(b, q, dr, dc, color);
      const len = z - a + 1;
      // q 기준 구간에 p가 포함되는지 (p는 q에서 -k 만큼)
      if (isFiveLen(len, color) && -k >= a && -k <= z) {
        const cells = [];
        for (let t = a; t <= z; t++) if (t !== 0) cells.push(at(q, dr, dc, t));
        cells.sort((x, y) => x - y);
        out.push({ spot: q, key: cells.join(',') });
      }
      b[q] = 0;
    }
    return out;
  }

  // 한 방향에서 p를 포함하는 '4'의 개수 (같은 줄에 4가 두 개인 X.XXX.X 도 2로 셈)
  function countFours(b, p, dr, dc, color) {
    const keys = new Set(completions(b, p, dr, dc, color, 4).map((x) => x.key));
    return keys.size;
  }

  // 열린 4(두 곳에서 오목 완성 가능한 연속 4) 여부
  function isStraightFour(b, p, dr, dc, color) {
    const seen = new Set();
    for (const x of completions(b, p, dr, dc, color, 5)) {
      if (seen.has(x.key)) return true;
      seen.add(x.key);
    }
    return false;
  }

  // 한 방향에서 p가 열린 3을 이루는지 (한 수 더 두면 금수가 아닌 열린 4가 됨)
  function isOpenThree(b, p, dr, dc, color, depth) {
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const q = at(p, dr, dc, k);
      if (q < 0 || b[q] !== 0) continue;
      b[q] = color;
      const straight = isStraightFour(b, p, dr, dc, color);
      b[q] = 0;
      if (straight) {
        if (color !== BLACK || depth <= 0 || !forbidden(b, q, depth - 1)) return true;
      }
    }
    return false;
  }

  // 흑이 p에 둘 때 금수 여부. 금수면 '33' | '44' | 'overline', 아니면 null
  function forbidden(b, p, depth = 2) {
    if (b[p] !== 0) return null;
    b[p] = BLACK;
    let reason = null;
    let five = false, over = false;
    for (const [dr, dc] of DIRS) {
      const len = lineLen(b, p, dr, dc, BLACK);
      if (len === 5) five = true;
      else if (len > 5) over = true;
    }
    if (!five) {
      if (over) reason = 'overline';
      else {
        let fours = 0;
        for (const [dr, dc] of DIRS) fours += countFours(b, p, dr, dc, BLACK);
        if (fours >= 2) reason = '44';
        else {
          let threes = 0;
          for (const [dr, dc] of DIRS) {
            if (isOpenThree(b, p, dr, dc, BLACK, depth)) threes++;
            if (threes >= 2) break;
          }
          if (threes >= 2) reason = '33';
        }
      }
    }
    b[p] = 0;
    return reason;
  }

  // 착수 결과: {ok:false} | {end:'five'|'foul'|'draw'|null, reason}
  function evaluateMove(b, p, color) {
    if (b[p] !== 0) return { ok: false };
    if (color === BLACK) {
      const f = forbidden(b, p);
      b[p] = BLACK;
      let five = false;
      for (const [dr, dc] of DIRS) if (lineLen(b, p, dr, dc, BLACK) === 5) five = true;
      b[p] = 0;
      if (five) return { ok: true, end: 'five' };
      if (f) return { ok: true, end: 'foul', reason: f };
    } else {
      b[p] = WHITE;
      let five = false;
      for (const [dr, dc] of DIRS) if (lineLen(b, p, dr, dc, WHITE) >= 5) five = true;
      b[p] = 0;
      if (five) return { ok: true, end: 'five' };
    }
    return { ok: true, end: null };
  }

  // 승리한 다섯(또는 장목) 돌 위치 — 화면 강조용
  function winningLine(b, p) {
    const color = b[p];
    for (const [dr, dc] of DIRS) {
      const [a, z] = segment(b, p, dr, dc, color);
      if (isFiveLen(z - a + 1, color) || (color === WHITE && z - a + 1 >= 5)) {
        const cells = [];
        for (let t = a; t <= z; t++) cells.push(at(p, dr, dc, t));
        return cells;
      }
    }
    return [];
  }

  function boardFromMoves(moves) {
    const b = new Array(N * N).fill(0);
    (moves || []).forEach((m, i) => { b[m] = i % 2 === 0 ? BLACK : WHITE; });
    return b;
  }

  // 흑 차례일 때 화면에 표시할 금수 자리 목록
  function forbiddenPoints(b) {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      if (b[i] !== 0) continue;
      const [r, c] = rc(i);
      let near = 0;
      for (let dr = -2; dr <= 2 && near < 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          if (inb(r + dr, c + dc) && b[(r + dr) * N + c + dc] === BLACK) near++;
        }
      if (near < 2) continue;
      const f = forbidden(b, i);
      if (f) out.push({ i, reason: f });
    }
    return out;
  }

  const REASON_KO = { '33': '삼삼(3-3)', '44': '사사(4-4)', overline: '장목(6목 이상)' };

  window.Renju = {
    N, BLACK, WHITE, DIRS, rc, inb, at, lineLen, segment, completions, countFours,
    isStraightFour, isOpenThree, forbidden, evaluateMove, winningLine,
    boardFromMoves, forbiddenPoints, REASON_KO,
  };
})();
