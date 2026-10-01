/* 모션 — awesome-ai-motion에서 고른 조합. 길이는 웹 화면에 맞춰 줄임 (버튼 0.1초, 짧은 이동 0.18~0.3초, 숫자 0.4~0.5초)
   · 화면 전환  exit-before-enter → fade-slide + stagger : 앞 화면이 위로 12px 빠진 뒤(0.18초) 새 화면이 16px 아래에서 차례로 떠오름(0.3초, 0.04초 간격)
   · 버튼       cursor-click : 0.1초에 0.96배로 눌리고 0.2초에 돌아옴 + 버튼 안에서만 번지는 자국 0.45초
   · 안 될 때   shake : 6px에서 0.6배씩 줄며 4번, 0.6초 — 이유 문구와 함께
   · 결과 장면  circumscribe(둘레선) · modal-lift(창이 떠오름) · stamp-impact(낙관) · count-up(점수)
   기기의 「동작 줄이기」가 켜져 있거나 화면이 가려져 있으면 on()이 false — 부르는 쪽에서 움직임 없이 결과만 보여 줌 */
(function () {
  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const on = () => !reduce.matches && !document.hidden && !!Element.prototype.animate;
  // GSAP 이징과 같은 곡선 (power2 = 3제곱, power3 = 4제곱, power4 = 5제곱)
  const EASE = {
    in2: 'cubic-bezier(.32, 0, .67, 0)', out2: 'cubic-bezier(.33, 1, .68, 1)', inOut2: 'cubic-bezier(.65, 0, .35, 1)',
    out3: 'cubic-bezier(.25, 1, .5, 1)', in4: 'cubic-bezier(.64, 0, .78, 0)', out1: 'cubic-bezier(.5, 1, .89, 1)', sine: 'cubic-bezier(.37, 0, .63, 1)',
  };
  const running = (a) => !!a && a.playState === 'running';

  /* ── 화면 전환 ── */
  // 퇴장: 위로 12px 빠지며 사라짐. 끝 모습으로 멈춰 있으므로 화면을 바꾼 뒤 cancel()
  function out(els) {
    return els.map((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px)' }], { duration: 180, easing: EASE.in2, fill: 'forwards' }));
  }
  // 등장: 16px 아래에서 떠오름, 요소마다 0.04초 간격(9번째부터는 함께).
  // skip(ms)은 장면이 시작된 뒤 흐른 시간 — 화면이 다시 그려져 새로 생긴 요소가 그 시점부터 이어서 움직이게
  const GAP = 40, RISE = 300, MAX_STEP = 8;
  const rising = new WeakMap();
  function rise(els, skip) {
    els.forEach((el, i) => {
      if (running(rising.get(el)) || !el.getClientRects().length) return;
      const a = el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: RISE, delay: Math.min(i, MAX_STEP) * GAP, easing: EASE.out2, fill: 'backwards' });
      if (skip) a.currentTime = skip;
      rising.set(el, a);
    });
  }
  function fade(el, from, to, ms, hold) {
    return el.animate([{ opacity: from }, { opacity: to }], { duration: ms, fill: hold ? 'forwards' : 'none' });
  }

  /* ── 버튼 ── */
  const PRESS = '.btn, .mode-btn, .pick-item, .seg button, .tabs button';
  // 번지는 자국: 누른 자리에서 퍼지되 버튼 밖으로 나가지 않음 (옆 버튼까지 누른 것처럼 보이지 않게). 크기는 버튼에 비례
  function ripple(el, x, y) {
    if (!on()) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    if (x == null) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
    const d = Math.max(r.width, r.height) / 4.5;
    const clip = document.createElement('span');
    clip.className = 'fx-rip';
    clip.innerHTML = `<i style="left:${x - r.left}px;top:${y - r.top}px;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px"></i>`;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.classList.add('fx-host');
    el.appendChild(clip);
    // 자국은 글자색 — 짙은 버튼의 밝은 자국보다 밝은 버튼의 먹빛 자국이 더 눈에 띄므로 옅게
    const [cr, cg, cb] = (cs.color.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    const ink = (cr * 299 + cg * 587 + cb * 114) / 1000 < 150;
    const a = clip.firstChild.animate([{ transform: 'scale(.3)', opacity: ink ? 0.2 : 0.35 }, { transform: 'scale(6)', opacity: 0 }], { duration: 450, easing: EASE.out2 });
    a.onfinish = a.oncancel = () => clip.remove();
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.isPrimary === false || e.button > 0 || !(e.target instanceof Element)) return;
    const el = e.target.closest(PRESS);
    if (!el) { const d = disabledAt(e); if (d) deny(d); return; }
    if (el.disabled) return;
    const x = e.clientX, y = e.clientY;
    let t0 = 0;
    const start = () => { if (t0) return; t0 = performance.now(); el.classList.add('fx-press'); ripple(el, x, y); };
    // 손가락은 화면을 밀려고 댄 것일 수 있으므로 조금 기다렸다가 반응 (그 전에 떼면 바로)
    const timer = e.pointerType === 'touch' ? setTimeout(start, 70) : 0;
    if (!timer) start();
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      clearTimeout(timer);
      if (ev.type === 'pointerup') start();
      // 짧게 톡 눌러도 눌린 모습이 0.1초는 보이게
      if (t0) setTimeout(() => el.classList.remove('fx-press'), Math.max(0, 100 - (performance.now() - t0)));
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  }, true);
  // 키보드로 누른 버튼(Enter·Space)은 가운데에서 번짐
  document.addEventListener('click', (e) => {
    if (e.detail !== 0 || !(e.target instanceof Element)) return;
    const el = e.target.closest(PRESS);
    if (el && !el.disabled) ripple(el);
  }, true);

  /* ── 안 되는 동작 ── */
  const shaking = new WeakMap();
  function shake(el) {
    if (!el || !on() || running(shaking.get(el))) return;
    shaking.set(el, el.animate([0, 6, -6, 3.6, -3.6, 2.2, -2.2, 1.3, 0].map((x) => ({ transform: `translateX(${x}px)`, easing: EASE.sine })), { duration: 600 }));
  }
  // 꺼진 버튼은 누름이 뒤로 통과하므로(css: button:disabled) 누른 자리에 꺼진 버튼이 있는지 직접 찾음
  function disabledAt(e) {
    const t = e.target, x = e.clientX, y = e.clientY;
    const inside = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    for (const b of document.querySelectorAll('button:disabled')) {
      if (!t.contains(b) || !inside(b)) continue;
      // 스크롤 영역 밖으로 잘려 보이지 않는 버튼은 제외
      let a = b.parentElement;
      while (a && a !== t && (!a.getClientRects().length || inside(a))) a = a.parentElement;
      if (a === t) return b;
    }
    return null;
  }
  // 흔들고, 이유(data-why)가 있으면 알림으로 보여 줌 — 움직임만으로 알리지 않게
  function deny(el) {
    shake(el);
    const why = el.dataset.why, root = document.getElementById('toast-root');
    if (!why || !window.App || (root && [...root.children].some((c) => c.textContent === why))) return;
    window.App.toast(why);
  }

  /* ── 결과 장면 ── */
  // 둘레선이 그려짐 (circumscribe): 길이 len인 선을 0.6초에
  function draw(el, len, delay) {
    return el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 600, delay, easing: EASE.inOut2, fill: 'backwards' });
  }
  // 배경이 어두워짐
  function dim(el, ms) {
    return el.animate([{ backgroundColor: 'transparent' }, { backgroundColor: getComputedStyle(el).backgroundColor }], { duration: ms });
  }
  // 창이 떠오름 (modal-lift): 32px 아래·0.96배에서 0.4초
  function lift(el) {
    return el.animate([{ opacity: 0, transform: 'translateY(32px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: EASE.out3 });
  }
  // 창이 조용히 내려앉음 (fade-slide): 18px 위에서 0.5초
  function settle(el, delay) {
    return el.animate([{ opacity: 0, transform: 'translateY(-18px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay, easing: EASE.out2, fill: 'backwards' });
  }
  // 낙관이 찍힘 (stamp-impact): 1.2배에서 0.18초에 내려찍고, 닿는 순간 창이 2px씩 세 번 떨리고 낙관이 2% 눌렸다 펴짐
  function stamp(seal, card, delay) {
    const base = getComputedStyle(seal).transform, rest = base === 'none' ? '' : base + ' ';
    seal.animate([{ opacity: 0, transform: rest + 'scale(1.2)' }, { opacity: 1, transform: rest + 'scale(1)' }], { duration: 180, delay, easing: EASE.in4, fill: 'backwards' });
    card.animate([{ transform: 'none' }, { transform: 'translate(2px, -2px)' }, { transform: 'translate(-2px, 2px)' }, { transform: 'none' }], { duration: 100, delay: delay + 180 });
    seal.animate([{ transform: rest + 'scale(1, 1)' }, { transform: rest + 'scale(1, .98)', offset: 0.29 }, { transform: rest + 'scale(1, 1)' }], { duration: 140, delay: delay + 180 });
  }
  // 낙관이 번지듯 나타남 (충격 없이)
  function seep(el, delay, ms) {
    return el.animate([{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }], { duration: ms, delay, easing: EASE.out1, fill: 'backwards' });
  }
  // 숫자가 오름 (count-up): step(0→1)을 power2.out으로 부름. 끝나면 done()
  function tween(ms, step, done) {
    let t0 = 0;
    const loop = (now) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / ms);
      step(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(loop); else if (done) done();
    };
    requestAnimationFrame(loop);
  }

  window.Fx = { on, out, rise, RISE_MS: RISE + MAX_STEP * GAP, fade, ripple, shake, draw, dim, lift, settle, stamp, seep, tween };
})();
