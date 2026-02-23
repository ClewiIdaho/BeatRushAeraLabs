// ── Game State Machine ────────────────────────────────────────
// States: menu → songSelect → loading → playing → results

import { SONGS, DIFF_COLORS } from './songs.js';
import { AudioManager } from './audio.js';
import { generateBeatMap } from './beatmap.js';
import { EffectsManager } from './effects.js';
import { InputManager } from './input.js';
import { Renderer } from './renderer.js';
import { clamp, easeOutCubic } from './utils.js';
import { loadScore, loadAllScores, saveScore, getGrade, GRADE_COLORS } from './scores.js';

// Timing windows (ms)
const WIN = { p: 50, g: 100, k: 150 };
// Points per judgment
const PTS = { p: 350, g: 200, k: 100 };
// Travel time for notes (ms)
const TRAVEL = 2200;

export class Game {
  constructor() {
    this.state = 'menu';
    this.audio = new AudioManager();
    this.effects = new EffectsManager();
    this.input = new InputManager();
    this.renderer = null;
    this.selectedSong = 0;
    this.paused = false;
    this.pauseTime = 0;
    this.isTouchDevice = false;

    // Gameplay data
    this.gd = null;

    // DOM refs (set in init)
    this.dom = {};

    // Animation frame IDs
    this._bgAF = 0;
    this._gameAF = 0;
  }

  init() {
    this.dom = {
      bgCv: document.getElementById('bgCv'),
      gameCv: document.getElementById('gameCv'),
      lobbyScreen: document.getElementById('lobbyScreen'),
      loadingScreen: document.getElementById('loadingScreen'),
      resultsScreen: document.getElementById('resultsScreen'),
      touchBar: document.getElementById('touchBar'),
      songList: document.getElementById('songList'),
      bestRunsList: document.getElementById('bestRunsList'),
      loadingBar: document.getElementById('loadingBar'),
      loadingText: document.getElementById('loadingText'),
      loadingSongName: document.getElementById('loadingSongName'),
      rankText: document.getElementById('rankText'),
      accText: document.getElementById('accText'),
      scoreText: document.getElementById('scoreText'),
      statsGrid: document.getElementById('statsGrid'),
      songPlayed: document.getElementById('songPlayed'),
      newHighScore: document.getElementById('newHighScore'),
      pauseOverlay: document.getElementById('pauseOverlay'),
    };

    this.renderer = new Renderer(this.dom.bgCv, this.dom.gameCv);

    // Resize canvases
    this.renderer.resize(this.dom.bgCv);
    window.addEventListener('resize', () => {
      this.renderer.resize(this.dom.bgCv);
      if (this.state === 'playing') this.renderer.resize(this.dom.gameCv);
    });

    // Detect touch device
    this.isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Prevent scroll/bounce during gameplay on mobile
    document.addEventListener('touchmove', e => {
      if (this.state === 'playing') e.preventDefault();
    }, { passive: false });

    // Input setup
    this.input.init();
    this.input.setupTouchButtons(this.dom.touchBar, lane => this.tryHit(lane));

    // Button events
    document.getElementById('retryBtn').addEventListener('click', () => this._retrySong());
    document.getElementById('trackSelectBtn').addEventListener('click', () => this.showLobby());
    document.getElementById('resumeBtn').addEventListener('click', () => this.resumeGame());
    document.getElementById('pauseQuitBtn').addEventListener('click', () => this._quitToTracks());

    // Build lobby
    this.buildSongList();
    this.buildBestRuns();

    // Show lobby
    this.showLobby();

    // Start background render loop
    this.bgLoop();
  }

  // ── View Management ───────────────────────────────────────

