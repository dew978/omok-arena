/* 티어 승급 장면 — awesome-ai-motion에서 고른 조합 (클래스 티어·오목 아레나 공용)
   · 주 동작 scale-swap: 옛 엠블럼이 작아지며(1→0.2, power2.in) 사라지는 동안 새 엠블럼이 같은 자리에서
     커져 들어옴(0.2→1, back.out(1.1), 반 박자 교차)
   · 보조 ① 이름 넘겨받기: 티어 이름은 크기를 바꾸지 않고 겹치지 않게 넘겨받음
   · 보조 ② particle-burst: 새 엠블럼이 도착하는 순간 새 티어 색 입자 80개가 한 번 터짐 (시드 고정, 투명도 0.6 이하)
   시간은 한 타임라인 t의 순수 함수. 동작 줄이기 설정이면 완성 상태를 바로 보여 주고, 화면을 누르면 끝 장면으로 건너뜀.
   TierUp.play({ from, to, fromName, toName, emblem, kicker, sub }) → 「좋아요!」로 닫으면 끝나는 Promise
   (at: 초를 주면 그 시점에 멈춘 장면 — 점검용) */
(function () {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const seg = (t, start, dur) => clamp((t - start) / dur);
  const quadIn = (p) => p * p;
  const quadOut = (p) => 1 - (1 - p) * (1 - p);
  const cubicIn = (p) => p * p * p;
  const backOut = (p, s = 1.1) => { const q = p - 1; return q * q * ((s + 1) * q + s) + 1; };
  // 예제(awesome-ai-motion scale-swap)의 시간표 그대로, 초 단위
  const T = { a: 0.8, aDur: 0.65, b: 1.125, bDur: 0.7, na: 0.95, naDur: 0.35, nb: 1.35, nbDur: 0.4, burst: 1.55, life: 1.2 };
  const END = T.burst + T.life + 0.05;
  const PALETTE = {
    bronze: ['#cf8650', '#ffd9b8', '#f0a878'], silver: ['#c3cedd', '#ffffff', '#9fb0c8'], gold: ['#f5c542', '#fff2b0', '#ffd76a'],
    platinum: ['#3fd1c2', '#d8fff9', '#7fe8dc'], diamond: ['#7fa6ff', '#e6f0ff', '#b38cff'], champion: ['#ffb02e', '#ff3d6e', '#fff3a6'],
  };
  function rand(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function play(o) {
    return new Promise((resolve) => {
      const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const bg = document.createElement('div');
      bg.className = 'tu-bg';
      bg.setAttribute('role', 'dialog');
      bg.setAttribute('aria-modal', 'true');
      bg.setAttribute('aria-label', `${o.toName} 승급`);
      bg.innerHTML = `<div class="tu-card">
        <div class="tu-kicker">${esc(o.kicker || '티어가 올랐어요!')}</div>
        <div class="tu-stage"><div class="tu-emb tu-b tier-color-${esc(o.to)}">${o.emblem(o.to)}</div><div class="tu-emb tu-a">${o.emblem(o.from)}</div><canvas class="tu-fx"></canvas></div>
        <div class="tu-names"><div class="tu-name tu-na tier-color-${esc(o.from)}">${esc(o.fromName)}</div><div class="tu-name tu-nb tier-color-${esc(o.to)}">${esc(o.toName)}</div></div>
        <div class="tu-line"><span class="tier-color-${esc(o.from)}">${esc(o.fromName)}</span><span class="tu-arrow">→</span><span class="tier-color-${esc(o.to)}">${esc(o.toName)}</span></div>
        ${o.sub ? `<div class="tu-sub">${esc(o.sub)}</div>` : ''}
        <button class="btn primary lg tu-ok">좋아요!</button></div>`;
      document.body.appendChild(bg);
      const q = (s) => bg.querySelector(s);
      const A = q('.tu-a'), Bm = q('.tu-b'), NA = q('.tu-na'), NB = q('.tu-nb'), cv = q('.tu-fx'), stage = q('.tu-stage');
      // 입자 캔버스: 엠블럼보다 넓게(입자가 밖으로 퍼짐), 기기 픽셀 비율만큼 선명하게. 속도·크기는 예제의 엠블럼 290px 기준으로 비례
      const size = stage.clientWidth || 200, k = size / 290;
      const W = Math.round(size * 3.2), H = W, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      const colors = PALETTE[o.to] || PALETTE.gold, R = rand(7);
      const P = Array.from({ length: 80 }, () => ({ a: R() * Math.PI * 2, v: (240 + R() * 380) * k, s: (4 + R() * 5) * Math.max(0.8, k), c: colors[Math.floor(R() * colors.length)] }));
      function draw(t) {
        ctx.clearRect(0, 0, W, H);
        if (t <= 0 || t >= T.life) return;
        ctx.globalAlpha = 0.6 * (t > T.life - 0.3 ? (T.life - t) / 0.3 : 1);
        for (const p of P) {
          const x = W / 2 + Math.cos(p.a) * p.v * t, y = H / 2 + Math.sin(p.a) * p.v * t + 300 * k * t * t;
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(x, y, (p.s * (1 - 0.6 * t / T.life)) / 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      function apply(t) {
        const pa = cubicIn(seg(t, T.a, T.aDur));
        A.style.transform = `scale(${1 - 0.8 * pa})`;
        A.style.opacity = String(1 - pa);
        const eb = t <= T.b ? 0 : backOut(seg(t, T.b, T.bDur));
        Bm.style.transform = `scale(${0.2 + 0.8 * eb})`;
        Bm.style.opacity = String(clamp(eb));
        NA.style.opacity = String(1 - quadIn(seg(t, T.na, T.naDur)));
        NB.style.opacity = String(quadOut(seg(t, T.nb, T.nbDur)));
        draw(t - T.burst);
      }
      let raf = 0, t0 = 0, done = false;
      const finish = () => { cancelAnimationFrame(raf); apply(END); done = true; };
      if (typeof o.at === 'number') { apply(o.at); done = true; }
      else if (reduce) finish();
      else {
        apply(0);
        const loop = (now) => {
          if (!t0) t0 = now;
          const t = (now - t0) / 1000;
          apply(t);
          if (t < END) raf = requestAnimationFrame(loop); else done = true;
        };
        raf = requestAnimationFrame(loop);
      }
      const close = () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); bg.remove(); resolve(); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
      document.addEventListener('keydown', onKey);
      q('.tu-ok').addEventListener('click', close);
      // 버튼 밖을 누르면 끝 장면으로 건너뜀
      bg.addEventListener('click', (e) => { if (!e.target.closest('.tu-ok') && !done) finish(); });
      setTimeout(() => { const b = q('.tu-ok'); if (b) b.focus({ preventScroll: true }); }, 50);
    });
  }
  window.TierUp = { play };
})();
