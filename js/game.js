// ── Game State Machine ────────────────────────────────────────
// States: menu → songSelect → loading → playing → results

import { SONGS, DIFF_COLORS } from './songs.js';
import { AudioManager } from './audio.js';
import { generateBeatMap } from './beatmap.js';
import { EffectsManager } from './effects.js';
import { InputManager } from './input.js';
import { Renderer } from './renderer.js';
import { clamp } from './utils.js';

// Timing windows (ms)
const WIN = { p: 50, g: 100, k: 150 };
// Points per judgment
const PTS = { p: 350, g: 200, k: 100 };
// Travel time for notes (ms)
const TRAVEL = 2200;

export class Game {
  constructor() {
    this.state = 'menu'; // menu | songSelect | loading | playing | results
    this.audio = new AudioManager();
    this.effects = new EffectsManager();
    this.input = new InputManager();
    this.renderer = null;
    this.selectedSong = 0;
    this.songScrollIndex = 0;

    // Gameplay data
    this.gd = null;

    // DOM refs (set in init)
    this.dom = {};

    // Animation frame IDs
    this._bgAF = 0;
    this._gameAF = 0;
  }

  init() {
    // Grab DOM elements
    this.dom = {
      bgCv: document.getElementById('bgCv'),
      gameCv: document.getElementById('gameCv'),
      menuScreen: document.getElementById('menuScreen'),
      songSelectScreen: document.getElementById('songSelectScreen'),
      loadingScreen: document.getElementById('loadingScreen'),
      resultsScreen: document.getElementById('resultsScreen'),
      touchBar: document.getElementById('touchBar'),
      songList: document.getElementById('songList'),
      loadingBar: document.getElementById('loadingBar'),
      loadingText: document.getElementById('loadingText'),
      loadingSongName: document.getElementById('loadingSongName'),
      rankText: document.getElementById('rankText'),
      accText: document.getElementById('accText'),
      scoreText: document.getElementById('scoreText'),
      statsGrid: document.getElementById('statsGrid'),
      songPlayed: document.getElementById('songPlayed'),
    };

    this.renderer = new Renderer(this.dom.bgCv, this.dom.gameCv);

    // Resize canvases
    this.renderer.resize(this.dom.bgCv);
    window.addEventListener('resize', () => {
      this.renderer.resize(this.dom.bgCv);
      if (this.state === 'playing') this.renderer.resize(this.dom.gameCv);
    });

    // Input setup
    this.input.init();
    this.input.setupTouchButtons(this.dom.touchBar, lane => this.tryHit(lane));

    // Button events
    document.getElementById('startBtn').addEventListener('click', () => this.showSongSelect());
    document.getElementById('retryBtn').addEventListener('click', () => this.showSongSelect());
    document.getElementById('backBtn').addEventListener('click', () => this.showMenu());

    // Build song list
    this.buildSongList();

    // Show menu
    this.showMenu();

    // Start background render loop
    this.bgLoop();
  }

  // ── View Management ───────────────────────────────────────

  showView(view) {
    this.state = view;
    const views = ['menu', 'songSelect', 'loading', 'playing', 'results'];
    const screens = {
      menu: this.dom.menuScreen,
      songSelect: this.dom.songSelectScreen,
      loading: this.dom.loadingScreen,
      playing: null, // canvas only
      results: this.dom.resultsScreen,
    };

    for (const v of views) {
      if (screens[v]) screens[v].classList.toggle('hide', v !== view);
    }
    this.dom.gameCv.classList.toggle('hide', view !== 'playing');
    this.dom.touchBar.style.display = view === 'playing' ? 'flex' : 'none';

    // Toggle input modes
    if (view === 'songSelect') {
      this.input.onHit = null;
      this.input.onNav = dir => this.navigateSongs(dir);
      this.input.onSelect = () => this.selectSong(this.selectedSong);
      this.input.onBack = () => this.showMenu();
    } else if (view === 'playing') {
      this.input.onNav = null;
      this.input.onHit = lane => this.tryHit(lane);
      this.input.onSelect = null;
      this.input.onBack = () => { this.audio.stop(); this.showSongSelect(); this.bgLoop(); };
    } else if (view === 'results') {
      this.input.onNav = null;
      this.input.onHit = null;
      this.input.onSelect = () => this.showSongSelect();
      this.input.onBack = () => this.showSongSelect();
    } else {
      this.input.onNav = null;
      this.input.onHit = null;
      this.input.onSelect = () => this.showSongSelect();
      this.input.onBack = null;
    }
  }

