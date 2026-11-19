import { LetterBag } from './pieces.js?v=6';
import { findMatches, pickTargetWord, previewGhostWords } from './words.js?v=7';
import { Renderer } from './renderer.js?v=8';
import { sound } from './audio.js?v=6';

const COLS = 10;
const ROWS = 15;
const CLEAR_DURATION = 420; // ms d'animation avant explosion
const FEVER_DURATION = 14000; // 14s de Mode Fièvre

// Éléments DOM
const gameCanvas = document.getElementById('gameCanvas');
const nextCanvas = document.getElementById('nextCanvas');
const boardFrame = document.getElementById('boardFrame');
const targetBanner = document.getElementById('targetBanner');
const targetWordDisplay = document.getElementById('targetWordDisplay');
const mobileNextLetter = document.getElementById('mobileNextLetter');

const scoreVal = document.getElementById('scoreVal');
const bestVal = document.getElementById('bestVal');
const levelVal = document.getElementById('levelVal');
const levelLabel = document.getElementById('levelLabel');
const modeBadge = document.getElementById('modeBadge');
const feverFill = document.getElementById('feverFill');
const feverStatus = document.getElementById('feverStatus');
const wordFeed = document.getElementById('wordFeed');

const startOverlay = document.getElementById('startOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const helpModal = document.getElementById('helpModal');

const finalScore = document.getElementById('finalScore');
const finalTargets = document.getElementById('finalTargets');
const finalWords = document.getElementById('finalWords');
const gameOverTitle = document.getElementById('gameOverTitle');

const renderer = new Renderer(gameCanvas, COLS, ROWS);
const bag = new LetterBag();

// État du jeu
const state = {
  mode: 'classic', // 'classic' | 'blitz' | 'zen'
  phase: 'MENU',   // 'MENU' | 'PLAYING' | 'CLEARING' | 'FALLING' | 'PAUSED' | 'GAMEOVER'
  grid: createEmptyGrid(),
  activePiece: null,
  nextPiece: null,
  ghostY: 0,
  ghostMatches: new Set(),

  targetWord: 'LUNE',
  targetsCompleted: 0,
  pendingNewTarget: false,

  score: 0,
  bestScore: Number(localStorage.getItem('motris_best') || 0),
  level: 1,
  wordsCount: 0,
  combo: 0,

  fever: 0,
  feverActive: false,
  feverEndTime: 0,

  blitzRemaining: 180000,
  dropTimer: 0,
  lastTime: 0,

  clearingSet: null,
  clearingWords: [],
  clearingStart: 0,
  clearingProgress: 0
};

bestVal.textContent = state.bestScore.toLocaleString('fr-FR');

function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function renderTargetWordUI(word) {
  targetWordDisplay.innerHTML = '';
  for (const ch of word) {
    const span = document.createElement('span');
    span.className = 'target-tile';
    span.textContent = ch;
    targetWordDisplay.appendChild(span);
  }
}

function assignNewTargetWord() {
  state.targetWord = pickTargetWord(state.level, state.targetWord);
  bag.setTargetWord(state.targetWord);
  renderTargetWordUI(state.targetWord);
}

function getDropInterval() {
  if (state.mode === 'zen') return Infinity;
  const base = state.mode === 'blitz' ? 680 : Math.max(160, 820 - (state.level - 1) * 70);
  return state.feverActive ? base * 1.2 : base;
}

function isValidPosition(piece, offsetX = 0, offsetY = 0) {
  for (const b of piece.blocks) {
    const nx = piece.x + b.x + offsetX;
    const ny = piece.y + b.y + offsetY;
    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
    if (ny >= 0 && state.grid[ny][nx]) return false;
  }
  return true;
}

function computeGhost() {
  if (!state.activePiece) return;
  let gy = state.activePiece.y;
  while (isValidPosition(state.activePiece, 0, gy - state.activePiece.y + 1)) {
    gy++;
  }
  state.ghostY = gy;
  state.ghostMatches = previewGhostWords(state.grid, state.activePiece, gy, state.targetWord, 3);
}

function spawnNextPiece() {
  if (state.pendingNewTarget) {
    state.pendingNewTarget = false;
    assignNewTargetWord();
    state.nextPiece = bag.generatePiece(COLS);
  }

  if (!state.nextPiece) {
    state.nextPiece = bag.generatePiece(COLS);
  }
  state.activePiece = state.nextPiece;
  state.nextPiece = bag.generatePiece(COLS);
  state.dropTimer = 0;

  renderer.renderMiniPiece(nextCanvas, state.nextPiece, state.feverActive);
  if (mobileNextLetter && state.nextPiece?.blocks?.[0]) {
    mobileNextLetter.textContent = state.nextPiece.blocks[0].letter;
  }

  if (!isValidPosition(state.activePiece)) {
    triggerGameOver('GRILLE PLEINE');
    return;
  }
  state.phase = 'PLAYING';
  computeGhost();
}

function startGame() {
  sound.init();
  state.grid = createEmptyGrid();
  state.score = 0;
  state.level = 1;
  state.wordsCount = 0;
  state.targetsCompleted = 0;
  state.pendingNewTarget = false;
  state.combo = 0;
  state.fever = 0;
  state.feverActive = false;
  state.nextPiece = null;
  state.blitzRemaining = 180000;
  state.clearingSet = null;
  state.phase = 'PLAYING';

  boardFrame.classList.remove('fever-active');
  wordFeed.innerHTML = '<li class="word-empty">Forme le mot cible…</li>';

  assignNewTargetWord();

  modeBadge.textContent =
    state.mode === 'classic' ? 'CLASSIQUE' : state.mode === 'blitz' ? 'BLITZ 3M' : 'ZEN';
  levelLabel.textContent = state.mode === 'blitz' ? 'TEMPS' : 'NIV.';

  updateHUD();
  hideAllOverlays();
  spawnNextPiece();
}

function triggerGameOver(title = 'PARTIE TERMINÉE') {
  state.phase = 'GAMEOVER';
  sound.gameOver();

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem('motris_best', String(state.bestScore));
    bestVal.textContent = state.bestScore.toLocaleString('fr-FR');
  }

  gameOverTitle.textContent = title;
  finalScore.textContent = state.score.toLocaleString('fr-FR');
  finalTargets.textContent = String(state.targetsCompleted);
  finalWords.textContent = String(state.wordsCount);
  gameOverOverlay.classList.add('active');
}

