// ── Visual Effects Manager ────────────────────────────────────

export class EffectsManager {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.laneFlashes = [0, 0, 0, 0];
    this.screenFlash = 0;
    this.screenShake = { x: 0, y: 0, intensity: 0 };
    this.comboFire = 0;
    this._lastUpdate = 0;
  }

  update(now) {
    // Delta time for frame-rate independent smoothness
    const dt = this._lastUpdate ? Math.min((now - this._lastUpdate) / 16.67, 3) : 1;
    this._lastUpdate = now;

    // Smooth exponential decay for lane flashes (buttery fade-out)
    for (let i = 0; i < 4; i++) {
      if (this.laneFlashes[i] > 0) {
        this.laneFlashes[i] *= Math.pow(0.92, dt);
        if (this.laneFlashes[i] < 0.005) this.laneFlashes[i] = 0;
      }
    }

    // Smooth exponential screen flash decay
    if (this.screenFlash > 0) {
      this.screenFlash *= Math.pow(0.88, dt);
      if (this.screenFlash < 0.003) this.screenFlash = 0;
    }

    // Smooth screen shake decay with perlin-like motion
    if (this.screenShake.intensity > 0) {
      this.screenShake.intensity *= Math.pow(0.86, dt);
      if (this.screenShake.intensity < 0.08) this.screenShake.intensity = 0;
      // Smooth noise instead of random jitter
      const t = now * 0.015;
      this.screenShake.x = Math.sin(t * 1.1) * this.screenShake.intensity * 1.5;
      this.screenShake.y = Math.cos(t * 1.3) * this.screenShake.intensity * 1.5;
    }

    this.particles = this.particles.filter(p => now - p.born < p.life);
    this.rings = this.rings.filter(r => now - r.born < 700);
  }

  triggerHit(lane, x, y, quality, color, now) {
    this.laneFlashes[lane] = 1;
    if (quality === 'MISS') return;

    // Particle burst (richer, more varied)
    const count = quality === 'PERFECT' ? 55 : quality === 'GREAT' ? 28 : 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 8;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        born: now,
        life: 400 + Math.random() * 500,
        color,
        size: 1.2 + Math.random() * 5.5,
        type: 'spark',
        drag: 0.97 + Math.random() * 0.02, // velocity dampening
      });
    }

    if (quality === 'PERFECT') {
      // Star burst (12 radial stars with stagger)
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const speed = 3.5 + Math.random() * 3;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          born: now + i * 8, // staggered spawn for cascading feel
          life: 600 + Math.random() * 200,
          color: i % 3 === 0 ? '#ffffff' : color,
          size: 2 + Math.random() * 3,
          type: 'star',
          drag: 0.985,
        });
      }
      // Shimmer dust (tiny lingering particles)
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * 0.8,
          vy: Math.sin(angle) * 0.8 - 1.5,
          born: now + Math.random() * 80,
          life: 700 + Math.random() * 500,
          color: '#ffffff',
          size: 0.5 + Math.random() * 2,
          type: 'dust',
          drag: 0.995,
        });
      }
      this.rings.push({ x, y, born: now, color, maxR: 80 });
      this.rings.push({ x, y, born: now + 60, color: '#ffffff', maxR: 55 });
      this.screenFlash = 0.3;
      this.screenShake.intensity = 4.5;
    } else if (quality === 'GREAT') {
      // Small shimmer
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 20, y,
          vx: Math.cos(angle) * 0.5,
          vy: -1 - Math.random() * 1.5,
          born: now,
          life: 500 + Math.random() * 300,
          color: '#ffffff',
          size: 0.5 + Math.random() * 1.5,
          type: 'dust',
          drag: 0.995,
        });
      }
      this.rings.push({ x, y, born: now, color, maxR: 65 });
      this.screenFlash = 0.12;
      this.screenShake.intensity = 2;
    }
  }

  triggerMiss(now) {
    this.screenShake.intensity = Math.max(this.screenShake.intensity, 3);
  }

  // Combo milestone celebration (25x, 50x, 100x)
  triggerComboMilestone(x, y, combo, now) {
    const color = combo >= 100 ? '#ffd700' : combo >= 50 ? '#ff00ff' : '#00f0ff';
    const count = combo >= 100 ? 70 : combo >= 50 ? 45 : 28;

    // Radial burst with staggered spawn
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 2.5 + Math.random() * 7;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        born: now + i * 3, // stagger for wave effect
        life: 700 + Math.random() * 500,
        color: i % 3 === 0 ? '#ffffff' : color,
        size: 1.5 + Math.random() * 4.5,
        type: i % 5 === 0 ? 'star' : 'spark',
        drag: 0.975,
      });
    }

    // Multiple staggered rings
    this.rings.push({ x, y, born: now, color, maxR: 90 });
    this.rings.push({ x, y, born: now + 80, color: '#ffffff', maxR: 70 });
    this.rings.push({ x, y, born: now + 160, color, maxR: 50 });

    this.screenFlash = 0.45;
    this.screenShake.intensity = 6;
  }

  updateComboFire(combo) {
    // Smooth transition toward target
    const target = Math.min(1, combo / 50);
    this.comboFire += (target - this.comboFire) * 0.08;
  }

  drawParticles(ctx, now) {
    for (const p of this.particles) {
      const rawAge = now - p.born;
      if (rawAge < 0) continue; // not yet spawned (staggered)
      const age = rawAge / p.life;
      if (age > 1) continue;

      // Smooth cubic fade-out (no hard cutoff)
      const inv = 1 - age;
      const alpha = inv * inv * inv;

      // Physics with drag
      const dt = rawAge * 0.14;
      const drag = Math.pow(p.drag || 0.98, rawAge * 0.06);
      const x = p.x + p.vx * dt * drag;
      const y = p.y + p.vy * dt * drag + rawAge * rawAge * 0.0000015; // gentle gravity

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;

      if (p.type === 'star') {
        ctx.shadowBlur = 16;
        const sz = p.size * (1 - age * 0.2);
        ctx.translate(x, y);
        ctx.rotate(rawAge * 0.003);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? sz : sz * 0.3;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'dust') {
        ctx.shadowBlur = 6;
        const sz = p.size * (1 - age * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.3, sz), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowBlur = 10;
        const sz = p.size * (1 - age * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, sz), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawRings(ctx, now) {
    for (const r of this.rings) {
      const rawAge = now - r.born;
      if (rawAge < 0) continue;
      const age = rawAge / 700;
      if (age > 1) continue;

      // Smooth easeOutCubic for ring expansion
      const eased = 1 - Math.pow(1 - age, 3);
      const maxR = r.maxR || 75;

      ctx.save();
      // Smooth cubic fade-out
      const inv = 1 - age;
      ctx.globalAlpha = inv * inv * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3.5 * (1 - eased);
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 20 * (1 - age);
      ctx.beginPath();
      ctx.arc(r.x, r.y, eased * maxR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawScreenFlash(ctx, W, H) {
    if (this.screenFlash <= 0.002) return;
    ctx.save();
    // Smooth squared alpha for softer flash
    ctx.globalAlpha = this.screenFlash * this.screenFlash * 1.5;
    const g = ctx.createRadialGradient(W / 2, H * 0.7, 0, W / 2, H * 0.5, W * 0.6);
    g.addColorStop(0, 'rgba(150, 220, 255, 0.4)');
    g.addColorStop(0.4, 'rgba(120, 180, 255, 0.15)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
