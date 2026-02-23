// ── Beat Rush – Entry Point ───────────────────────────────────

import { Game } from './game.js';

try {
  const game = new Game();
  game.init();
} catch(e) {
  console.error('Beat Rush init failed:', e);
  document.body.innerHTML = `<div style="color:#ff4466;font:16px monospace;padding:40px;text-align:center">
    Failed to initialize. Check console for errors.<br>${e.message}</div>`;
}