function hideAllOverlays() {
  startOverlay.classList.remove('active');
  pauseOverlay.classList.remove('active');
  gameOverOverlay.classList.remove('active');
}

function updateHUD() {
  scoreVal.textContent = state.score.toLocaleString('fr-FR');
  if (state.mode === 'blitz') {
    const secs = Math.max(0, Math.ceil(state.blitzRemaining / 1000));
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    levelVal.textContent = `${m}:${s}`;
  } else {
    levelVal.textContent = String(state.level);
  }

  const pct = Math.min(100, Math.round(state.fever));
  feverFill.style.width = `${pct}%`;
  feverStatus.textContent = state.feverActive ? 'FLUO ×3' : `${pct}%`;
}

function addWordToFeed(entry) {
  const empty = wordFeed.querySelector('.word-empty');
  if (empty) empty.remove();

  const li = document.createElement('li');
  const tag = entry.isTarget ? '<span class="word-badge-sq">🎯 CIBLE</span>' : '';
  li.innerHTML = `<span>${entry.word}${tag}</span><span class="word-pts">+${entry.points.toLocaleString('fr-FR')}</span>`;
  wordFeed.prepend(li);

  while (wordFeed.children.length > 12) {
    wordFeed.lastElementChild.remove();
  }
}

// Actions simples du joueur : Gauche, Droite, Bas, Chute directe
function movePiece(dx) {
  if (state.phase !== 'PLAYING' || !state.activePiece) return;
  if (isValidPosition(state.activePiece, dx, 0)) {
    state.activePiece.x += dx;
    sound.move();
    computeGhost();
  }
}

function softDrop() {
  if (state.phase !== 'PLAYING' || !state.activePiece) return;
  if (isValidPosition(state.activePiece, 0, 1)) {
    state.activePiece.y++;
    state.dropTimer = 0;
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (state.phase !== 'PLAYING' || !state.activePiece) return;
  state.activePiece.y = state.ghostY;
  sound.drop();
  lockPiece();
}

function applyColumnGravity() {
  let moved = false;
  for (let c = 0; c < COLS; c++) {
    let writeR = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.grid[r][c]) {
        if (r !== writeR) {
          state.grid[writeR][c] = state.grid[r][c];
          state.grid[r][c] = null;
          moved = true;
        }
        writeR--;
      }
    }
  }
  return moved;
}