  showMenu() {
    this.showView('menu');
    this.bgLoop();
  }

  showSongSelect() {
    this.showView('songSelect');
    this.highlightSong(this.selectedSong);
    this.bgLoop();
  }

  // ── Song List UI ──────────────────────────────────────────

  buildSongList() {
    this.dom.songList.innerHTML = '';
    SONGS.forEach((song, i) => {
      const card = document.createElement('div');
      card.className = 'song-card';
      card.dataset.index = i;

      const diffColor = DIFF_COLORS[song.difficulty];
      const stars = '\u2605'.repeat(song.difficulty) + '\u2606'.repeat(5 - song.difficulty);

      card.innerHTML = `
        <div class="song-card-left">
          <div class="song-title">${song.title}</div>
          <div class="song-meta">${song.key} \u2022 ${song.camelot}</div>
        </div>
        <div class="song-card-right">
          <div class="song-bpm">${song.bpm} <span class="bpm-label">BPM</span></div>
          <div class="song-difficulty" style="color:${diffColor}">${stars}</div>
          <div class="song-diff-label" style="color:${diffColor}">${song.diffLabel}</div>
        </div>
      `;

      card.addEventListener('click', () => this.selectSong(i));
      card.addEventListener('mouseenter', () => this.highlightSong(i));
      this.dom.songList.appendChild(card);
    });
  }

