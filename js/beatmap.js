// ── Beat Map Generator ────────────────────────────────────────
// Procedurally generates note patterns from BPM and song identity

import { createRNG, hashString } from './utils.js';

// Section definitions: [startPct, endPct, density, maxSimultaneous, name]
const SECTIONS = [
  [0.00, 0.04, 0.20, 1, 'intro'],
  [0.04, 0.12, 0.45, 1, 'warmup'],
  [0.12, 0.25, 0.60, 2, 'verse1'],
  [0.25, 0.38, 0.80, 2, 'buildup1'],
  [0.38, 0.52, 1.00, 3, 'chorus1'],
  [0.52, 0.60, 0.50, 2, 'bridge'],
  [0.60, 0.72, 0.65, 2, 'verse2'],
  [0.72, 0.80, 0.85, 2, 'buildup2'],
  [0.80, 0.93, 1.00, 4, 'chorus2'],
  [0.93, 0.97, 0.40, 2, 'outro'],
  [0.97, 1.00, 0.15, 1, 'end'],
];

// Pattern templates: arrays of [beatOffset, lane] pairs
// Lane -1 means "pick random lane"
const PATTERNS = {
  single:     [[0, -1]],
  double:     [[0, -1], [0, -1]],
  stairUp:    [[0, 0], [0.5, 1], [1, 2], [1.5, 3]],
  stairDown:  [[0, 3], [0.5, 2], [1, 1], [1.5, 0]],
  zigzag:     [[0, 0], [0.5, 3], [1, 0], [1.5, 3]],
  innerZig:   [[0, 1], [0.5, 2], [1, 1], [1.5, 2]],
  gallop:     [[0, -1], [0.25, -1], [1, -1], [1.25, -1]],
  triplet:    [[0, -1], [0.333, -1], [0.667, -1]],
  burst:      [[0, 0], [0, 3], [0.5, 1], [0.5, 2]],
  stream4:    [[0, -1], [0.25, -1], [0.5, -1], [0.75, -1]],
  stream8:    [[0, -1], [0.125, -1], [0.25, -1], [0.375, -1], [0.5, -1], [0.625, -1], [0.75, -1], [0.875, -1]],
  chord2:     [[0, 0], [0, 1]],
  chord3:     [[0, 0], [0, 1], [0, 2]],
  chord4:     [[0, 0], [0, 1], [0, 2], [0, 3]],
  roll:       [[0, 0], [0.25, 1], [0.5, 2], [0.75, 3], [1, 3], [1.25, 2], [1.5, 1], [1.75, 0]],
};

// Difficulty-based pattern pools
const PATTERN_POOLS = {
  intro:    ['single'],
  warmup:   ['single', 'single', 'double', 'stairUp'],
  verse1:   ['single', 'double', 'stairUp', 'stairDown', 'zigzag', 'gallop'],
  buildup1: ['double', 'stairUp', 'stairDown', 'zigzag', 'gallop', 'triplet', 'burst'],
  chorus1:  ['double', 'stairUp', 'stairDown', 'zigzag', 'innerZig', 'gallop', 'triplet', 'burst', 'stream4', 'chord2'],
  bridge:   ['single', 'single', 'innerZig', 'triplet'],
  verse2:   ['single', 'double', 'stairDown', 'zigzag', 'gallop', 'innerZig'],
  buildup2: ['double', 'stairUp', 'zigzag', 'gallop', 'triplet', 'burst', 'stream4'],
  chorus2:  ['stairUp', 'stairDown', 'zigzag', 'gallop', 'triplet', 'burst', 'stream4', 'roll', 'chord2', 'chord3'],
  outro:    ['single', 'double', 'stairDown'],
  end:      ['single', 'chord4'],
};

function getSection(progress) {
  for (const s of SECTIONS) {
    if (progress >= s[0] && progress < s[1]) return s;
  }
  return SECTIONS[SECTIONS.length - 1];
}

export function generateBeatMap(song, durationSec) {
  const { bpm, title } = song;
  const rng = createRNG(hashString(title));
  const beatMs = 60000 / bpm;
  const totalMs = durationSec * 1000;
  const leadIn = 2500; // ms before first note

  const notes = [];
  let beat = 0;
  const totalBeats = Math.floor(totalMs / beatMs);

  // Difficulty scaling: faster songs get denser patterns
  const densityScale = bpm >= 135 ? 0.85 : bpm >= 115 ? 1.0 : bpm >= 95 ? 1.15 : 1.3;

  while (beat < totalBeats) {
    const progress = beat / totalBeats;
    const section = getSection(progress);
    const [, , baseDensity, maxSimul, sectionName] = section;
    const density = baseDensity * densityScale;

    // Decide if we place notes on this beat
    if (rng() < density) {
      const pool = PATTERN_POOLS[sectionName] || ['single'];
      const patternName = pool[Math.floor(rng() * pool.length)];
      const pattern = PATTERNS[patternName];

      // For patterns needing random lanes, assign them
      const usedLanes = new Set();
      for (const [beatOffset, lane] of pattern) {
        let l = lane;
        if (l === -1) {
          // Pick a lane not used in this simultaneous group
          const sameBeatNotes = pattern.filter(p => p[0] === beatOffset && p[1] !== -1);
          do { l = Math.floor(rng() * 4); } while (usedLanes.has(`${beatOffset}-${l}`));
        }
        usedLanes.add(`${beatOffset}-${l}`);

        // Enforce maxSimultaneous: count how many notes at this exact beatOffset
        const timeKey = beat + beatOffset;
        const simultaneousCount = notes.filter(n =>
          Math.abs(n.beat - timeKey) < 0.01
        ).length;
        if (simultaneousCount >= maxSimul) continue;

        const timeMs = leadIn + timeKey * beatMs;
        if (timeMs > totalMs + leadIn - 1000) continue;

        notes.push({
          t: timeMs,
          beat: timeKey,
          lane: l,
          hit: false,
          missed: false,
        });
      }

      // Advance past the pattern's duration
      const patternLength = Math.max(...pattern.map(p => p[0])) + 1;
      beat += Math.max(patternLength, 1);

      // Add some spacing based on inverse density
      if (rng() > density * 0.7) beat += 0.5;
    } else {
      beat += 1;
    }
  }

  // Sort by time, remove duplicates at same time+lane
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  const unique = [];
  const seen = new Set();
  for (const n of notes) {
    const key = `${Math.round(n.t)}-${n.lane}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(n);
    }
  }

  return unique;
}
