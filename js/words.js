import { DICT_RAW } from '../data/dictionnaire.js?v=13';
import { TARGET_WORDS } from '../data/mots_cibles.js?v=9';
import { LETTER_POINTS, RARE_LETTERS } from './pieces.js?v=9';

const ALPHABET = 'EAINOSRTLUDCMPGBVHFQYXJKWZ';

export const WORD_SET = new Set(DICT_RAW.split(' '));
Object.values(TARGET_WORDS).flat().forEach(w => WORD_SET.add(w));

const resolveCache = new Map();

export function resolveWord(str) {
  if (str.length < 3 || str.length > 8) return null;
  if (str.includes('💣') || str.includes('⚡')) return null;

  const starIdx = str.indexOf('★');
  if (starIdx === -1) {
    return WORD_SET.has(str) ? str : null;
  }

  if (resolveCache.has(str)) return resolveCache.get(str);

  let starCount = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '★') starCount++;
  }
  if (starCount > 2) {
    const res = resolveWord(str.replace('★', 'E'));
    resolveCache.set(str, res);
    return res;
  }

  let result = null;
  for (let i = 0; i < ALPHABET.length; i++) {
    const cand = str.slice(0, starIdx) + ALPHABET[i] + str.slice(starIdx + 1);
    if (starCount === 1) {
      if (WORD_SET.has(cand)) { result = cand; break; }
    } else {
      const nextStar = cand.indexOf('★');
      for (let j = 0; j < ALPHABET.length; j++) {
        const cand2 = cand.slice(0, nextStar) + ALPHABET[j] + cand.slice(nextStar + 1);
        if (WORD_SET.has(cand2)) { result = cand2; break; }
      }
      if (result) break;
    }
  }

  if (resolveCache.size > 4000) resolveCache.clear();
  resolveCache.set(str, result);
  return result;
}

export function isLetterTile(cell) {
  return cell && cell.letter !== '💣' && cell.letter !== '⚡';
}

export function scoreWord(word, rawLetters, cellMult = 1) {
  const baseByLen = { 3: 600, 4: 1800, 5: 4200, 6: 9000, 7: 16000, 8: 30000 };
  let base = baseByLen[Math.min(word.length, 8)] || 600;
  let letterBonus = 0;
  let hasRare = false;

  for (const ch of rawLetters) {
    letterBonus += (LETTER_POINTS[ch] || 1) * 120;
    if (RARE_LETTERS.has(ch)) hasRare = true;
  }

  let total = base + letterBonus;
  if (hasRare) total = Math.round(total * 1.5);
  total = Math.round(total * cellMult);
  return total;
}