  showView(view) {
    this.state = view;
    const screens = {
      lobby: this.dom.lobbyScreen,
      loading: this.dom.loadingScreen,
      results: this.dom.resultsScreen,
    };

    // Toggle screen overlays with CSS transitions (active class = visible)
    for (const [v, el] of Object.entries(screens)) {
      if (el) el.classList.toggle('active', v === view);
    }

    // Game canvas
    this.dom.gameCv.classList.toggle('visible', view === 'playing');
    // Show touch bar on touch devices during gameplay
    this.dom.touchBar.style.display = (view === 'playing' && this.isTouchDevice) ? 'flex' : 'none';

    // Cursor management
    document.body.classList.toggle('gameplay-active', view === 'playing');

    // Hide pause overlay when leaving gameplay
    if (view !== 'playing') {
      this.dom.pauseOverlay.classList.remove('active');
      this.paused = false;
    }

    // Configure input callbacks per state
    this._configureInput(view);
  }

  _configureInput(view) {
    if (view === 'lobby') {
      this.input.onHit = null;
      this.input.onNav = dir => this.navigateSongs(dir);
      this.input.onSelect = () => this.selectSong(this.selectedSong);
      this.input.onBack = null;
    } else if (view === 'playing') {
      this.input.onNav = null;
      this.input.onHit = lane => this.tryHit(lane);
      this.input.onSelect = null;
      this.input.onBack = () => this.togglePause();
    } else if (view === 'results') {
      this.input.onNav = null;
      this.input.onHit = null;
      this.input.onSelect = () => this._retrySong();
      this.input.onBack = () => this.showLobby();
    } else {
      this.input.onNav = null;
      this.input.onHit = null;
      this.input.onSelect = null;
      this.input.onBack = null;
    }
  }

  showLobby() {
    this.buildSongList();
    this.buildBestRuns();
    this.showView('lobby');
    this.highlightSong(this.selectedSong);
    this.bgLoop();
  }

  // ── Song List UI ──────────────────────────────────────────

  buildSongList() {
    const allScores = loadAllScores();
    this.dom.songList.innerHTML = '';

    SONGS.forEach((song, i) => {
      const card = document.createElement('div');
      card.className = 'song-card';
      card.dataset.index = i;

      const diffColor = DIFF_COLORS[song.difficulty];
      const stars = '\u2605'.repeat(song.difficulty) + '\u2606'.repeat(5 - song.difficulty);

      // High score data
      const hs = allScores[song.title];
      let gradeHtml = '';
      let hsHtml = '';
      if (hs) {
        const gc = GRADE_COLORS[hs.grade] || '#556';
        gradeHtml = `<span class="song-grade-badge" style="color:${gc};border-color:${gc}55">${hs.grade}</span>`;
        hsHtml = `<div class="song-highscore">${hs.score.toLocaleString()}</div>`;
      }

      card.innerHTML = `
        <div class="song-card-left">
          <div class="song-title">${song.title}${gradeHtml}</div>
          <div class="song-meta">${song.key} \u2022 ${song.camelot}</div>
        </div>
        <div class="song-card-right">
          <div class="song-bpm">${song.bpm} <span class="bpm-label">BPM</span></div>
          <div class="song-difficulty" style="color:${diffColor}">${stars}</div>
          <div class="song-diff-label" style="color:${diffColor}">${song.diffLabel}</div>
          ${hsHtml}
        </div>
      `;

      card.addEventListener('click', () => this.selectSong(i));
      card.addEventListener('mouseenter', () => this.highlightSong(i));
      this.dom.songList.appendChild(card);
    });
  }

