// ── Visual Effects Manager ────────────────────────────────────

export class EffectsManager {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.laneFlashes = [0, 0, 0, 0];
    this.screenFlash = 0;
    this.screenShake = { x: 0, y: 0, intensity: 0 };
    this.comboFire = 0;
  }

  update(now) {
    // Decay lane flashes
    for (let i = 0; i < 4; i++) {
      if (this.laneFlashes[i] > 0) {
        this.laneFlashes[i] = Math.max(0, this.laneFlashes[i] - 0.035);
      }
    }

    if (this.screenFlash > 0) this.screenFlash = Math.max(0, this.screenFlash - 0.015);

    if (this.screenShake.intensity > 0) {
      this.screenShake.intensity *= 0.88;
      if (this.screenShake.intensity < 0.1) this.screenShake.intensity = 0;
      this.screenShake.x = (Math.random() - 0.5) * 2 * this.screenShake.intensity;
      this.screenShake.y = (Math.random() - 0.5) * 2 * this.screenShake.intensity;
    }

    this.particles = this.particles.filter(p => now - p.born < p.life);
    this.rings = this.rings.filter(r => now - r.born < 600);
  }

  triggerHit(lane, x, y, quality, color, now) {
    this.laneFlashes[lane] = 1;
    if (quality === 'MISS') return;

    // Particle burst (8-12 for good, more for great/perfect)
    const count = quality === 'PERFECT' ? 45 : quality === 'GREAT' ? 22 : 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 7;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        born: now,
        life: 350 + Math.random() * 350,
        color,
        size: 1.5 + Math.random() * 5,
        type: 'spark',
      });
    }

    if (quality === 'PERFECT') {
      // Star burst (8 radial stars)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * 4.5,
          vy: Math.sin(angle) * 4.5,
          born: now,
          life: 550,
          color: '#ffffff',
          size: 2 + Math.random() * 3,
          type: 'star',
        });
      }
      this.rings.push({ x, y, born: now, color });
      this.rings.push({ x, y, born: now + 70, color: '#ffffff' });
      this.screenFlash = 0.28;
      this.screenShake.intensity = 4;
    } else if (quality === 'GREAT') {
      this.rings.push({ x, y, born: now, color });
      this.screenFlash = 0.1;
      this.screenShake.intensity = 2;
    }
  }

  triggerMiss(now) {
    this.screenShake.intensity = Math.max(this.screenShake.intensity, 3);
  }

  // Combo milestone celebration (25x, 50x, 100x)
  triggerComboMilestone(x, y, combo, now) {
    const color = combo >= 100 ? '#ffd700' : combo >= 50 ? '#ff00ff' : '#00f0ff';
    const count = combo >= 100 ? 60 : combo >= 50 ? 40 : 24;

    // Radial burst
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        born: now,
        life: 600 + Math.random() * 400,
        color: i % 3 === 0 ? '#ffffff' : color,
        size: 2 + Math.random() * 4,
        type: i % 4 === 0 ? 'star' : 'spark',
      });
    }

    // Multiple expanding rings
    this.rings.push({ x, y, born: now, color });
    this.rings.push({ x, y, born: now + 100, color: '#ffffff' });
    this.rings.push({ x, y, born: now + 200, color });

    this.screenFlash = 0.4;
    this.screenShake.intensity = 6;
  }

  updateComboFire(combo) {
    this.comboFire = Math.min(1, combo / 50);
  }

  drawParticles(ctx, now) {
    for (const p of this.particles) {
      const age = (now - p.born) / p.life;
      if (age > 1) continue;
      const alpha = (1 - age) * (1 - age);
      const dt = (now - p.born) * 0.15;
      const x = p.x + p.vx * dt;
      const y = p.y + p.vy * dt + (now - p.born) * 0.003;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.type === 'star' ? 14 : 8;

      if (p.type === 'star') {
        const sz = p.size * (1 - age * 0.3);
        ctx.translate(x, y);
        ctx.rotate(age * Math.PI);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? sz : sz * 0.3;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        const sz = p.size * (1 - age * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, sz), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawRings(ctx, now) {
    for (const r of this.rings) {
      const age = (now - r.born) / 600;
      if (age > 1 || age < 0) continue;
      ctx.save();
      ctx.globalAlpha = (1 - age) * (1 - age) * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - age);
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(r.x, r.y, age * 75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawScreenFlash(ctx, W, H) {
    if (this.screenFlash <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.screenFlash;
    const g = ctx.createRadialGradient(W / 2, H * 0.7, 0, W / 2, H * 0.5, W * 0.6);
    g.addColorStop(0, 'rgba(150, 220, 255, 0.35)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