// Scanne la grille 8×8 (horizontal et vertical) + déclenche Bombes & Éclairs touchés
export function findMatches(grid, bonusMap = new Map(), minLen = 3) {
  const size = grid.length;
  const matchedCells = new Set();
  const foundWords = [];
  const triggeredBombs = [];
  const triggeredLightnings = [];
  const usedBonuses = new Set();

  const computeCellMult = (cells) => {
    let mult = 1;
    for (const [r, c] of cells) {
      const k = `${r},${c}`;
      const b = bonusMap.get(k);
      if (b) {
        mult *= b;
        usedBonuses.add(k);
      }
    }
    return mult;
  };

  // 1. Mots Horizontaux (gauche -> droite)
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!isLetterTile(grid[r][c])) { c++; continue; }
      let end = c;
      while (end < size && isLetterTile(grid[r][end])) end++;
      const segLen = end - c;

      if (segLen >= minLen) {
        let best = null;
        for (let len = Math.min(segLen, 8); len >= minLen; len--) {
          for (let start = c; start <= end - len; start++) {
            let raw = '';
            for (let k = 0; k < len; k++) raw += grid[r][start + k].letter;
            const resolved = resolveWord(raw);
            if (resolved) { best = { resolved, raw, start, len }; break; }
          }
          if (best) break;
        }
        if (best) {
          const cells = [];
          for (let k = 0; k < best.len; k++) {
            cells.push([r, best.start + k]);
            matchedCells.add(`${r},${best.start + k}`);
          }
          const cellMult = computeCellMult(cells);
          foundWords.push({
            word: best.resolved,
            cells,
            points: scoreWord(best.resolved, best.raw, cellMult),
            cellMult
          });
        }
      }
      c = end + 1;
    }
  }

  // 2. Mots Verticaux (haut -> bas)
  for (let c = 0; c < size; c++) {
    let r = 0;
    while (r < size) {
      if (!isLetterTile(grid[r][c])) { r++; continue; }
      let end = r;
      while (end < size && isLetterTile(grid[end][c])) end++;
      const segLen = end - r;

      if (segLen >= minLen) {
        let best = null;
        for (let len = Math.min(segLen, 8); len >= minLen; len--) {
          for (let start = r; start <= end - len; start++) {
            let raw = '';
            for (let k = 0; k < len; k++) raw += grid[start + k][c].letter;
            const resolved = resolveWord(raw);
            if (resolved) { best = { resolved, raw, start, len }; break; }
          }
          if (best) break;
        }
        if (best) {
          const cells = [];
          for (let k = 0; k < best.len; k++) {
            cells.push([best.start + k, c]);
            matchedCells.add(`${best.start + k},${c}`);
          }
          const cellMult = computeCellMult(cells);
          foundWords.push({
            word: best.resolved,
            cells,
            points: scoreWord(best.resolved, best.raw, cellMult),
            cellMult
          });
        }
      }
      r = end + 1;
    }
  }

  // 3. Réaction en chaîne : Bombes (3×3) et Éclairs (Ligne + Colonne) adjacents aux mots validés
  if (matchedCells.size > 0) {
    const bombSeen = new Set();
    const lightSeen = new Set();
    const queue = [...matchedCells];

    while (queue.length > 0) {
      const key = queue.pop();
      const [r, c] = key.split(',').map(Number);

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const neighbor = grid[nr][nc];
          if (!neighbor) continue;
          const nKey = `${nr},${nc}`;

          if (neighbor.letter === '💣' && !bombSeen.has(nKey)) {
            bombSeen.add(nKey);
            triggeredBombs.push({ r: nr, c: nc });
            for (let br = -1; br <= 1; br++) {
              for (let bc = -1; bc <= 1; bc++) {
                const tr = nr + br;
                const tc = nc + bc;
                if (tr >= 0 && tr < size && tc >= 0 && tc < size && grid[tr][tc]) {
                  const tk = `${tr},${tc}`;
                  if (!matchedCells.has(tk)) {
                    matchedCells.add(tk);
                    queue.push(tk);
                  }
                }
              }
            }
          } else if (neighbor.letter === '⚡' && !lightSeen.has(nKey)) {
            lightSeen.add(nKey);
            triggeredLightnings.push({ r: nr, c: nc });
            for (let i = 0; i < size; i++) {
              if (grid[nr][i]) {
                const tk = `${nr},${i}`;
                if (!matchedCells.has(tk)) { matchedCells.add(tk); queue.push(tk); }
              }
              if (grid[i][nc]) {
                const tk = `${i},${nc}`;
                if (!matchedCells.has(tk)) { matchedCells.add(tk); queue.push(tk); }
              }
            }
          }
        }
      }
    }
  }

  return { matchedCells, foundWords, triggeredBombs, triggeredLightnings, usedBonuses };
}

export function canPlacePiece(grid, piece, row, col) {
  if (!piece) return false;
  const size = grid.length;
  for (const b of piece.blocks) {
    const r = row + b.y;
    const c = col + b.x;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    if (grid[r][c]) return false;
  }
  return true;
}

export function previewPlacement(grid, bonusMap, piece, row, col) {
  if (!canPlacePiece(grid, piece, row, col)) {
    return { valid: false, matchedCells: new Set(), foundWords: [] };
  }
  const sim = grid.map(r => r.slice());
  for (const b of piece.blocks) {
    sim[row + b.y][col + b.x] = { letter: b.letter };
  }
  const res = findMatches(sim, bonusMap, 3);
  return { valid: true, ...res };
}