function lockPiece() {
  const p = state.activePiece;
  for (const b of p.blocks) {
    const r = p.y + b.y;
    const c = p.x + b.x;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      state.grid[r][c] = { letter: b.letter, visualY: r };
    }
  }
  state.activePiece = null;
  state.ghostMatches = new Set();
  state.combo = 0;
  sound.lock();

  if (applyColumnGravity()) {
    state.phase = 'FALLING';
  } else {
    checkBoardMatches();
  }
}

function checkBoardMatches() {
  const { matchedCells, foundWords, targetCompleted } = findMatches(state.grid, state.targetWord, 3);

  if (matchedCells.size > 0) {
    state.combo++;
    state.phase = 'CLEARING';
    state.clearingSet = matchedCells;
    state.clearingWords = foundWords;
    state.clearingStart = performance.now();
    state.clearingProgress = 0;

    sound.wordClear(state.combo, targetCompleted);
    renderer.triggerShake(targetCompleted ? 12 : state.combo > 1 ? 8 : 4);

    if (targetCompleted) {
      state.targetsCompleted++;
      state.pendingNewTarget = true;
      state.level = 1 + Math.floor(state.targetsCompleted / 2);

      targetBanner.classList.add('celebrate');
      setTimeout(() => targetBanner.classList.remove('celebrate'), 700);
    }

    foundWords.forEach((w, idx) => {
      const mult = (state.feverActive ? 3 : 1) * state.combo;
      const pts = w.points * mult;
      state.score += pts;
      state.wordsCount++;

      addWordToFeed({ word: w.word, points: pts, isTarget: w.isTarget });

      const midCell = w.cells[Math.floor(w.cells.length / 2)];
      const formattedPts = pts.toLocaleString('fr-FR');
      const label = w.isTarget
        ? `🎯 ${w.word} +${formattedPts} !`
        : `${w.word} +${formattedPts}`;

      renderer.spawnPopup(
        label,
        midCell[0] - idx * 0.9,
        midCell[1],
        w.isTarget ? '#00ff88' : '#ffea00',
        w.isTarget ? 1.3 : 1.0
      );
    });

    if (state.combo > 1) {
      renderer.spawnPopup(`⚡ CASCADE ×${state.combo} !`, 4, COLS / 2, '#00f5ff', 1.25);
    }

    // Progression Fièvre
    if (!state.feverActive) {
      const feverGain = targetCompleted ? 45 : foundWords.length * 14;
      state.fever = Math.min(100, state.fever + feverGain + (state.combo - 1) * 12);
      if (state.fever >= 100) {
        state.feverActive = true;
        state.feverEndTime = performance.now() + FEVER_DURATION;
        boardFrame.classList.add('fever-active');
        sound.fever();
        renderer.spawnPopup('🔥 FIÈVRE FLUO ×3 !', 6, COLS / 2, '#ff2aff', 1.35);
      }
    }

    updateHUD();
  } else {
    spawnNextPiece();
  }
}

function finishClearingAndApplyGravity() {
  if (!state.clearingSet) {
    state.phase = 'PLAYING';
    return;
  }

  for (const key of state.clearingSet) {
    const [r, c] = key.split(',').map(Number);
    const cell = state.grid[r][c];
    if (cell) {
      renderer.spawnParticles(r, c, cell.letter, 16);
      state.grid[r][c] = null;
    }
  }
  state.clearingSet = null;
  state.clearingWords = [];

  if (applyColumnGravity()) {
    state.phase = 'FALLING';
  } else {
    state.phase = 'PLAYING';
    checkBoardMatches();
  }
}