  buildBestRuns() {
    const allScores = loadAllScores();
    const entries = Object.entries(allScores)
      .sort((a, b) => b[1].score - a[1].score);

    if (!entries.length) {
      this.dom.bestRunsList.innerHTML =
        '<div class="best-run-empty">NO RUNS YET<br>PLAY A TRACK TO BEGIN</div>';
      return;
    }

    this.dom.bestRunsList.innerHTML = entries.map(([title, rec], i) => {
      const gc = GRADE_COLORS[rec.grade] || '#556677';
      const songIdx = SONGS.findIndex(s => s.title === title);
      return `
        <div class="best-run-card" data-song="${songIdx}">
          <div class="best-run-rank">${i + 1}</div>
          <div class="best-run-grade" style="color:${gc};text-shadow:0 0 10px ${gc}55">${rec.grade}</div>
          <div class="best-run-info">
            <div class="best-run-title">${title}</div>
            <div class="best-run-score">${rec.score.toLocaleString()}</div>
          </div>
          <div class="best-run-acc">${rec.accuracy}%</div>
        </div>`;
    }).join('');

    // Clicking a best run card jumps to that song in the list
    this.dom.bestRunsList.querySelectorAll('.best-run-card').forEach(card => {
      const idx = parseInt(card.dataset.song);
      if (idx >= 0) {
        card.addEventListener('click', () => {
          this.highlightSong(idx);
          const cards = this.dom.songList.querySelectorAll('.song-card');
          if (cards[idx]) cards[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
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

      await new Promise(r => setTimeout(r, 400));
      this.startGame(song);
    } catch (err) {
      console.error('Failed to load song:', song.title, err);
      this.dom.loadingText.textContent = 'LOAD FAILED \u2014 TAP OR PRESS ANY KEY';
      const goBack = () => {
        window.removeEventListener('keydown', goBack);
        this.showLobby();
      };
      this.dom.loadingScreen.addEventListener('click', goBack, { once: true });
      window.addEventListener('keydown', goBack, { once: true });
    }
  }

  // ── Pause System ──────────────────────────────────────────

  togglePause() {
    if (this.state !== 'playing') return;
    if (this.paused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.paused || this.state !== 'playing') return;
    this.paused = true;
    this.pauseTime = performance.now();
    cancelAnimationFrame(this._gameAF);

    // Suspend audio
    if (this.audio.ctx) this.audio.ctx.suspend();

    this.dom.pauseOverlay.classList.add('active');

    // Reconfigure input for pause menu
    this.input.onHit = null;
    this.input.onNav = null;
    this.input.onSelect = () => this.resumeGame();
    this.input.onBack = () => this._quitToTracks();
  }

  resumeGame() {
    if (!this.paused) return;
    const pauseDuration = performance.now() - this.pauseTime;
    this.gd.start += pauseDuration;
    this.paused = false;

    // Resume audio
    if (this.audio.ctx) this.audio.ctx.resume();

    this.dom.pauseOverlay.classList.remove('active');

    // Restore gameplay input
    this._configureInput('playing');
    this.gameLoop();
  }

  _quitToTracks() {
    this.paused = false;
    this.audio.stop();
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
      this.audio.ctx.resume();
    }
    cancelAnimationFrame(this._gameAF);
    this.showLobby();
  }

  _retrySong() {
    const song = SONGS[this.selectedSong];
    if (song && this.audio.buffer) {
      this.startGame(song);
    } else {
      this.selectSong(this.selectedSong);
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
      songDuration: duration,
      songElapsed: 0,
    };

    this.effects = new EffectsManager();
    this.renderer._displayScore = 0;

    this.showView('playing');
    this.renderer.resize(this.dom.gameCv);

    // Start audio after delay to sync
    setTimeout(() => {
      if (this.state === 'playing') this.audio.play();
    }, 800);

    cancelAnimationFrame(this._bgAF);
    this.gameLoop();
  }

  tryHit(lane) {
    if (!this.gd || this.gd.done || this.paused) return;
    const now = performance.now();
    const elapsed = now - this.gd.start;

    this.effects.laneFlashes[lane] = 1;

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

      // Compute note position for effects (must match renderer highway)
      const dpr = window.devicePixelRatio || 1;
      const W = this.dom.gameCv.width / dpr;
      const H = this.dom.gameCv.height / dpr;
      const isMobile = W < 600;
      const cx = W / 2;
      const hy = this.isTouchDevice ? H * 0.72 : H * 0.82;
      const bw = W * (isMobile ? 0.38 : 0.28);
      const lw = (bw * 2) / 4;
      const px = cx - bw + lane * lw + lw / 2;

      const COLS = ['#00f0ff', '#ff00ff', '#00ff88', '#ffaa00'];
      this.effects.triggerHit(lane, px, hy, judg, COLS[lane], now);
      this.effects.updateComboFire(this.gd.combo);

      // Combo milestones
      if (this.gd.combo === 25 || this.gd.combo === 50 || this.gd.combo === 100) {
        this.effects.triggerComboMilestone(cx, hy - 60, this.gd.combo, now);
      }
    }

    this.gd.judg = judg;
    this.gd.judgT = now;
  }

  gameLoop() {
    if (this.state !== 'playing' || this.paused) return;

    const now = performance.now();
    const elapsed = now - this.gd.start;
    const { gd } = this;

    gd.beatPulse = Math.pow(Math.max(0, 1 - ((elapsed % gd.beatMs) / gd.beatMs) * 3.5), 2);
    gd.songElapsed = elapsed;

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

    // Song end
    const lastNote = gd.notes[gd.notes.length - 1];
    const songEnded = !this.audio.playing && elapsed > 3000;
    const notesEnded = lastNote && elapsed > lastNote.t + 3000;
    if ((songEnded || notesEnded) && !gd.done) {
      gd.done = true;
      setTimeout(() => this.showResults(), 300);
    }

    // ── Render ──────────────────────────────────────────────
    try {
      const ctx = this.dom.gameCv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = this.dom.gameCv.width / dpr;
      const H = this.dom.gameCv.height / dpr;
      ctx.clearRect(0, 0, W, H);

      // Screen shake
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

      // Target arrows (pass time for idle pulse)
      this.renderer.drawTargets(ctx, hw, this.effects.laneFlashes, now);

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

      // Song title
      this.renderer.drawSongTitle(ctx, W, gd.song.title, elapsed);
    } catch(e) {
      console.error('Render error:', e);
    }

    this._gameAF = requestAnimationFrame(() => this.gameLoop());
  }

  // ── Results ───────────────────────────────────────────────

  showResults() {
    this.audio.stop();
    cancelAnimationFrame(this._gameAF);

    const { stats, score, maxCombo, song } = this.gd;
    const total = stats.perfect + stats.great + stats.good + stats.miss;
    const acc = total > 0
      ? Math.round(((stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total) * 100)
      : 0;
    const grade = getGrade(acc);
    const rc = GRADE_COLORS[grade] || '#556';

    // Save high score
    const isNewHigh = saveScore(song.title, {
      score, maxCombo, accuracy: acc,
      perfectCount: stats.perfect,
      greatCount: stats.great,
      goodCount: stats.good,
      missCount: stats.miss,
      grade,
    });

    // Rank
    this.dom.rankText.textContent = grade;
    this.dom.rankText.style.cssText = `color:${rc};text-shadow:0 0 40px ${rc},0 0 80px ${rc}66;animation:gradeEntrance 0.8s cubic-bezier(0.175,0.885,0.32,1.275) both`;

    // Accuracy
    this.dom.accText.textContent = acc + '% ACCURACY';

    // Song name
    this.dom.songPlayed.textContent = song.title;

    // New high score banner
    this.dom.newHighScore.classList.toggle('visible', isNewHigh);

    // Score with counting animation
    this.dom.scoreText.textContent = '0';
    this.dom.scoreText.style.cssText = `background:linear-gradient(180deg,#fff,${rc});-webkit-background-clip:text;-webkit-text-fill-color:transparent`;
    this._animateScoreCount(score, 1500);

    // Stats grid
    const statItems = [
      ['PERFECT', '#ffd700'], ['GREAT', '#00f0ff'],
      ['GOOD', '#00ff88'], ['MISS', '#ff4466'],
    ];
    this.dom.statsGrid.innerHTML = statItems.map(([k, c]) =>
      `<span style="color:${c};text-shadow:0 0 8px ${c}44">${k}</span><span style="text-align:right">${stats[k.toLowerCase()]}</span>`
    ).join('') + `<span style="color:#ffaa00;margin-top:10px">MAX COMBO</span><span style="text-align:right;margin-top:10px">${maxCombo}x</span>`;

    this.showView('results');
    this.bgLoop();
  }

  _animateScoreCount(target, duration) {
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const progress = clamp(elapsed / duration, 0, 1);
      const eased = easeOutCubic(progress);
      this.dom.scoreText.textContent = Math.floor(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Background Loop ───────────────────────────────────────

  bgLoop() {
    if (this.state === 'playing') return;
    this.renderer.drawBGLoop();
    this._bgAF = requestAnimationFrame(() => this.bgLoop());
  }
}
