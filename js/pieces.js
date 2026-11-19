// Générateur de lettres individuelles guidé par le Mot Cible

export const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);
export const RARE_LETTERS = new Set(['K', 'W', 'X', 'Y', 'Z', 'Q', 'J', 'H']);

export const LETTER_POINTS = {
  A: 1, E: 1, I: 1, N: 1, O: 1, R: 1, S: 1, T: 1, U: 1, L: 1,
  D: 2, G: 2, M: 2,
  B: 3, C: 3, P: 3,
  F: 4, H: 4, V: 4,
  J: 8, Q: 8,
  K: 10, W: 10, X: 10, Y: 10, Z: 10
};

const DISTRACTOR_POOL = 'EEEAAAIINOORRSSTTTLLDDCCMPPBVVFFGG';

function pickRandom(str) {
  return str[Math.floor(Math.random() * str.length)];
}

export function getLetterCategory(ch) {
  if (RARE_LETTERS.has(ch)) return 'rare';
  if (VOWELS.has(ch)) return 'vowel';
  return 'consonant';
}

export class LetterBag {
  constructor() {
    this.bag = [];
    this.targetWord = '';
  }

  setTargetWord(word) {
    this.targetWord = word;
    this.bag = [];
    this.refill();
  }

  refill() {
    const letters = this.targetWord ? this.targetWord.split('') : ['A', 'E', 'R', 'S', 'T'];
    // Ajouter 2 lettres parasites courantes pour le challenge (permettent aussi des mots bonus)
    const extraCount = 2;
    for (let i = 0; i < extraCount; i++) {
      letters.push(pickRandom(DISTRACTOR_POOL));
    }
    // Mélanger le sac
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    this.bag = letters;
  }

  generatePiece(boardCols) {
    if (this.bag.length === 0) {
      this.refill();
    }
    const letter = this.bag.pop();
    const startX = Math.floor(boardCols / 2);

    return {
      x: startX,
      y: 0,
      blocks: [{ x: 0, y: 0, letter }]
    };
  }
}
