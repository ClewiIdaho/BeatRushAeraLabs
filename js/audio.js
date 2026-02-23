// ── Audio Manager ─────────────────────────────────────────────
// Handles MP3 loading, playback, hit sounds, and frequency analysis

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.analyser = null;
    this.gainNode = null;
    this.hitGain = null;
    this.freqData = null;
    this.playing = false;
    this.startTime = 0;
    this.pauseOffset = 0;
    this._ready = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Main music chain: source → gain → analyser → destination
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Hit sounds chain
    this.hitGain = this.ctx.createGain();
    this.hitGain.gain.value = 0.25;
    this.hitGain.connect(this.ctx.destination);

    this._ready = true;
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Load an MP3 from URL with progress callback (with retry)
  async loadSong(url, onProgress) {
    this.init();
    await this.resume();
    this.stop();
    this.buffer = null;

    let response = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url);
        if (response.ok) break;
        lastErr = new Error(`HTTP ${response.status}`);
      } catch(e) {
        lastErr = e;
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (!response || !response.ok) throw lastErr || new Error('Failed to load song');

    const contentLength = +response.headers.get('Content-Length') || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress && contentLength) {
        onProgress(received / contentLength);
      }
    }

    // Combine chunks into a single ArrayBuffer
    const blob = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      blob.set(chunk, offset);
      offset += chunk.length;
    }

    this.buffer = await this.ctx.decodeAudioData(blob.buffer);
    return this.buffer;
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  get currentTime() {
    if (!this.playing) return this.pauseOffset;
    return this.ctx.currentTime - this.startTime;
  }

  play(offset = 0) {
    if (!this.buffer || !this._ready) return;
    this.stop();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.onended = () => { this.playing = false; };

    this.startTime = this.ctx.currentTime - offset;
    this.pauseOffset = offset;
    this.source.start(0, offset);
    this.playing = true;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) { /* ignore */ }
      try { this.source.disconnect(); } catch (e) { /* ignore */ }
      this.source = null;
    }
    this.playing = false;
    this.pauseOffset = 0;
  }

  // Get frequency spectrum data (0-255 per bin)
  getFrequency() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  // Compute bass, mid, high energy (0-1)
  getEnergy() {
    const d = this.getFrequency();
    if (!d) return { bass: 0, mid: 0, high: 0 };
    const bins = d.length;
    let bass = 0, mid = 0, high = 0;
    const bassEnd = Math.floor(bins * 0.1);
    const midEnd = Math.floor(bins * 0.4);

    for (let i = 0; i < bassEnd; i++) bass += d[i];
    for (let i = bassEnd; i < midEnd; i++) mid += d[i];
    for (let i = midEnd; i < bins; i++) high += d[i];

    bass /= bassEnd * 255;
    mid /= (midEnd - bassEnd) * 255;
    high /= (bins - midEnd) * 255;

    return { bass, mid, high };
  }

  // Play a short hit sound for a lane
  playHit(lane, quality) {
    if (!this._ready) return;
    const freqs = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5
    const types = ['sine', 'triangle', 'square', 'sawtooth'];

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = types[lane];
    osc.frequency.value = freqs[lane];

    env.gain.setValueAtTime(0.3, this.ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(env);
    env.connect(this.hitGain);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.1);
  }

  // Play miss sound
  playMiss() {
    if (!this._ready) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 120;
    osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.15);

    env.gain.setValueAtTime(0.08, this.ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(env);
    env.connect(this.hitGain);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.15);
  }
}
