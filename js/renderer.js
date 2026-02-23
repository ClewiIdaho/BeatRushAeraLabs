// ── Renderer ──────────────────────────────────────────────────
// All canvas drawing: background, highway, arrow notes, HUD, effects

// roundRect polyfill for older browsers
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    if (r <= 0 || w <= 0 || h <= 0) { this.rect(x, y, w, h); return; }
    const mr = Math.min(r, w / 2, h / 2);
    this.moveTo(x + mr, y);
    this.arcTo(x + w, y, x + w, y + h, mr);
    this.arcTo(x + w, y + h, x, y + h, mr);
    this.arcTo(x, y + h, x, y, mr);
    this.arcTo(x, y, x + w, y, mr);
    this.closePath();
  };
}

import { lerp, hsl, clamp } from './utils.js';

// Lane colors: cyan, magenta, green, amber
const COLS  = ['#00f0ff', '#ff00ff', '#00ff88', '#ffaa00'];
const COLS2 = ['#007799', '#990099', '#009944', '#996600'];
const COLSG = ['#00ccff', '#cc00ff', '#00dd66', '#ff8800'];
const KEY_LABELS = ['\u2190  A', '\u2191  W', '\u2193  S', '\u2192  D'];

// Arrow rotations: lane → rotation (arrow base shape points UP)
// Lane 0=left, 1=up, 2=down, 3=right
const ARROW_ROT = [-Math.PI / 2, 0, Math.PI, Math.PI / 2];

