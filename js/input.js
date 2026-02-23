// ── Input Manager ─────────────────────────────────────────────
// Handles keyboard and touch input for the rhythm game

export class InputManager {
  constructor() {
    this.onHit = null;      // callback(lane)
    this.onBack = null;     // callback() for escape/back
    this.onSelect = null;   // callback() for enter/select
    this.onNav = null;      // callback(direction) for menu navigation: 'up'|'down'
    this.keysDown = new Set();
    this._boundKeyDown = this._keyDown.bind(this);
    this._boundKeyUp = this._keyUp.bind(this);
  }

  // Keyboard mapping: key → lane
  static KEY_MAP = {
    'a': 0, 'arrowleft': 0,
    'w': 1, 'arrowup': 1,
    's': 2, 'arrowdown': 2,
    'd': 3, 'arrowright': 3,
  };

  init() {
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
  }

  _keyDown(e) {
    const key = e.key.toLowerCase();

    // Navigation keys (always active for menus)
    if (key === 'escape') {
      e.preventDefault();
      this.onBack?.();
      return;
    }
    if (key === 'enter' || key === ' ') {
      e.preventDefault();
      this.onSelect?.();
      return;
    }

    // Menu navigation (up/down without playing)
    if (key === 'arrowup' || key === 'w') {
      if (this.onNav) { e.preventDefault(); this.onNav('up'); return; }
    }
    if (key === 'arrowdown' || key === 's') {
      if (this.onNav) { e.preventDefault(); this.onNav('down'); return; }
    }

    // Game hit input
    if (key in InputManager.KEY_MAP && !this.keysDown.has(key)) {
      this.keysDown.add(key);
      e.preventDefault();
      this.onHit?.(InputManager.KEY_MAP[key]);
    }
  }

  _keyUp(e) {
    this.keysDown.delete(e.key.toLowerCase());
  }

  // Setup touch buttons (called from game)
  setupTouchButtons(container, callback) {
    const arrows = ['\u2190', '\u2191', '\u2193', '\u2192'];
    const colors = ['#00ffff', '#ff00ff', '#00ff66', '#ffaa00'];

    container.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement('button');
      btn.className = 'tbtn';
      btn.textContent = arrows[i];
      btn.style.cssText = `
        border: 2px solid ${colors[i]}55;
        background: linear-gradient(180deg, ${colors[i]}22, ${colors[i]}0a);
        color: ${colors[i]};
        text-shadow: 0 0 16px ${colors[i]};
        box-shadow: 0 0 20px ${colors[i]}33, inset 0 1px 0 rgba(255,255,255,0.08);
      `;
      // Touch events with visual feedback
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        callback(i);
      });
      btn.addEventListener('touchend', () => btn.classList.remove('pressed'));
      btn.addEventListener('touchcancel', () => btn.classList.remove('pressed'));
      // Mouse fallback
      btn.addEventListener('mousedown', () => {
        btn.classList.add('pressed');
        callback(i);
      });
      btn.addEventListener('mouseup', () => btn.classList.remove('pressed'));
      btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));
      container.appendChild(btn);
    }
  }
}
