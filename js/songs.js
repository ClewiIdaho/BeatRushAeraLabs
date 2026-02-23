// ── Song Catalog ──────────────────────────────────────────────

const BASE_URL = 'https://raw.githubusercontent.com/ClewiIdaho/Newgamemusic/main/';

function url(filename) {
  return BASE_URL + encodeURIComponent(filename);
}

function difficulty(bpm) {
  if (bpm <= 90) return 1;
  if (bpm <= 100) return 2;
  if (bpm <= 120) return 3;
  if (bpm <= 135) return 4;
  return 5;
}

function diffLabel(d) {
  return ['', 'CHILL', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'][d];
}

// Only songs confirmed present in github.com/ClewiIdaho/Newgamemusic
export const SONGS = [
  { id: 0,  title: 'Ramen Noodles',              bpm: 134, key: 'C\u266F minor', camelot: '12A', file: url('Ramen Noodles.mp3') },
  { id: 1,  title: 'Black Umbrella',             bpm: 128, key: 'E minor',       camelot: '9A',  file: url('Black Umbrella.mp3') },
  { id: 2,  title: 'Level Up',                   bpm: 135, key: 'E minor',       camelot: '9A',  file: url('Level Up.mp3') },
  { id: 3,  title: 'Concrete Koi',               bpm: 127, key: 'F major',       camelot: '7B',  file: url('Concrete Koi.mp3') },
  { id: 4,  title: 'Siracha',                    bpm: 126, key: 'F\u266F minor', camelot: '11A', file: url('Siracha.mp3') },
  { id: 5,  title: 'Neon Silence',               bpm: 87,  key: 'F minor',       camelot: '4A',  file: url('Neon Silence.mp3') },
  { id: 6,  title: '3AM Izakaya',                bpm: 105, key: 'F major',       camelot: '7B',  file: url('3AM Izakaya.mp3') },
  { id: 7,  title: 'Rooftop District',           bpm: 80,  key: 'E minor',       camelot: '9A',  file: url('Rooftop District.mp3') },
  { id: 8,  title: 'Shibuya Lights',             bpm: 130, key: 'E minor',       camelot: '9A',  file: url('Shibuya Lights.mp3') },
  { id: 9,  title: 'Tokyo Static',               bpm: 149, key: 'B minor',       camelot: '10A', file: url('Tokyo Static.mp3') },
  { id: 10, title: 'After Curfew',               bpm: 139, key: 'E minor',       camelot: '9A',  file: url('After Curfew.mp3') },
  { id: 11, title: 'Ghost Signal',               bpm: 134, key: 'G minor',       camelot: '6A',  file: url('Ghost Signal.mp3') },
  { id: 12, title: '808 Sakura',                 bpm: 95,  key: 'D\u266F minor', camelot: '2A',  file: url('808 Sakura.mp3') },
  { id: 13, title: 'Midnight Vending Machines',  bpm: 90,  key: 'F\u266F minor', camelot: '11A', file: url('Midnight Vending Machines.mp3') },
  { id: 14, title: 'Rain on Kanji',              bpm: 91,  key: 'E minor',       camelot: '9A',  file: url('Rain on Kanji.mp3') },
  { id: 15, title: 'Last Train Home',            bpm: 90,  key: 'E minor',       camelot: '9A',  file: url('Last Train Home.mp3') },
  { id: 16, title: 'Neon Crosswalk',             bpm: 84,  key: 'G minor',       camelot: '6A',  file: url('Neon Crosswalk.mp3') },
].map(s => ({ ...s, difficulty: difficulty(s.bpm), diffLabel: diffLabel(difficulty(s.bpm)) }));

// Color themes per difficulty
export const DIFF_COLORS = {
  1: '#00ccff',  // CHILL  - cyan
  2: '#00ff88',  // EASY   - green
  3: '#ffaa00',  // MEDIUM - orange
  4: '#ff00ff',  // HARD   - magenta
  5: '#ff2244',  // EXPERT - red
};