// Boucle principale (60 FPS)
function loop(now) {
  const dt = Math.min(50, now - (state.lastTime || now));
  state.lastTime = now;

  // Mode Fièvre
  if (state.feverActive && state.phase !== 'PAUSED' && state.phase !== 'MENU') {
    const rem = state.feverEndTime - now;
    if (rem <= 0) {
      state.feverActive = false;
      state.fever = 0;
      boardFrame.classList.remove('fever-active');
    } else {
      state.fever = (rem / FEVER_DURATION) * 100;
    }
    updateHUD();
  }

  // Chrono Blitz
  if (state.mode === 'blitz' && (state.phase === 'PLAYING' || state.phase === 'CLEARING' || state.phase === 'FALLING')) {
    state.blitzRemaining -= dt;
    updateHUD();
    if (state.blitzRemaining <= 0) {
      triggerGameOver('TEMPS ÉCOULÉ !');
    }
  }

  try {
    if (state.phase === 'PLAYING') {
      const interval = getDropInterval();
      if (interval !== Infinity) {
        state.dropTimer += dt;
        if (state.dropTimer >= interval) {
          state.dropTimer = 0;
          softDrop();
        }
      }
    } else if (state.phase === 'CLEARING') {
      state.clearingProgress = Math.min(1, (now - state.clearingStart) / CLEAR_DURATION);
      if (state.clearingProgress >= 1) {
        finishClearingAndApplyGravity();
      }
    } else if (state.phase === 'FALLING') {
      let stillFalling = false;
      const speed = 0.36;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = state.grid[r][c];
          if (cell && cell.visualY < r) {
            cell.visualY = Math.min(r, cell.visualY + speed);
            if (cell.visualY < r) stillFalling = true;
          }
        }
      }
      if (!stillFalling) {
        state.phase = 'PLAYING';
        checkBoardMatches();
      }
    }

    renderer.updateEffects();
    renderer.render(state, now);
  } catch (err) {
    console.error('Erreur boucle Motris:', err);
    if (state.phase === 'CLEARING' || state.phase === 'FALLING') {
      state.clearingSet = null;
      state.phase = 'PLAYING';
      if (!state.activePiece) spawnNextPiece();
    }
  }

  requestAnimationFrame(loop);
}

// --- Commandes Clavier (ultra simples : Gauche, Droite, Bas, Espace) ---
window.addEventListener('keydown', (e) => {
  if (helpModal.classList.contains('open')) {
    if (e.key === 'Escape') helpModal.classList.remove('open');
    return;
  }

  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    togglePause();
    return;
  }

  if (state.phase !== 'PLAYING') return;

  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      e.preventDefault();
      movePiece(-1);
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      e.preventDefault();
      movePiece(1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      softDrop();
      break;
    case ' ':
      e.preventDefault();
      hardDrop();
      break;
  }
});

// --- Boutons Tactiles ---
document.querySelectorAll('.touch-btn').forEach(btn => {
  const action = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (action === 'left') movePiece(-1);
    else if (action === 'right') movePiece(1);
    else if (action === 'down') softDrop();
    else if (action === 'drop') hardDrop();
  });
});

// Glisser directement sur le plateau (mobile)
let touchStartX = 0;
let touchStartY = 0;

gameCanvas.addEventListener('touchstart', (e) => {
  if (state.phase !== 'PLAYING') return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

gameCanvas.addEventListener('touchmove', (e) => {
  if (state.phase !== 'PLAYING') return;
  const t = e.touches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  if (Math.abs(dx) > 28) {
    movePiece(dx > 0 ? 1 : -1);
    touchStartX = t.clientX;
  } else if (dy > 42) {
    softDrop();
    touchStartY = t.clientY;
  }
}, { passive: true });

// --- UI & Menus ---
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.mode = btn.dataset.mode;
  });
});

document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('restartFromPauseBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('menuBtn').addEventListener('click', () => {
  hideAllOverlays();
  state.phase = 'MENU';
  startOverlay.classList.add('active');
});

function togglePause() {
  if (state.phase === 'PLAYING') {
    state.phase = 'PAUSED';
    pauseOverlay.classList.add('active');
  } else if (state.phase === 'PAUSED') {
    state.phase = 'PLAYING';
    pauseOverlay.classList.remove('active');
  }
}

document.getElementById('pauseBtn').addEventListener('click', togglePause);

const soundBtn = document.getElementById('soundBtn');
soundBtn.addEventListener('click', () => {
  const muted = sound.toggleMute();
  soundBtn.textContent = muted ? '🔇' : '🔊';
});

document.getElementById('helpBtn').addEventListener('click', () => {
  helpModal.classList.add('open');
});
document.getElementById('closeHelpBtn').addEventListener('click', () => {
  helpModal.classList.remove('open');
});
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.remove('open');
});

window.addEventListener('resize', () => {
  renderer.resize();
});

// Afficher un mot exemple dans le bandeau au chargement
renderTargetWordUI('MOTRIS');
requestAnimationFrame(loop);
