/* 오목판 캔버스 렌더러 (반응형, 고해상도, 터치 지원) */
(function () {
  const N = 15;
  const STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

  class BoardView {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({ interactive: false, onTap: null, mini: false, labels: false }, opts);
      this.state = { moves: [], forbidden: [], ghost: -1, ghostColor: 1, numbers: false };
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      if (this.opts.interactive) {
        canvas.addEventListener('pointerdown', (e) => {
          if (!this.opts.onTap) return;
          const i = this.hit(e);
          if (i >= 0) { e.preventDefault(); this.opts.onTap(i); }
        });
      }
      this.resize();
    }
    destroy() { this.ro.disconnect(); }
    resize() {
      const rect = this.cv.getBoundingClientRect();
      const size = Math.max(60, Math.floor(Math.min(rect.width, rect.height || rect.width)));
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      if (this.cv.width !== Math.round(size * dpr)) {
        this.cv.width = Math.round(size * dpr);
        this.cv.height = Math.round(size * dpr);
      }
      this.size = size;
      this.dpr = dpr;
      this.draw();
    }
    geom() {
      const pad = this.opts.labels ? this.size * 0.06 : this.size * 0.045;
      const cell = (this.size - pad * 2) / (N - 1);
      return { pad, cell };
    }
    hit(e) {
      const rect = this.cv.getBoundingClientRect();
      const scale = this.size / rect.width;
      const x = (e.clientX - rect.left) * scale, y = (e.clientY - rect.top) * scale;
      const { pad, cell } = this.geom();
      const c = Math.round((x - pad) / cell), r = Math.round((y - pad) / cell);
      if (r < 0 || r >= N || c < 0 || c >= N) return -1;
      const dx = x - (pad + c * cell), dy = y - (pad + r * cell);
      if (Math.hypot(dx, dy) > cell * 0.62) return -1;
      return r * N + c;
    }
    set(patch) { Object.assign(this.state, patch); this.draw(); }
    draw() {
      const { ctx, size, dpr } = this;
      if (!size) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { pad, cell } = this.geom();
      // 나무판
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#eecb8a');
      g.addColorStop(0.5, '#e2b56d');
      g.addColorStop(1, '#d6a45a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // 나뭇결
      if (!this.opts.mini) {
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = '#7a4a12';
        for (let i = 0; i < 26; i++) {
          ctx.lineWidth = 1 + (i % 3);
          ctx.beginPath();
          const y0 = (i / 26) * size + Math.sin(i * 1.7) * 6;
          ctx.moveTo(0, y0);
          ctx.bezierCurveTo(size * 0.3, y0 + 10 * Math.sin(i), size * 0.7, y0 - 10 * Math.cos(i), size, y0 + 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // 격자
      ctx.strokeStyle = 'rgba(60,35,10,.78)';
      ctx.lineWidth = Math.max(0.6, cell * 0.035);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const p = pad + i * cell;
        ctx.moveTo(pad, p); ctx.lineTo(pad + cell * (N - 1), p);
        ctx.moveTo(p, pad); ctx.lineTo(p, pad + cell * (N - 1));
      }
      ctx.stroke();
      ctx.lineWidth = Math.max(1, cell * 0.07);
      ctx.strokeRect(pad, pad, cell * (N - 1), cell * (N - 1));
      ctx.fillStyle = 'rgba(60,35,10,.9)';
      for (const [r, c] of STARS) {
        ctx.beginPath();
        ctx.arc(pad + c * cell, pad + r * cell, Math.max(1.5, cell * 0.11), 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.opts.labels) {
        ctx.fillStyle = 'rgba(60,35,10,.65)';
        ctx.font = `600 ${Math.max(8, cell * 0.32)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < N; i++) {
          ctx.fillText(String.fromCharCode(65 + i), pad + i * cell, pad * 0.42);
          ctx.fillText(String(N - i), pad * 0.42, pad + i * cell);
        }
      }
      const { moves, forbidden, ghost, ghostColor, numbers } = this.state;
      // 금수 표시
      for (const f of forbidden || []) {
        const r = Math.floor(f.i / N), c = f.i % N;
        const x = pad + c * cell, y = pad + r * cell, s = cell * 0.2;
        ctx.strokeStyle = 'rgba(200,30,40,.85)';
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.beginPath();
        ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
        ctx.stroke();
      }
      // 돌 (이긴 다섯 돌 표시는 판 위에 겹친 둘레선 — app.js winRing)
      (moves || []).forEach((m, k) => {
        const r = Math.floor(m / N), c = m % N;
        this.stone(pad + c * cell, pad + r * cell, cell * 0.46, k % 2 === 0 ? 1 : 2, 1);
        if (numbers && !this.opts.mini) {
          ctx.fillStyle = k % 2 === 0 ? '#fff' : '#111';
          ctx.font = `700 ${cell * 0.36}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), pad + c * cell, pad + r * cell + 1);
        }
      });
      // 마지막 수
      if (moves && moves.length && !numbers) {
        const m = moves[moves.length - 1];
        const r = Math.floor(m / N), c = m % N;
        ctx.fillStyle = '#ff3b4d';
        ctx.beginPath();
        ctx.arc(pad + c * cell, pad + r * cell, Math.max(2, cell * 0.13), 0, Math.PI * 2);
        ctx.fill();
      }
      // 미리보기 돌
      if (ghost >= 0) {
        const r = Math.floor(ghost / N), c = ghost % N;
        this.stone(pad + c * cell, pad + r * cell, cell * 0.46, ghostColor, 0.55);
        ctx.strokeStyle = '#1f7aff';
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.beginPath();
        ctx.arc(pad + c * cell, pad + r * cell, cell * 0.52, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    stone(x, y, rad, color, alpha) {
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      if (!this.opts.mini) {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath();
        ctx.arc(x + rad * 0.12, y + rad * 0.16, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
      if (color === 1) { g.addColorStop(0, '#6b6b72'); g.addColorStop(0.45, '#1d1d22'); g.addColorStop(1, '#050507'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eceae4'); g.addColorStop(1, '#c4c0b6'); }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  window.BoardView = BoardView;
})();