// Background elements (generated once)
const stars = [];
for (let i = 0; i < 150; i++) {
  stars.push({
    x: Math.random(), y: Math.random(),
    sz: 0.2 + Math.random() * 2,
    spd: 0.15 + Math.random() * 0.6,
    hue: Math.random() * 360,
    tw: 0.8 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
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
    this._displayScore = 0; // interpolated score for smooth counting
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

  // ── Arrow path builder (points UP, centered at origin) ────

  _arrowPath(ctx, sz) {
    const w = sz * 0.88;
    const h = sz * 0.88;
    const shaftW = w * 0.32;
    const headH = h * 0.50;

    ctx.beginPath();
    ctx.moveTo(0, -h / 2);                   // tip
    ctx.lineTo(w / 2, -h / 2 + headH);       // head right
    ctx.lineTo(shaftW / 2, -h / 2 + headH);  // shaft top-right
    ctx.lineTo(shaftW / 2, h / 2);            // shaft bottom-right
    ctx.lineTo(-shaftW / 2, h / 2);           // shaft bottom-left
    ctx.lineTo(-shaftW / 2, -h / 2 + headH); // shaft top-left
    ctx.lineTo(-w / 2, -h / 2 + headH);      // head left
    ctx.closePath();
  }

  // Simplified arrow for small sizes (just the chevron head)
  _arrowPathSmall(ctx, sz) {
    const w = sz * 0.9;
    const h = sz * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(0, h / 4);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  }

  // ── Falling arrow note ────────────────────────────────────

  drawArrow(ctx, x, y, size, lane, glowIntensity) {
    const c = COLS[lane];
    const c2 = COLS2[lane];
    const cg = COLSG[lane];
    const sz = size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ARROW_ROT[lane]);

    // Outer neon glow
    if (glowIntensity > 0) {
      ctx.shadowColor = c;
      ctx.shadowBlur = 12 + glowIntensity * 22;
    }

    // Build path (simplified at small sizes for readability)
    if (sz < 16) {
      this._arrowPathSmall(ctx, sz);
    } else {
      this._arrowPath(ctx, sz);
    }

    // Main gradient fill (glassmorphic: lighter center, darker edges)
    const hw = sz * 0.44;
    const grad = ctx.createLinearGradient(-hw, -hw, hw, hw);
    grad.addColorStop(0, c2);
    grad.addColorStop(0.3, c);
    grad.addColorStop(0.7, cg);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Glass highlight on upper portion
    if (sz >= 16) {
      ctx.save();
      ctx.clip();
      const hl = ctx.createLinearGradient(0, -sz / 2, 0, 0);
      hl.addColorStop(0, 'rgba(255,255,255,0.42)');
      hl.addColorStop(0.45, 'rgba(255,255,255,0.12)');
      hl.addColorStop(1, 'transparent');
      ctx.fillStyle = hl;
      ctx.fillRect(-sz, -sz, sz * 2, sz);
      ctx.restore();
    }

    // Crisp border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // ── Target arrow at hit zone (glass receptor) ─────────────

  drawTargetArrow(ctx, x, y, lane, flash, t) {
    const c = COLS[lane];
    const sz = 30;

    // Constant subtle idle pulse
    const pulse = 0.15 + Math.sin(t * 0.004 + lane * 1.5) * 0.06;
    const scale = 1 + flash * 0.15;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.rotate(ARROW_ROT[lane]);

    this._arrowPath(ctx, sz);

    if (flash > 0.05) {
      // Bright fill on hit
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.25 + flash * 0.75;
      ctx.shadowColor = c;
      ctx.shadowBlur = 20 + flash * 25;
      ctx.fill();
    } else {
      // Faint glass fill
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.03;
      ctx.fill();
    }

    // Border (always visible)
    ctx.shadowBlur = 0;
    ctx.globalAlpha = pulse + flash * 0.6 + 0.12;
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Radial flash glow
    if (flash > 0.05) {
      ctx.save();
      ctx.globalAlpha = flash * 0.6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
      g.addColorStop(0, c + '66');
      g.addColorStop(0.4, c + '22');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(x - 70, y - 70, 140, 140);
      ctx.restore();
    }
  }

  // ── Background (space scene) ──────────────────────────────

  drawBackground(ctx, W, H, t, intensity) {
    const bg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.5, W);
    bg.addColorStop(0, 'rgba(18,15,42,1)');
    bg.addColorStop(0.4, 'rgba(10,10,26,1)');
    bg.addColorStop(1, 'rgba(5,3,12,1)');
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

    // Stars with sine-wave wandering (perlin-like)
    for (const s of stars) {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.001 * s.tw + s.phase));
      const sx = (s.x * W + Math.sin(t * 0.0002 * s.spd + s.phase) * 12 + t * s.spd * 0.015) % W;
      const sy = s.y * H + Math.cos(t * 0.00015 * s.tw + s.phase * 2) * 6;
      ctx.save();
      ctx.globalAlpha = tw * 0.65 * intensity;
      ctx.fillStyle = hsl(s.hue, 60, 80);
      ctx.shadowColor = hsl(s.hue, 80, 70);
      ctx.shadowBlur = s.sz * 2.5;
      ctx.beginPath();
      ctx.arc(sx, clamp(sy, 0, H), s.sz, 0, Math.PI * 2);
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
    ctx.globalAlpha = 0.012 * intensity;
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
    ctx.globalAlpha = 0.018;
    for (let y = 0; y < H; y += 3) {
      if (y % 6 < 3) {
        ctx.fillStyle = 'rgba(255,255,255,.012)';
        ctx.fillRect(0, y, W, 1.5);
      }
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

  // ── Highway (3D perspective) ──────────────────────────────

  drawHighway(ctx, W, H, t, beatPulse, energy, effects) {
    const cx = W / 2;
    const vy = H * 0.04;
    const hy = H * 0.82;
    const tw = W * 0.055;
    const bw = W * 0.35;
    const hl = hy - vy;
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
    ctx.shadowBlur = 50 + bp * 30 + bassE * 20;
    ctx.fillStyle = 'rgba(3,1,15,0.97)';
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
    hg.addColorStop(0, 'rgba(12,5,40,0.97)');
    hg.addColorStop(0.5, `rgba(${16 + bp * 20 + bassE * 12},${8 + bp * 12},${50 + bp * 25},0.96)`);
    hg.addColorStop(1, 'rgba(12,5,40,0.97)');
    ctx.fillStyle = hg;
    ctx.fill();

    // Surface sheen (top)
    ctx.save();
    ctx.clip();
    const gl = ctx.createLinearGradient(0, vy, 0, vy + hl * 0.2);
    gl.addColorStop(0, 'rgba(120,80,255,0.05)');
    gl.addColorStop(1, 'transparent');
    ctx.fillStyle = gl;
    ctx.fillRect(cx - bw, vy, bw * 2, hl * 0.2);
    ctx.restore();
    ctx.restore();

    // Edge neon borders
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx + s * tw, vy);
      ctx.lineTo(cx + s * bw, hy);
      const ec = ctx.createLinearGradient(0, vy, 0, hy);
      ec.addColorStop(0, hsl(280, 100, 60, 0.15));
      ec.addColorStop(0.5, hsl(200, 100, 60, 0.45 + bp * 0.3));
      ec.addColorStop(1, hsl(180, 100, 60, 0.55 + bp * 0.3));
      ctx.strokeStyle = ec;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 14 + bp * 10;
      ctx.stroke();
      ctx.restore();

      // Feathered bloom
      ctx.beginPath();
      ctx.moveTo(cx + s * tw, vy);
      ctx.lineTo(cx + s * bw, hy);
      ctx.strokeStyle = 'rgba(0,240,255,0.03)';
      ctx.lineWidth = 14;
      ctx.stroke();
    }

    // Combo fire along edges
    if (effects.comboFire > 0) {
      const fi = effects.comboFire;
      for (let s = -1; s <= 1; s += 2) {
        ctx.save();
        for (let i = 0; i < 15; i++) {
          const p = 0.5 + Math.sin(t * 0.008 + i * 0.7) * 0.1 + i * 0.03;
          if (p > 1 || p < 0) continue;
          const y = vy + hl * p;
          const w = lerp(tw, bw, p);
          const ex = cx + s * w;
          const radius = 10 + Math.sin(t * 0.012 + i) * 5;
          ctx.globalAlpha = fi * (1 - Math.abs(p - 0.7)) * 0.3;
          const fg = ctx.createRadialGradient(ex, y, 0, ex, y, radius);
          fg.addColorStop(0, fi > 0.5 ? '#ffaa00' : '#ff6600');
          fg.addColorStop(0.5, '#ff440066');
          fg.addColorStop(1, 'transparent');
          ctx.fillStyle = fg;
          ctx.fillRect(ex - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
      }
    }

    // Flowing grid lines (perspective speed effect)
    for (let i = 0; i < 30; i++) {
      let p = ((t * 0.00042 + i / 30) % 1);
      const pp = Math.pow(p, 1.8);
      const y = vy + hl * pp;
      const w = lerp(tw, bw, pp);
      ctx.beginPath();
      ctx.moveTo(cx - w, y);
      ctx.lineTo(cx + w, y);
      ctx.strokeStyle = hsl(260, 60, 50, 0.015 + pp * 0.07);
      ctx.lineWidth = 0.4 + pp * 0.8;
      ctx.stroke();
    }

    // Lane dividers (visible glowing lines)
    for (let i = 1; i < 4; i++) {
      const f = i / 4;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - tw + f * tw * 2, vy);
      ctx.lineTo(cx - bw + f * bw * 2, hy);
      const lc = ctx.createLinearGradient(0, vy, 0, hy);
      lc.addColorStop(0, hsl(260, 60, 55, 0.04));
      lc.addColorStop(0.4, hsl(260, 60, 55, 0.14));
      lc.addColorStop(0.8, hsl(260, 60, 55, 0.12));
      lc.addColorStop(1, hsl(260, 60, 55, 0.08));
      ctx.strokeStyle = lc;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // Hit zone line (BPM-synced pulse)
    ctx.save();
    const hzg = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    hzg.addColorStop(0, 'transparent');
    hzg.addColorStop(0.12, hsl(180, 100, 60, 0.2 + bp * 0.2));
    hzg.addColorStop(0.5, hsl(180, 100, 70, 0.45 + bp * 0.35));
    hzg.addColorStop(0.88, hsl(180, 100, 60, 0.2 + bp * 0.2));
    hzg.addColorStop(1, 'transparent');
    ctx.fillStyle = hzg;
    ctx.fillRect(cx - bw, hy - 4, bw * 2, 8);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18 + bp * 14;
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
      const sz = 10 + 26 * pp;

      // Glow intensifies as note approaches hit zone
      const glowI = Math.pow(pp, 2);

      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 3.5);

      // Note trail (light streak behind the arrow)
      if (pp > 0.1) {
        ctx.save();
        ctx.globalAlpha = pp * 0.22;
        const tg = ctx.createLinearGradient(0, y - 40 * pp, 0, y);
        tg.addColorStop(0, 'transparent');
        tg.addColorStop(1, COLS[n.lane]);
        ctx.fillStyle = tg;
        ctx.fillRect(nx - 3.5 * pp, y - 40 * pp, 7 * pp, 40 * pp);
        ctx.restore();
      }

      this.drawArrow(ctx, nx, y, sz, n.lane, glowI);
      ctx.restore();
    }
  }

  // ── Target Arrows & Lane Flashes ──────────────────────────

  drawTargets(ctx, hw, flashes, t) {
    const { cx, vy, hy, bw, hl } = hw;

    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      const fl = flashes[i];
      const tx = cx - bw + f * bw * 2;

      this.drawTargetArrow(ctx, tx, hy, i, fl, t);

      // Full lane beam on flash
      if (fl > 0.05) {
        ctx.save();
        ctx.globalAlpha = fl * 0.15;
        const bm = ctx.createLinearGradient(0, vy, 0, hy);
        bm.addColorStop(0, 'transparent');
        bm.addColorStop(0.6, COLS[i]);
        bm.addColorStop(1, COLS[i]);
        ctx.fillStyle = bm;
        ctx.fillRect(tx - 5, vy, 10, hl);
        ctx.restore();
      }
    }
  }

  // ── Judgment Text ─────────────────────────────────────────

  drawJudgment(ctx, judg, judgTime, now, cx, hy) {
    if (!judg || now - judgTime > 700) return;
    const a = (now - judgTime) / 700;
    const colors = { PERFECT: '#ffd700', GREAT: '#00f0ff', GOOD: '#00ff88', MISS: '#ff4466' };
    const scale = 1 + (1 - a) * 0.5;

    ctx.save();
    ctx.globalAlpha = 1 - a * a;
    ctx.translate(cx, hy + 48 - a * 28);
    ctx.scale(scale, scale);
    ctx.fillStyle = colors[judg] || '#fff';
    ctx.font = "bold 24px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = colors[judg] || '#fff';
    ctx.shadowBlur = 28;
    ctx.fillText(judg, 0, 0);
    ctx.restore();
  }

  // ── HUD (score, combo, HP, progress) ──────────────────────

  drawHUD(ctx, W, H, state, hw) {
    const { cx, hy, bw } = hw;

    // Smooth score interpolation
    const scoreDiff = state.score - this._displayScore;
    this._displayScore += scoreDiff * 0.12;
    if (Math.abs(scoreDiff) < 1) this._displayScore = state.score;
    const displayScore = Math.round(this._displayScore);

    // Score
    ctx.save();
    ctx.fillStyle = 'rgba(0,240,255,0.45)';
    ctx.font = "600 9px 'Exo 2', monospace";
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 16, 18);
    ctx.fillStyle = '#fff';
    ctx.font = "700 24px 'Orbitron', monospace";
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillText(displayScore.toLocaleString(), 16, 43);
    ctx.restore();

    // Combo
    if (state.combo > 1) {
      const comboScale = state.combo >= 100 ? 1.15 : state.combo >= 50 ? 1.08 : state.combo >= 25 ? 1.03 : 1;
      const comboColor = state.combo >= 100 ? '#ffd700' : state.combo >= 50 ? '#ff00ff' : '#ffaa00';

      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = comboColor + '77';
      ctx.font = "600 9px 'Exo 2', monospace";
      ctx.fillText('COMBO', W - 16, 18);
      ctx.fillStyle = comboColor;
      const comboFontSz = Math.min(34, 20 + state.combo * 0.25) * comboScale;
      ctx.font = `700 ${comboFontSz}px 'Orbitron', monospace`;
      ctx.shadowColor = comboColor;
      ctx.shadowBlur = 14;
      ctx.fillText(state.combo + 'x', W - 16, 44);
      ctx.restore();
    }

    // Multiplier
    const mult = 1 + Math.floor(state.combo / 10);
    if (mult > 1) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#00ff88';
      ctx.font = "700 11px 'Exo 2', monospace";
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 8;
      ctx.fillText(mult + 'x MULT', W - 16, 62);
      ctx.restore();
    }

    // Energy bar
    const hbW = 140, hbH = 7, hbX = cx - 70, hbY = 10;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(hbX, hbY, hbW, hbH, 3.5);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();

    const hpPct = state.hp / 100;
    const hc = state.hp > 50 ? '#00f0ff' : state.hp > 25 ? '#ffaa00' : '#ff4466';
    const hpG = ctx.createLinearGradient(hbX, hbY, hbX + hbW * hpPct, hbY + hbH);
    hpG.addColorStop(0, hc);
    hpG.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    hpG.addColorStop(1, hc);

    if (hpPct > 0.01) {
      ctx.beginPath();
      ctx.roundRect(hbX, hbY, hbW * hpPct, hbH, 3.5);
      ctx.fillStyle = hpG;
      ctx.shadowColor = hc;
      ctx.shadowBlur = 10;
      ctx.fill();

      // HP shine
      ctx.beginPath();
      ctx.roundRect(hbX, hbY, hbW * hpPct, hbH / 2, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.font = "300 7px 'Exo 2', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('ENERGY', cx, hbY + hbH + 12);

    // Song progress bar (top, full width, thin gradient)
    if (state.songDuration > 0) {
      const prog = clamp(state.songElapsed / (state.songDuration * 1000), 0, 1);
      const pbY = 2, pbH = 3;
      const pbW = W - 40;
      const pbX = 20;

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(pbX, pbY, pbW, pbH);

      const pg = ctx.createLinearGradient(pbX, 0, pbX + pbW * prog, 0);
      pg.addColorStop(0, '#00f0ff');
      pg.addColorStop(1, '#ff00ff');
      ctx.fillStyle = pg;
      ctx.fillRect(pbX, pbY, pbW * prog, pbH);

      // Glowing leading edge
      if (prog > 0.01) {
        ctx.save();
        const lx = pbX + pbW * prog;
        const lg = ctx.createRadialGradient(lx, pbY + 1.5, 0, lx, pbY + 1.5, 8);
        lg.addColorStop(0, 'rgba(255,0,255,0.6)');
        lg.addColorStop(1, 'transparent');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - 8, pbY - 4, 16, 12);
        ctx.restore();
      }
      ctx.restore();
    }

    // Key labels below highway (fade after 8 seconds)
    const keyFade = state.songElapsed < 6000 ? 1 : state.songElapsed < 8000 ? 1 - (state.songElapsed - 6000) / 2000 : 0;
    if (keyFade > 0) {
      ctx.save();
      ctx.globalAlpha = keyFade * 0.4;
      ctx.font = "300 9px 'Exo 2', monospace";
      for (let i = 0; i < 4; i++) {
        const f = (i + 0.5) / 4;
        ctx.fillStyle = COLS[i];
        ctx.textAlign = 'center';
        ctx.fillText(KEY_LABELS[i], cx - bw + f * bw * 2, hy + 66);
      }
      ctx.restore();
    }
  }

  // ── Song title overlay ────────────────────────────────────

  drawSongTitle(ctx, W, title, elapsed) {
    if (elapsed > 5000) return;
    const alpha = elapsed < 3000 ? 1 : 1 - (elapsed - 3000) / 2000;
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = "700 13px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillText(title, W / 2, 58);
    ctx.restore();
  }
}
