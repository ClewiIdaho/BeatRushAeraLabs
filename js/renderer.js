// ── Renderer ──────────────────────────────────────────────────
// All canvas drawing: background, highway, notes, HUD, effects

import { lerp, hsl, clamp } from './utils.js';

// Lane colors
const COLS  = ['#00ffff', '#ff00ff', '#00ff66', '#ffaa00'];
const COLS2 = ['#007799', '#990099', '#009933', '#996600'];
const COLSG = ['#00ccff', '#cc00ff', '#00dd55', '#ff8800'];
const KEY_LABELS = ['A / \u2190', 'W / \u2191', 'S / \u2193', 'D / \u2192'];

// Background elements (generated once)
const stars = [];
for (let i = 0; i < 120; i++) {
  stars.push({
    x: Math.random(), y: Math.random(),
    sz: 0.3 + Math.random() * 1.8,
    spd: 0.2 + Math.random() * 0.8,
    hue: Math.random() * 360,
    tw: 1 + Math.random() * 3,
  });
}
const nebulae = [];
for (let i = 0; i < 8; i++) {
  nebulae.push({
    x: 0.1 + Math.random() * 0.8, y: 0.05 + Math.random() * 0.5,
    r: 0.08 + Math.random() * 0.18,
    hue: [200, 280, 320, 180, 260, 300, 220, 340][i],
    dr: 0.3 + Math.random() * 0.5,
    ph: Math.random() * Math.PI * 2,
  });
}

export class Renderer {
  constructor(bgCanvas, gameCanvas) {
    this.bgCv = bgCanvas;
    this.gameCv = gameCanvas;
  }

  resize(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
  }

  // ── Background (space scene) ──────────────────────────────

