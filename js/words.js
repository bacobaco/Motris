import { DICT_RAW } from '../data/dictionnaire.js';
import { TARGET_WORDS } from '../data/mots_cibles.js?v=6';
import { LETTER_POINTS, RARE_LETTERS } from './pieces.js?v=6';

// Dictionnaire complet + garantie que tous les mots cibles sont présents
export const WORD_SET = new Set(DICT_RAW.split(' '));
Object.values(TARGET_WORDS).flat().forEach(w => WORD_SET.add(w));

// Choisit un nouveau Mot Cible adapté au niveau
export function pickTargetWord(level = 1, lastWord = '') {
  let pool;
  if (level <= 2) {
    pool = TARGET_WORDS[4];
  } else if (level <= 4) {
    pool = [...TARGET_WORDS[4], ...TARGET_WORDS[5]];
  } else if (level <= 6) {
    pool = [...TARGET_WORDS[5], ...TARGET_WORDS[6]];
  } else {
    pool = [...TARGET_WORDS[5], ...TARGET_WORDS[6], ...TARGET_WORDS[7]];
  }

  let word = pool[Math.floor(Math.random() * pool.length)];
  if (word === lastWord && pool.length > 1) {
    word = pool[(pool.indexOf(word) + 1) % pool.length];
  }
  return word;
}

// Score : le Mot Cible rapporte ÉNORMÉMENT, les mots bonus rapportent moins
export function scoreWord(word, isTarget = false) {
  if (isTarget) {
    return word.length * 5000;
  }
  const baseByLen = { 3: 400, 4: 1000, 5: 2200, 6: 4000, 7: 6500 };
  let base = baseByLen[Math.min(word.length, 7)] || 400;
  let bonus = 0;
  let hasRare = false;
  for (const ch of word) {
    bonus += (LETTER_POINTS[ch] || 1) * 50;
    if (RARE_LETTERS.has(ch)) hasRare = true;
  }
  return Math.round((base + bonus) * (hasRare ? 1.5 : 1));
}

// Scanne la grille (horizontal et vertical uniquement)
// Le Mot Cible explose AVEC toutes ses cases adjacentes !
export function findMatches(grid, targetWord = '', minLen = 3) {
  const rows = grid.length;
  const cols = grid[0].length;
  const matchedCells = new Set();
  const foundWords = []; // { word, cells, points, isTarget }
  let targetCompleted = false;

  const addAdjacentHalo = (cells) => {
    for (const [r, c] of cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc]) {
            matchedCells.add(`${nr},${nc}`);
          }
        }
      }
    }
  };

  // 1. Scan Horizontal (gauche -> droite)
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!grid[r][c]) { c++; continue; }
      let end = c;
      while (end < cols && grid[r][end]) end++;
      const segLen = end - c;

      if (segLen >= minLen) {
        let segStr = '';
        for (let k = c; k < end; k++) segStr += grid[r][k].letter;

        // Priorité absolue au Mot Cible
        if (targetWord && segStr.includes(targetWord)) {
          const idx = segStr.indexOf(targetWord);
          const cells = [];
          for (let k = 0; k < targetWord.length; k++) {
            cells.push([r, c + idx + k]);
            matchedCells.add(`${r},${c + idx + k}`);
          }
          addAdjacentHalo(cells);
          targetCompleted = true;
          foundWords.push({
            word: targetWord,
            cells,
            points: scoreWord(targetWord, true),
            isTarget: true
          });
        } else {
          // Sinon, mot bonus français le plus long dans ce segment
          let best = null;
          for (let len = Math.min(segLen, 10); len >= minLen; len--) {
            for (let start = 0; start <= segLen - len; start++) {
              const sub = segStr.slice(start, start + len);
              if (WORD_SET.has(sub)) {
                best = { word: sub, start: c + start, len };
                break;
              }
            }
            if (best) break;
          }
          if (best) {
            const cells = [];
            for (let k = 0; k < best.len; k++) {
              cells.push([r, best.start + k]);
              matchedCells.add(`${r},${best.start + k}`);
            }
            foundWords.push({
              word: best.word,
              cells,
              points: scoreWord(best.word, false),
              isTarget: false
            });
          }
        }
      }
      c = end + 1;
    }
  }

  // 2. Scan Vertical (haut -> bas)
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (!grid[r][c]) { r++; continue; }
      let end = r;
      while (end < rows && grid[end][c]) end++;
      const segLen = end - r;

      if (segLen >= minLen) {
        let segStr = '';
        for (let k = r; k < end; k++) segStr += grid[k][c].letter;

        if (targetWord && segStr.includes(targetWord)) {
          const idx = segStr.indexOf(targetWord);
          const cells = [];
          for (let k = 0; k < targetWord.length; k++) {
            cells.push([r + idx + k, c]);
            matchedCells.add(`${r + idx + k},${c}`);
          }
          addAdjacentHalo(cells);
          targetCompleted = true;
          foundWords.push({
            word: targetWord,
            cells,
            points: scoreWord(targetWord, true),
            isTarget: true
          });
        } else {
          let best = null;
          for (let len = Math.min(segLen, 10); len >= minLen; len--) {
            for (let start = 0; start <= segLen - len; start++) {
              const sub = segStr.slice(start, start + len);
              if (WORD_SET.has(sub)) {
                best = { word: sub, start: r + start, len };
                break;
              }
            }
            if (best) break;
          }
          if (best) {
            const cells = [];
            for (let k = 0; k < best.len; k++) {
              cells.push([best.start + k, c]);
              matchedCells.add(`${best.start + k},${c}`);
            }
            foundWords.push({
              word: best.word,
              cells,
              points: scoreWord(best.word, false),
              isTarget: false
            });
          }
        }
      }
      r = end + 1;
    }
  }

  return { matchedCells, foundWords, targetCompleted };
}

// Aperçu en temps réel : renvoie les cellules qui formeraient un mot si la lettre était posée à ghostY
export function previewGhostWords(grid, piece, ghostY, targetWord = '', minLen = 3) {
  if (!piece) return new Set();
  const rows = grid.length;
  const cols = grid[0].length;
  const sim = grid.map(row => row.slice());

  for (const b of piece.blocks) {
    const r = ghostY + b.y;
    const c = piece.x + b.x;
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      sim[r][c] = { letter: b.letter };
    }
  }

  const { matchedCells } = findMatches(sim, targetWord, minLen);
  return matchedCells;
}
