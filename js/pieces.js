// Pièces pour Motris 8×8 : Barres de 2, Barres de 3, Formes en L et Jetons uniques

export const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);
export const RARE_LETTERS = new Set(['K', 'W', 'X', 'Y', 'Z', 'Q', 'J', 'H']);

export const LETTER_POINTS = {
  A: 1, E: 1, I: 1, N: 1, O: 1, R: 1, S: 1, T: 1, U: 1, L: 1,
  D: 2, G: 2, M: 2,
  B: 3, C: 3, P: 3,
  F: 4, H: 4, V: 4,
  J: 8, Q: 8,
  K: 10, W: 10, X: 10, Y: 10, Z: 10,
  '★': 5, '💣': 5, '⚡': 5
};

const VOWEL_POOL = 'EEEEEEEEEEAAAAAAIIIIIIOOOOOOUUUU';
const CONSONANT_POOL = 'SSSSSSRRRRRRNNNNNNTTTTTTLLLLLDDDDCCCPPPPMMMMFFVVBBGGHHQJXZ';

export const SHAPES = {
  BAR2:   [[0, 0], [1, 0]],
  BAR3:   [[0, 0], [1, 0], [2, 0]],
  L3:     [[0, 0], [0, 1], [1, 1]],
  SINGLE: [[0, 0]]
};

// Distribution dynamique : beaucoup de barres de 2/3 et de L, + jetons uniques tactiques
const SHAPE_BAG = ['BAR2', 'BAR2', 'BAR2', 'BAR3', 'BAR3', 'L3', 'L3', 'L3', 'SINGLE'];

function pickRandom(str) {
  return str[Math.floor(Math.random() * str.length)];
}

export function getLetterCategory(ch) {
  if (ch === '★') return 'joker';
  if (ch === '💣') return 'bomb';
  if (ch === '⚡') return 'lightning';
  if (RARE_LETTERS.has(ch)) return 'rare';
  if (VOWELS.has(ch)) return 'vowel';
  return 'consonant';
}

export function normalizeBlocks(blocks) {
  const minX = Math.min(...blocks.map(b => b.x));
  const minY = Math.min(...blocks.map(b => b.y));
  return blocks.map(b => ({
    x: b.x - minX,
    y: b.y - minY,
    letter: b.letter
  }));
}

export class PieceGenerator {
  constructor() {
    this.bag = [];
  }

  nextShape() {
    if (this.bag.length === 0) {
      this.bag = [...SHAPE_BAG];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  generatePiece(jokerChance = 0.08) {
    const type = this.nextShape();
    const coords = SHAPES[type].map(([x, y]) => ({ x, y }));
    const count = coords.length;

    const letters = [];
    if (count === 1) {
      // Jeton unique : souvent une voyelle utile, une consonne ou un ★ Joker !
      if (Math.random() < Math.max(0.28, jokerChance)) {
        letters.push('★');
      } else {
        letters.push(Math.random() < 0.5 ? pickRandom(VOWEL_POOL) : pickRandom(CONSONANT_POOL));
      }
    } else {
      const vowelCount = count === 2
        ? (Math.random() < 0.8 ? 1 : 2)
        : (Math.random() < 0.55 ? 1 : 2);
      for (let i = 0; i < vowelCount; i++) letters.push(pickRandom(VOWEL_POOL));
      for (let i = vowelCount; i < count; i++) letters.push(pickRandom(CONSONANT_POOL));

      if (Math.random() < jokerChance) {
        letters[Math.floor(Math.random() * count)] = '★';
      }
      // Mélanger les lettres
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
    }

    const blocks = coords.map((c, i) => ({ x: c.x, y: c.y, letter: letters[i] }));
    const piece = { type, blocks: normalizeBlocks(blocks) };

    // Orientation initiale variée pour les barres et les L
    const rots = type === 'SINGLE' ? 0 : Math.floor(Math.random() * 4);
    for (let r = 0; r < rots; r++) {
      rotatePieceInPlace(piece);
    }
    return piece;
  }

  randomStartingLetter() {
    return Math.random() < 0.45 ? pickRandom(VOWEL_POOL) : pickRandom(CONSONANT_POOL);
  }
}

export function rotatePieceInPlace(piece) {
  if (!piece || piece.blocks.length <= 1) return;
  const rotated = piece.blocks.map(b => ({
    x: -b.y,
    y: b.x,
    letter: b.letter
  }));
  piece.blocks = normalizeBlocks(rotated);
}

export function permutePieceLetters(piece) {
  if (!piece || piece.blocks.length <= 1) return;
  const letters = piece.blocks.map(b => b.letter);
  const last = letters.pop();
  letters.unshift(last);
  piece.blocks.forEach((b, i) => {
    b.letter = letters[i];
  });
}

export function getPieceDimensions(piece) {
  const maxX = Math.max(...piece.blocks.map(b => b.x));
  const maxY = Math.max(...piece.blocks.map(b => b.y));
  return { w: maxX + 1, h: maxY + 1 };
}