  drawBackground(ctx, W, H, t, intensity) {
    // Radial gradient base
    const bg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.5, W);
    bg.addColorStop(0, 'rgba(15,5,40,1)');
    bg.addColorStop(0.4, 'rgba(5,2,25,1)');
    bg.addColorStop(1, 'rgba(1,0,8,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Nebulae
    for (const n of nebulae) {
      const nx = n.x * W + Math.sin(t * 0.0003 * n.dr + n.ph) * W * 0.05;
      const ny = n.y * H + Math.cos(t * 0.00025 * n.dr + n.ph) * H * 0.03;
      const nr = n.r * W * (0.9 + Math.sin(t * 0.0004 + n.ph) * 0.1);
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      g.addColorStop(0, hsl(n.hue, 80, 30, 0.06 * intensity));
      g.addColorStop(0.4, hsl(n.hue, 70, 20, 0.03 * intensity));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }

    // Stars
    for (const s of stars) {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.001 * s.tw + s.x * 10));
      const sx = (s.x * W + t * s.spd * 0.02) % W;
      ctx.save();
      ctx.globalAlpha = tw * 0.7 * intensity;
      ctx.fillStyle = hsl(s.hue, 60, 80);
      ctx.shadowColor = hsl(s.hue, 80, 70);
      ctx.shadowBlur = s.sz * 3;
      ctx.beginPath();
      ctx.arc(sx, s.y * H, s.sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shooting stars
    const ss = Math.floor(t / 4000);
    for (let i = 0; i < 3; i++) {
      const sp = (t % (4000 + i * 1300)) / (4000 + i * 1300);
      if (sp > 0.15) continue;
      const sx = ((ss * 137 + i * 431) % 1000) / 1000 * W;
      const sy = ((ss * 89 + i * 277) % 600) / 600 * H * 0.4;
      const ln = 60 + i * 30;
      ctx.save();
      ctx.globalAlpha = (0.15 - sp) * 6 * intensity;
      const g = ctx.createLinearGradient(sx, sy, sx + ln * sp * 10, sy + ln * sp * 5);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, hsl(200 + i * 40, 80, 80));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ln * sp * 10, sy + ln * sp * 5);
      ctx.stroke();
      ctx.restore();
    }

    // Hex grid
    ctx.save();
    ctx.globalAlpha = 0.015 * intensity;
    const hz = 40;
    for (let y = 0; y < H; y += hz * 1.5) {
      for (let x = 0; x < W; x += hz * 1.73) {
        const ox = (Math.floor(y / (hz * 1.5)) % 2) * hz * 0.866;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const ag = Math.PI / 3 * a - Math.PI / 6;
          ctx.lineTo(x + ox + Math.cos(ag) * hz * 0.4, y + Math.sin(ag) * hz * 0.4);
        }
        ctx.closePath();
        ctx.strokeStyle = hsl(220, 60, 50);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Scanlines
    ctx.save();
    ctx.globalAlpha = 0.02;
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = y % 6 < 3 ? 'rgba(255,255,255,.015)' : 'transparent';
      ctx.fillRect(0, y, W, 1.5);
    }
    ctx.restore();
  }

  // ── Background loop (menu/results) ────────────────────────

  drawBGLoop() {
    const ctx = this.bgCv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.bgCv.width / dpr;
    const H = this.bgCv.height / dpr;
    this.drawBackground(ctx, W, H, performance.now(), 0.8);
  }

  // ── Guitar Hero-style gem note ────────────────────────────

  drawGem(ctx, x, y, size, lane, glow, scaleBoost) {
    const c = COLS[lane];
    const c2 = COLS2[lane];
    const cg = COLSG[lane];
    const sz = size * (1 + (scaleBoost || 0));

    ctx.save();
    ctx.translate(x, y);

    // Outer glow
    if (glow) {
      ctx.shadowColor = c;
      ctx.shadowBlur = 25;
    }

    // Diamond shape
    const hw = sz * 0.85;
    const hh = sz * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(0, hh);
    ctx.lineTo(-hw, 0);
    ctx.closePath();

    // Main gradient fill
    const grad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    grad.addColorStop(0, c2);
    grad.addColorStop(0.3, c);
    grad.addColorStop(0.7, cg);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner highlight (top-left shine)
    ctx.save();
    ctx.clip();
    const hl = ctx.createLinearGradient(0, -hh, 0, hh * 0.3);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    hl.addColorStop(1, 'transparent');
    ctx.fillStyle = hl;
    ctx.fillRect(-hw, -hh, hw * 2, hh * 1.3);
    ctx.restore();

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, sz * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Target gem (at hit zone) ──────────────────────────────

  drawTargetGem(ctx, x, y, lane, flash) {
    const c = COLS[lane];
    const size = 22 + flash * 8;

    ctx.save();
    ctx.globalAlpha = 0.2 + flash * 0.8;
    this.drawGem(ctx, x, y, size, lane, flash > 0.15, 0);
    ctx.restore();

    // Flash radial glow
    if (flash > 0) {
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 80);
      g.addColorStop(0, c + Math.floor(flash * 100).toString(16).padStart(2, '0'));
      g.addColorStop(0.4, c + Math.floor(flash * 35).toString(16).padStart(2, '0'));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(x - 80, y - 80, 160, 160);
      ctx.restore();

      // Lane beam
      ctx.save();
      ctx.globalAlpha = flash * 0.2;
      ctx.fillStyle = c;
      ctx.fillRect(x - 5, y - 200, 10, 200);
      ctx.restore();
    }
  }

  // ── Highway (3D perspective) ──────────────────────────────

  drawHighway(ctx, W, H, t, beatPulse, energy, effects) {
    const cx = W / 2;
    const vy = H * 0.04;           // vanishing point Y
    const hy = H * 0.82;           // hit zone Y
    const tw = W * 0.035;          // top width
    const bw = W * 0.3;            // bottom width
    const hl = hy - vy;            // highway length
    const bp = beatPulse;
    const bassE = energy.bass || 0;

    // Outer glow shadow
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - tw - 10, vy - 5);
    ctx.lineTo(cx + tw + 10, vy - 5);
    ctx.lineTo(cx + bw + 15, hy + 12);
    ctx.lineTo(cx - bw - 15, hy + 12);
    ctx.closePath();
    ctx.shadowColor = hsl(260, 100, 60, 0.5 + bp * 0.4 + bassE * 0.3);
    ctx.shadowBlur = 60 + bp * 30 + bassE * 20;
    ctx.fillStyle = 'rgba(3,1,15,0.96)';
    ctx.fill();
    ctx.restore();

    // Highway surface
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - tw, vy);
    ctx.lineTo(cx + tw, vy);
    ctx.lineTo(cx + bw, hy);
    ctx.lineTo(cx - bw, hy);
    ctx.closePath();
    const hg = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    hg.addColorStop(0, 'rgba(8,3,30,0.97)');
    hg.addColorStop(0.5, `rgba(${12 + bp * 18 + bassE * 10},${5 + bp * 10},${40 + bp * 25},0.95)`);
    hg.addColorStop(1, 'rgba(8,3,30,0.97)');
    ctx.fillStyle = hg;
    ctx.fill();

    // Top glow
    ctx.save();
    ctx.clip();
    const gl = ctx.createLinearGradient(0, vy, 0, vy + hl * 0.25);
    gl.addColorStop(0, 'rgba(120,80,255,0.06)');
    gl.addColorStop(1, 'transparent');
    ctx.fillStyle = gl;
    ctx.fillRect(cx - bw, vy, bw * 2, hl * 0.25);
    ctx.restore();
    ctx.restore();

    // Edge lines (neon)
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx + s * tw, vy);
      ctx.lineTo(cx + s * bw, hy);
      const ec = ctx.createLinearGradient(0, vy, 0, hy);
      ec.addColorStop(0, hsl(280, 100, 60, 0.2));
      ec.addColorStop(0.5, hsl(200, 100, 60, 0.5 + bp * 0.3));
      ec.addColorStop(1, hsl(180, 100, 60, 0.6 + bp * 0.3));
      ctx.strokeStyle = ec;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 15 + bp * 10;
      ctx.stroke();
      ctx.restore();

      // Edge glow spread
      ctx.beginPath();
      ctx.moveTo(cx + s * tw, vy);
      ctx.lineTo(cx + s * bw, hy);
      ctx.strokeStyle = 'rgba(0,255,255,0.04)';
      ctx.lineWidth = 12;
      ctx.stroke();
    }

    // Combo fire along edges
    if (effects.comboFire > 0) {
      const fireInt = effects.comboFire;
      for (let s = -1; s <= 1; s += 2) {
        ctx.save();
        for (let i = 0; i < 15; i++) {
          const p = 0.5 + Math.sin(t * 0.008 + i * 0.7) * 0.1 + i * 0.03;
          if (p > 1 || p < 0) continue;
          const y = vy + hl * p;
          const w = lerp(tw, bw, p);
          const ex = cx + s * w;
          const radius = 10 + Math.sin(t * 0.012 + i) * 5;

          ctx.globalAlpha = fireInt * (1 - Math.abs(p - 0.7)) * 0.3;
          const fg = ctx.createRadialGradient(ex, y, 0, ex, y, radius);
          fg.addColorStop(0, fireInt > 0.5 ? '#ffaa00' : '#ff6600');
          fg.addColorStop(0.5, '#ff440066');
          fg.addColorStop(1, 'transparent');
          ctx.fillStyle = fg;
          ctx.fillRect(ex - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
      }
    }

    // Grid lines (flowing towards player)
    const elapsed = t;
    for (let i = 0; i < 30; i++) {
      let p = ((elapsed * 0.00042 + i / 30) % 1);
      const pp = Math.pow(p, 1.8);
      const y = vy + hl * pp;
      const w = lerp(tw, bw, pp);
      ctx.beginPath();
      ctx.moveTo(cx - w, y);
      ctx.lineTo(cx + w, y);
      ctx.strokeStyle = hsl(260, 60, 50, 0.02 + pp * 0.08);
      ctx.lineWidth = 0.5 + pp;
      ctx.stroke();
    }

    // Lane dividers
    for (let i = 1; i < 4; i++) {
      const f = i / 4;
      ctx.beginPath();
      ctx.moveTo(cx - tw + f * tw * 2, vy);
      ctx.lineTo(cx - bw + f * bw * 2, hy);
      ctx.strokeStyle = hsl(260, 50, 50, 0.08);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Hit zone line
    ctx.save();
    const hzg = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    hzg.addColorStop(0, 'transparent');
    hzg.addColorStop(0.15, hsl(180, 100, 60, 0.25 + bp * 0.2));
    hzg.addColorStop(0.5, hsl(180, 100, 70, 0.5 + bp * 0.3));
    hzg.addColorStop(0.85, hsl(180, 100, 60, 0.25 + bp * 0.2));
    hzg.addColorStop(1, 'transparent');
    ctx.fillStyle = hzg;
    ctx.fillRect(cx - bw, hy - 4, bw * 2, 8);
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 20 + bp * 12;
    ctx.fillRect(cx - bw, hy - 1.5, bw * 2, 3);
    ctx.restore();

    return { cx, vy, hy, tw, bw, hl };
  }

  // ── Notes ─────────────────────────────────────────────────

  drawNotes(ctx, notes, elapsed, travelTime, hw) {
    const { cx, vy, hy, tw, bw, hl } = hw;

    for (const n of notes) {
      if (n.hit || n.missed) continue;
      let p = (elapsed - n.t + travelTime) / travelTime;
      if (p < -0.05 || p > 1.15) continue;

      const pp = Math.pow(clamp(p, 0, 1), 1.5);
      const y = vy + hl * pp;
      const w = lerp(tw, bw, pp);
      const lw = (w * 2) / 4;
      const nx = cx - w + n.lane * lw + lw / 2;
      const sz = 9 + 22 * pp;

      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 3.5);

      // Note trail
      if (pp > 0.1) {
        ctx.save();
        ctx.globalAlpha = pp * 0.25;
        const tg = ctx.createLinearGradient(0, y - 40 * pp, 0, y);
        tg.addColorStop(0, 'transparent');
        tg.addColorStop(1, COLS[n.lane]);
        ctx.fillStyle = tg;
        ctx.fillRect(nx - 4 * pp, y - 40 * pp, 8 * pp, 40 * pp);
        ctx.restore();
      }

      this.drawGem(ctx, nx, y, sz, n.lane, true, 0);
      ctx.restore();
    }
  }

  // ── Target Gems & Lane Flashes ────────────────────────────

  drawTargets(ctx, hw, flashes) {
    const { cx, vy, hy, bw, hl } = hw;

    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      const fl = flashes[i];
      const tx = cx - bw + f * bw * 2;

      this.drawTargetGem(ctx, tx, hy, i, fl);

      // Full lane beam on flash
      if (fl > 0) {
        ctx.save();
        ctx.globalAlpha = fl * 0.18;
        const bm = ctx.createLinearGradient(0, vy, 0, hy);
        bm.addColorStop(0, 'transparent');
        bm.addColorStop(0.6, COLS[i]);
        bm.addColorStop(1, COLS[i]);
        ctx.fillStyle = bm;
        ctx.fillRect(tx - 6, vy, 12, hl);
        ctx.restore();
      }
    }
  }

  // ── Judgment Text ─────────────────────────────────────────

  drawJudgment(ctx, judg, judgTime, now, cx, hy) {
    if (!judg || now - judgTime > 700) return;
    const a = (now - judgTime) / 700;
    const colors = { PERFECT: '#0ff', GREAT: '#f0f', GOOD: '#0f6', MISS: '#f24' };
    const scale = 1 + (1 - a) * 0.4;

    ctx.save();
    ctx.globalAlpha = 1 - a * a;
    ctx.translate(cx, hy + 45 - a * 25);
    ctx.scale(scale, scale);
    ctx.fillStyle = colors[judg] || '#fff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = colors[judg] || '#fff';
    ctx.shadowBlur = 30;
    ctx.fillText(judg, 0, 0);
    ctx.restore();
  }

  // ── HUD (score, combo, HP, progress) ──────────────────────

  drawHUD(ctx, W, H, state, hw) {
    const { cx, hy, bw } = hw;

    // Score
    ctx.save();
    ctx.fillStyle = 'rgba(0,255,255,0.6)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 14, 17);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    ctx.fillText(state.score.toLocaleString(), 14, 40);
    ctx.restore();

    // Combo
    if (state.combo > 1) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,170,0,0.6)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('COMBO', W - 14, 17);
      ctx.fillStyle = '#fa0';
      ctx.font = `bold ${Math.min(32, 20 + state.combo * 0.3)}px monospace`;
      ctx.shadowColor = '#fa0';
      ctx.shadowBlur = 12;
      ctx.fillText(state.combo + 'x', W - 14, 42);
      ctx.restore();
    }

    // Multiplier
    const mult = 1 + Math.floor(state.combo / 10);
    if (mult > 1) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f6';
      ctx.font = 'bold 11px monospace';
      ctx.shadowColor = '#0f6';
      ctx.shadowBlur = 8;
      ctx.fillText(mult + 'x MULT', W - 14, 60);
      ctx.restore();
    }

    // Energy bar
    const hbW = 140, hbH = 8, hbX = cx - 70, hbY = 10;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW, hbH, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    const hpPct = state.hp / 100;
    const hc = state.hp > 50 ? '#0ff' : state.hp > 25 ? '#fa0' : '#f24';
    const hpG = ctx.createLinearGradient(hbX, hbY, hbX + hbW * hpPct, hbY + hbH);
    hpG.addColorStop(0, hc);
    hpG.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    hpG.addColorStop(1, hc);

    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW * hpPct, hbH, 4);
    ctx.fillStyle = hpG;
    ctx.shadowColor = hc;
    ctx.shadowBlur = 10;
    ctx.fill();

    // HP shine
    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW * hpPct, hbH / 2, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#446';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ENERGY', cx, hbY + hbH + 12);

    // Song progress bar
    if (state.songDuration > 0) {
      const prog = clamp(state.songElapsed / (state.songDuration * 1000), 0, 1);
      const pbY = hbY + hbH + 20;
      const pbW = 120, pbH = 3, pbX = cx - 60;

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(pbX, pbY, pbW, pbH);
      ctx.fillStyle = 'rgba(0,255,255,0.4)';
      ctx.fillRect(pbX, pbY, pbW * prog, pbH);
      ctx.restore();
    }

    // Key labels under highway
    ctx.font = '9px monospace';
    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      ctx.fillStyle = COLS[i] + '55';
      ctx.textAlign = 'center';
      ctx.fillText(KEY_LABELS[i], cx - bw + f * bw * 2, hy + 68);
    }
  }

  // ── Song title overlay during gameplay ────────────────────

  drawSongTitle(ctx, W, title, elapsed) {
    if (elapsed > 5000) return;
    const alpha = elapsed < 3000 ? 1 : 1 - (elapsed - 3000) / 2000;
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    ctx.fillText(title, W / 2, 65);
    ctx.restore();
  }
}
