// ── High Score System ─────────────────────────────────────────
// Persistent per-track scores using localStorage

const STORAGE_KEY = 'beatrush_highscores';

export function getGrade(accuracy) {
  if (accuracy >= 100) return 'S+';
  if (accuracy >= 95)  return 'S';
  if (accuracy >= 90)  return 'A';
  if (accuracy >= 80)  return 'B';
  if (accuracy >= 70)  return 'C';
  if (accuracy >= 60)  return 'D';
  return 'F';
}

export const GRADE_COLORS = {
  'S+': '#ffd700', S: '#00f0ff', A: '#00ff88',
  B: '#ff00ff', C: '#ff8800', D: '#ff4466', F: '#555566',
};

export function loadAllScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

export function loadScore(trackTitle) {
  return loadAllScores()[trackTitle] || null;
}

// Returns true if this is a new high score
export function saveScore(trackTitle, record) {
  const all = loadAllScores();
  const existing = all[trackTitle];
  const isNew = !existing || record.score > existing.score;

  if (isNew) {
    all[trackTitle] = {
      score: record.score,
      maxCombo: record.maxCombo,
      accuracy: record.accuracy,
      perfectCount: record.perfectCount,
      greatCount: record.greatCount,
      goodCount: record.goodCount,
      missCount: record.missCount,
      grade: record.grade,
      date: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch { /* storage full — silently fail */ }
  }

  return isNew;
}