  highlightSong(index) {
    this.selectedSong = index;
    const cards = this.dom.songList.querySelectorAll('.song-card');
    cards.forEach((c, i) => {
      c.classList.toggle('selected', i === index);
      if (i === index) {
        c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  navigateSongs(dir) {
    const newIdx = dir === 'up'
      ? Math.max(0, this.selectedSong - 1)
      : Math.min(SONGS.length - 1, this.selectedSong + 1);
    this.highlightSong(newIdx);
  }

  // ── Song Selection & Loading ──────────────────────────────

  async selectSong(index) {
    const song = SONGS[index];
    this.selectedSong = index;

    // Show loading screen
    this.showView('loading');
    this.dom.loadingSongName.textContent = song.title;
    this.dom.loadingBar.style.width = '0%';
    this.dom.loadingText.textContent = '0%';

    try {
      this.audio.init();
      await this.audio.resume();

      await this.audio.loadSong(song.file, progress => {
        const pct = Math.round(progress * 100);
        this.dom.loadingBar.style.width = pct + '%';
        this.dom.loadingText.textContent = pct + '%';
      });

      this.dom.loadingBar.style.width = '100%';
      this.dom.loadingText.textContent = 'READY';

      // Short delay then start
      await new Promise(r => setTimeout(r, 400));
      this.startGame(song);
    } catch (err) {
      console.error('Failed to load song:', err);
      this.dom.loadingText.textContent = 'LOAD FAILED - CLICK TO RETRY';
      this.dom.loadingScreen.addEventListener('click', () => this.showSongSelect(), { once: true });
    }
  }

  // ── Gameplay ──────────────────────────────────────────────

  startGame(song) {
    const duration = this.audio.duration;
    const notes = generateBeatMap(song, duration);
    const beatMs = 60000 / song.bpm;

    this.gd = {
      song,
      notes,
      beatMs,
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      stats: { perfect: 0, great: 0, good: 0, miss: 0 },
      start: performance.now() + 800,
      judg: '',
      judgT: 0,
      done: false,
      beatPulse: 0,
      screenFlash: 0,
      songDuration: duration,
      songElapsed: 0,
    };

    this.effects = new EffectsManager();

    this.showView('playing');
    this.renderer.resize(this.dom.gameCv);

    // Start audio with a small delay to sync
    setTimeout(() => {
      this.audio.play();
    }, 800);

    // Cancel bg loop and start game loop
    cancelAnimationFrame(this._bgAF);
    this.gameLoop();
  }

  tryHit(lane) {
    if (!this.gd || this.gd.done) return;
    const now = performance.now();
    const elapsed = now - this.gd.start;

    this.effects.laneFlashes[lane] = 1;

    // Find closest unhit note in this lane
    let best = null, bestDist = Infinity;
    for (const n of this.gd.notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const d = Math.abs(elapsed - n.t);
      if (d < bestDist) { best = n; bestDist = d; }
    }

    if (!best || bestDist > WIN.k + 40) return;

    best.hit = true;
    let judg, pts;
    if (bestDist <= WIN.p) { judg = 'PERFECT'; pts = PTS.p; }
    else if (bestDist <= WIN.g) { judg = 'GREAT'; pts = PTS.g; }
    else if (bestDist <= WIN.k) { judg = 'GOOD'; pts = PTS.k; }
    else { judg = 'MISS'; pts = 0; }

    if (judg === 'MISS') {
      this.gd.combo = 0;
      this.gd.hp = Math.max(0, this.gd.hp - 4);
      this.gd.stats.miss++;
      this.audio.playMiss();
      this.effects.triggerMiss(now);
    } else {
      this.gd.combo++;
      const mult = 1 + Math.floor(this.gd.combo / 10);
      this.gd.score += pts * mult;
      this.gd.maxCombo = Math.max(this.gd.maxCombo, this.gd.combo);
      this.gd.stats[judg.toLowerCase()]++;
      this.gd.hp = Math.min(100, this.gd.hp + 0.8);

      this.audio.playHit(lane, judg);

      // Compute note position for effects
      const dpr = window.devicePixelRatio || 1;
      const W = this.dom.gameCv.width / dpr;
      const H = this.dom.gameCv.height / dpr;
      const cx = W / 2, hy = H * 0.82, bw = W * 0.3;
      const lw = (bw * 2) / 4;
      const px = cx - bw + lane * lw + lw / 2;

      const COLS = ['#00ffff', '#ff00ff', '#00ff66', '#ffaa00'];
      this.effects.triggerHit(lane, px, hy, judg, COLS[lane], now);
      this.effects.updateComboFire(this.gd.combo);
    }

    this.gd.judg = judg;
    this.gd.judgT = now;
  }

  gameLoop() {
    if (this.state !== 'playing') return;

    const now = performance.now();
    const elapsed = now - this.gd.start;
    const { gd } = this;

    // Beat pulse
    gd.beatPulse = Math.pow(Math.max(0, 1 - ((elapsed % gd.beatMs) / gd.beatMs) * 3.5), 2);
    gd.songElapsed = elapsed;

    // Update effects
    this.effects.update(now);

    // Check for missed notes
    for (const n of gd.notes) {
      if (!n.hit && !n.missed && elapsed > n.t + WIN.k + 60) {
        n.missed = true;
        gd.combo = 0;
        gd.hp = Math.max(0, gd.hp - 4);
        gd.stats.miss++;
        gd.judg = 'MISS';
        gd.judgT = now;
        this.effects.updateComboFire(0);
      }
    }

    // HP death
    if (gd.hp <= 0 && !gd.done) {
      gd.done = true;
      setTimeout(() => this.showResults(), 500);
    }

    // Song end: check if audio ended OR all notes passed
    const lastNote = gd.notes[gd.notes.length - 1];
    const songEnded = !this.audio.playing && elapsed > 3000;
    const notesEnded = lastNote && elapsed > lastNote.t + 3000;
    if ((songEnded || notesEnded) && !gd.done) {
      gd.done = true;
      setTimeout(() => this.showResults(), 300);
    }

    // ── Render ──────────────────────────────────────────────
    const ctx = this.dom.gameCv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.dom.gameCv.width / dpr;
    const H = this.dom.gameCv.height / dpr;

    // Apply screen shake
    if (this.effects.screenShake.intensity > 0) {
      ctx.translate(this.effects.screenShake.x, this.effects.screenShake.y);
    }

    const energy = this.audio.getEnergy();

    // Background
    this.renderer.drawBackground(ctx, W, H, now, 0.6 + gd.beatPulse * 0.4);

    // Screen flash
    this.effects.drawScreenFlash(ctx, W, H);

    // Highway
    const hw = this.renderer.drawHighway(ctx, W, H, now, gd.beatPulse, energy, this.effects);

    // Target gems
    this.renderer.drawTargets(ctx, hw, this.effects.laneFlashes);

    // Rings
    this.effects.drawRings(ctx, now);

    // Notes
    this.renderer.drawNotes(ctx, gd.notes, elapsed, TRAVEL, hw);

    // Particles
    this.effects.drawParticles(ctx, now);

    // Judgment text
    this.renderer.drawJudgment(ctx, gd.judg, gd.judgT, now, hw.cx, hw.hy);

    // HUD
    this.renderer.drawHUD(ctx, W, H, gd, hw);

    // Song title (fades after 5s)
    this.renderer.drawSongTitle(ctx, W, gd.song.title, elapsed);

    this._gameAF = requestAnimationFrame(() => this.gameLoop());
  }

  // ── Results ───────────────────────────────────────────────

  showResults() {
    this.audio.stop();
    cancelAnimationFrame(this._gameAF);

    const { stats, score, maxCombo } = this.gd;
    const total = stats.perfect + stats.great + stats.good + stats.miss;
    const acc = total > 0
      ? Math.round(((stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total) * 100)
      : 0;
    const rank = acc >= 95 ? 'S+' : acc >= 90 ? 'S' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : 'D';
    const rc = { 'S+': '#ffaa00', S: '#00ffff', A: '#00ff66', B: '#ff00ff', C: '#ff8800', D: '#ff2244' }[rank];

    // Rank
    this.dom.rankText.textContent = rank;
    this.dom.rankText.style.cssText = `font-size:88px;font-weight:bold;line-height:1;margin-bottom:6px;color:${rc};text-shadow:0 0 40px ${rc},0 0 80px ${rc}66`;

    // Accuracy
    this.dom.accText.textContent = acc + '% ACCURACY';

    // Song name
    this.dom.songPlayed.textContent = this.gd.song.title;

    // Score
    this.dom.scoreText.textContent = score.toLocaleString();
    this.dom.scoreText.style.cssText = `font-size:30px;font-weight:bold;margin-bottom:30px;background:linear-gradient(180deg,#fff,${rc});-webkit-background-clip:text;-webkit-text-fill-color:transparent`;

    // Stats grid
    const statItems = [
      ['PERFECT', '#00ffff'], ['GREAT', '#ff00ff'],
      ['GOOD', '#00ff66'], ['MISS', '#ff2244'],
    ];
    this.dom.statsGrid.innerHTML = statItems.map(([k, c]) =>
      `<span style="color:${c};text-shadow:0 0 8px ${c}55">${k}</span><span style="text-align:right">${stats[k.toLowerCase()]}</span>`
    ).join('') + `<span style="color:#ffaa00;margin-top:10px">MAX COMBO</span><span style="text-align:right;margin-top:10px">${maxCombo}x</span>`;

    this.showView('results');
    this.bgLoop();
  }

  // ── Background Loop ───────────────────────────────────────

  bgLoop() {
    if (this.state === 'playing') return;
    this.renderer.drawBGLoop();
    this._bgAF = requestAnimationFrame(() => this.bgLoop());
  }
}
