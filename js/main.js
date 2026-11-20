import {
  PieceGenerator,
  rotatePieceInPlace,
  permutePieceLetters,
  getPieceDimensions
} from './pieces.js?v=9';
import { findMatches, canPlacePiece, previewPlacement } from './words.js?v=19';
import { Renderer } from './renderer.js?v=9';
import { sound } from './audio.js?v=9';
import { fetchDefinition } from './definitions.js?v=16';

const GRID_SIZE = 8;
const CLEAR_DURATION = 380;
const FEVER_DURATION = 14000;

// DOM
const gameCanvas = document.getElementById('gameCanvas');
const boardFrame = document.getElementById('boardFrame');
const dragGhost = document.getElementById('dragGhost');

const scoreVal = document.getElementById('scoreVal');
const bestVal = document.getElementById('bestVal');
const comboVal = document.getElementById('comboVal');
const modeBadge = document.getElementById('modeBadge');

const tempoBarWrap = document.getElementById('tempoBarWrap');
const tempoFill = document.getElementById('tempoFill');
const tempoText = document.getElementById('tempoText');
const feverFill = document.getElementById('feverFill');
const feverStatus = document.getElementById('feverStatus');

const slotEls = [
  document.getElementById('slot0'),
  document.getElementById('slot1'),
  document.getElementById('slot2')
];
const slotCanvases = slotEls.map(el => el.querySelector('canvas'));

const rotateBtn = document.getElementById('rotateBtn');
const permuteBtn = document.getElementById('permuteBtn');

const startOverlay = document.getElementById('startOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const helpModal = document.getElementById('helpModal');

const finalScore = document.getElementById('finalScore');
const finalWords = document.getElementById('finalWords');
const finalBestWord = document.getElementById('finalBestWord');

const renderer = new Renderer(gameCanvas, GRID_SIZE);
const gen = new PieceGenerator();

const state = {
  mode: 'arcade', // 'arcade' | 'zen'
  phase: 'MENU',  // 'MENU' | 'PLAYING' | 'CLEARING' | 'PAUSED' | 'GAMEOVER'
  grid: createEmptyGrid(),
  bonusMap: new Map(), // "r,c" -> 2 | 3

  tray: [null, null, null],
  selectedSlot: 0,

  score: 0,
  bestScore: Number(localStorage.getItem('motris8_best') || 0),
  wordsCount: 0,
  bestWord: '',
  bestWordPts: 0,
  combo: 0,
  level: 1,

  tempoMax: 15000,
  tempoRemaining: 15000,

  fever: 0,
  feverActive: false,
  feverEndTime: 0,

  hoverPreview: null, // { piece, row, col, valid, matchedCells, foundWords }
  clearingSet: null,
  clearingStart: 0,
  clearingProgress: 0,

  lastTime: 0
};

bestVal.textContent = state.bestScore.toLocaleString('fr-FR');

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function getEmptyCells() {
  const res = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!state.grid[r][c]) res.push([r, c]);
    }
  }
  return res;
}

function spawnBonusCells(count = 4) {
  const empty = getEmptyCells().filter(([r, c]) => !state.bonusMap.has(`${r},${c}`));
  for (let i = 0; i < count && empty.length > 0; i++) {
    const idx = Math.floor(Math.random() * empty.length);
    const [r, c] = empty.splice(idx, 1)[0];
    state.bonusMap.set(`${r},${c}`, Math.random() < 0.3 ? 3 : 2);
  }
}

function spawnSpecialToken(type = null) {
  const empty = getEmptyCells();
  if (empty.length === 0) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const letter = type || (Math.random() < 0.55 ? '💣' : '⚡');
  state.grid[r][c] = { letter, spawnAnim: 0 };
}

function seedStartingBoard() {
  state.grid = createEmptyGrid();
  state.bonusMap = new Map();

  // 4 cases multiplicateurs ×2 / ×3
  spawnBonusCells(4);

  // 6 lettres de départ espacées autour du centre pour démarrer tout de suite des mots
  const centerCoords = [
    [2, 2], [2, 5], [3, 3], [4, 4], [5, 2], [5, 5], [3, 5], [4, 2]
  ];
  for (let i = centerCoords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [centerCoords[i], centerCoords[j]] = [centerCoords[j], centerCoords[i]];
  }
  for (let i = 0; i < 6; i++) {
    const [r, c] = centerCoords[i];
    state.grid[r][c] = { letter: gen.randomStartingLetter(), spawnAnim: 0 };
  }

  // 1 Bombe 💣 et 1 Éclair ⚡ déjà placés sur le plateau !
  spawnSpecialToken('💣');
  spawnSpecialToken('⚡');
}

function refillTraySlot(idx) {
  const jokerChance = state.feverActive ? 0.16 : 0.08;
  state.tray[idx] = gen.generatePiece(jokerChance);
  renderTray();
}

function renderTray() {
  for (let i = 0; i < 3; i++) {
    const el = slotEls[i];
    el.classList.toggle('selected', i === state.selectedSlot);
    renderer.renderPieceToCanvas(slotCanvases[i], state.tray[i], state.feverActive, 30);
  }
}

function getTempoDuration() {
  return Math.max(9000, 15000 - (state.level - 1) * 800);
}

function resetTempo() {
  state.tempoMax = getTempoDuration();
  state.tempoRemaining = state.tempoMax;
}

function startGame() {
  sound.init();
  seedStartingBoard();
  state.score = 0;
  state.wordsCount = 0;
  state.bestWord = '';
  state.bestWordPts = 0;
  state.combo = 0;
  state.level = 1;
  state.fever = 0;
  state.feverActive = false;
  state.hoverPreview = null;
  state.clearingSet = null;
  state.selectedSlot = 0;
  state.phase = 'PLAYING';

  resetTempo();
  tempoBarWrap.classList.toggle('hidden', state.mode === 'zen');
  boardFrame.classList.remove('fever-active');
  modeBadge.textContent = state.mode === 'arcade' ? 'ARCADE' : 'ZEN';
  if (wordsBar) {
    wordsBar.innerHTML = '<span class="mword-empty">Mots validés (4+ lettres) — clique ou survole pour la définition…</span>';
  }
  hideWordDefinition();

  for (let i = 0; i < 3; i++) refillTraySlot(i);

  updateHUD();
  hideAllOverlays();
  renderer.resize();
}

function hideAllOverlays() {
  startOverlay.classList.remove('active');
  pauseOverlay.classList.remove('active');
  gameOverOverlay.classList.remove('active');
}

function triggerGameOver() {
  state.phase = 'GAMEOVER';
  sound.gameOver();

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem('motris8_best', String(state.bestScore));
    bestVal.textContent = state.bestScore.toLocaleString('fr-FR');
  }

  finalScore.textContent = state.score.toLocaleString('fr-FR');
  finalWords.textContent = String(state.wordsCount);
  finalBestWord.textContent = state.bestWord ? `${state.bestWord} (+${state.bestWordPts.toLocaleString('fr-FR')})` : '—';
  gameOverOverlay.classList.add('active');
}

function updateHUD() {
  scoreVal.textContent = state.score.toLocaleString('fr-FR');
  comboVal.textContent = state.combo > 1 ? `×${state.combo}` : '×1';
  comboVal.classList.toggle('hot', state.combo > 1);

  const pct = Math.min(100, Math.round(state.fever));
  feverFill.style.width = `${pct}%`;
  feverStatus.textContent = state.feverActive ? 'FLUO ×3' : `${pct}%`;

  if (state.mode === 'arcade') {
    const tPct = Math.max(0, (state.tempoRemaining / state.tempoMax) * 100);
    tempoFill.style.width = `${tPct}%`;
    tempoFill.classList.toggle('danger', tPct < 28);
    tempoText.textContent = `${Math.ceil(state.tempoRemaining / 1000)}s`;
  }
}

const defPopover = document.getElementById('defPopover');
const defPopWord = document.getElementById('defPopWord');
const defPopPos = document.getElementById('defPopPos');
const defPopText = document.getElementById('defPopText');
const wordsBar = document.getElementById('wordsBar');
let defHideTimer = null;

function positionDefPopover(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const popW = Math.min(280, window.innerWidth - 20);
  const left = Math.max(10, Math.min(window.innerWidth - popW - 10, rect.left + rect.width / 2 - popW / 2));
  const top = Math.min(window.innerHeight - 130, rect.bottom + 8);

  defPopover.style.left = `${left}px`;
  defPopover.style.top = `${top}px`;
}

async function showWordDefinition(word, anchorEl, autoHideMs = 0) {
  clearTimeout(defHideTimer);
  defPopWord.textContent = word;
  defPopPos.textContent = 'Recherche…';
  defPopText.textContent = 'Chargement de la définition…';
  positionDefPopover(anchorEl);
  defPopover.classList.add('visible');

  const def = await fetchDefinition(word);
  if (defPopover.classList.contains('visible')) {
    defPopWord.textContent = def.title || word;
    defPopPos.textContent = def.pos || 'Français';
    defPopText.textContent = def.text;
    positionDefPopover(anchorEl);
  }

  if (autoHideMs > 0) {
    defHideTimer = setTimeout(hideWordDefinition, autoHideMs);
  }
}

function hideWordDefinition() {
  clearTimeout(defHideTimer);
  defPopover.classList.remove('visible');
}

window.addEventListener('pointerdown', (e) => {
  if (defPopover.classList.contains('visible') && !e.target.closest?.('.mword-chip')) {
    hideWordDefinition();
  }
});

function addWordToFeed(entry) {
  // Précharger la définition en arrière-plan (instantané au survol / tap !)
  fetchDefinition(entry.word);

  if (wordsBar) {
    const empty = wordsBar.querySelector('.mword-empty');
    if (empty) empty.remove();

    const chip = document.createElement('button');
    chip.className = 'mword-chip';
    const mult = entry.cellMult > 1 ? ` ×${entry.cellMult}` : '';
    chip.innerHTML = `${entry.word}${mult} <span>ⓘ</span>`;

    chip.addEventListener('mouseenter', () => showWordDefinition(entry.word, chip));
    chip.addEventListener('mouseleave', hideWordDefinition);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      showWordDefinition(entry.word, chip, 5500);
    });

    wordsBar.prepend(chip);
    while (wordsBar.children.length > 10) {
      wordsBar.lastElementChild.remove();
    }
  }
}

// Vérifie si au moins une des 3 pièces peut encore tenir sur la grille (avec ou sans rotation)
function hasAnyValidMove() {
  for (const piece of state.tray) {
    if (!piece) continue;
    const testPiece = { type: piece.type, blocks: piece.blocks.map(b => ({ ...b })) };
    for (let rot = 0; rot < 4; rot++) {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (canPlacePiece(state.grid, testPiece, r, c)) return true;
        }
      }
      rotatePieceInPlace(testPiece);
    }
  }
  return false;
}

// Place une pièce sur la grille à (row, col)
function placePieceFromSlot(slotIdx, row, col, isAuto = false) {
  const piece = state.tray[slotIdx];
  if (!piece || !canPlacePiece(state.grid, piece, row, col)) return false;

  for (const b of piece.blocks) {
    state.grid[row + b.y][col + b.x] = {
      letter: b.letter,
      spawnAnim: 0
    };
  }

  state.hoverPreview = null;
  if (isAuto) {
    sound.warn();
    renderer.triggerShake(7);
    state.combo = 0;
  } else {
    sound.lock();
  }

  // Recharger la pièce du slot et le tempo
  refillTraySlot(slotIdx);
  resetTempo();

  // Vérifier les mots formés !
  const {
    matchedCells,
    foundWords,
    triggeredBombs,
    triggeredLightnings,
    usedBonuses
  } = findMatches(state.grid, state.bonusMap, 4);

  if (matchedCells.size > 0) {
    state.combo++;
    state.phase = 'CLEARING';
    state.clearingSet = matchedCells;
    state.clearingStart = performance.now();
    state.clearingProgress = 0;

    // Effets spéciaux Bombes & Éclairs
    const hasBomb = triggeredBombs.length > 0;
    const hasLight = triggeredLightnings.length > 0;

    if (hasBomb) {
      sound.bomb();
      triggeredBombs.forEach(b => renderer.spawnShockwave(b.r, b.c, '#ff2a55'));
    }
    if (hasLight) {
      sound.lightning();
      triggeredLightnings.forEach(l => renderer.spawnLaser(l.r, l.c));
    }
    sound.wordClear(state.combo, hasBomb || hasLight);
    renderer.triggerShake(hasBomb || hasLight ? 12 : state.combo > 1 ? 8 : 5);

    // Consommer les cases ×2 / ×3 utilisées et en faire réapparaître de nouvelles
    usedBonuses.forEach(k => state.bonusMap.delete(k));
    if (usedBonuses.size > 0) spawnBonusCells(usedBonuses.size);

    // Score + Popups
    foundWords.forEach((w, idx) => {
      const mult = (state.feverActive ? 3 : 1) * state.combo;
      const pts = w.points * mult;
      state.score += pts;
      state.wordsCount++;

      if (pts > state.bestWordPts) {
        state.bestWordPts = pts;
        state.bestWord = w.word;
      }

      addWordToFeed({ word: w.word, points: pts, cellMult: w.cellMult });

      const mid = w.cells[Math.floor(w.cells.length / 2)];
      renderer.spawnPopup(
        `${w.word} +${pts.toLocaleString('fr-FR')}`,
        mid[0] - idx * 0.7,
        mid[1],
        w.cellMult > 1 ? '#ff2aff' : '#ffea00',
        w.cellMult > 1 ? 1.2 : 1.05
      );
    });

    if (hasBomb) {
      state.score += 2500 * triggeredBombs.length;
      renderer.spawnPopup('💥 BOOM 3×3 !', triggeredBombs[0].r, triggeredBombs[0].c, '#ff2a55', 1.25);
    }
    if (hasLight) {
      state.score += 3000 * triggeredLightnings.length;
      renderer.spawnPopup('⚡ LASER !', triggeredLightnings[0].r, triggeredLightnings[0].c, '#00f5ff', 1.25);
    }
    if (state.combo > 1) {
      renderer.spawnPopup(`🔥 COMBO ×${state.combo} !`, 1.5, GRID_SIZE / 2, '#00ff88', 1.3);
    }

    // Niveau & Fièvre
    state.level = 1 + Math.floor(state.wordsCount / 6);
    if (!state.feverActive) {
      state.fever = Math.min(100, state.fever + foundWords.length * 22 + (state.combo - 1) * 15);
      if (state.fever >= 100) {
        state.feverActive = true;
        state.feverEndTime = performance.now() + FEVER_DURATION;
        boardFrame.classList.add('fever-active');
        sound.fever();
        renderer.spawnPopup('🌈 FIÈVRE FLUO ×3 !', 3.5, GRID_SIZE / 2, '#ff2aff', 1.35);
      }
    }

    updateHUD();
  } else {
    // Aucun mot sur ce coup : réinitialise le combo
    if (!isAuto) state.combo = 0;
    updateHUD();
    if (!hasAnyValidMove()) {
      triggerGameOver();
    }
  }
  return true;
}

function finishClearing() {
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
  state.phase = 'PLAYING';

  // Tous les 3 mots validés, un nouveau jeton spécial (💣 ou ⚡) apparaît seulement s'il reste assez de place
  if (state.wordsCount > 0 && state.wordsCount % 3 === 0 && getEmptyCells().length >= 12) {
    spawnSpecialToken();
  }

  if (!hasAnyValidMove()) {
    triggerGameOver();
  }
}

// Auto-placement quand le chrono Tempo atteint 0 en mode Arcade :
// 1. Si le joueur survole une position valide, on pose le jeton exactement là.
// 2. Sinon on cherche une autre place libre pour CE jeton.
// 3. Si ce jeton n'a aucune place dans la grille : la partie est finie !
function autoPlaceOnTimeout() {
  const activeDragSlot = drag.active ? drag.slotIdx : state.selectedSlot;
  if (drag.active) {
    slotEls[drag.slotIdx]?.classList.remove('dragging');
    dragGhost.classList.remove('visible');
    drag.active = false;
    drag.moved = false;
  }

  const piece = state.tray[activeDragSlot];
  if (!piece) {
    triggerGameOver();
    return;
  }

  // 1. Poser là où le jeton est actuellement placé/survolé si c'est valide
  if (state.hoverPreview && state.hoverPreview.valid && state.hoverPreview.row !== null) {
    const { row, col } = state.hoverPreview;
    renderer.spawnPopup('⏱️ POSÉ !', row, col, '#ffea00', 1.1);
    placePieceFromSlot(activeDragSlot, row, col, true);
    return;
  }

  // 2. Sinon chercher un autre emplacement libre pour CE jeton uniquement
  for (let rot = 0; rot < 4; rot++) {
    const validSpots = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (canPlacePiece(state.grid, piece, r, c)) validSpots.push([r, c]);
      }
    }
    if (validSpots.length > 0) {
      const [r, c] = validSpots[Math.floor(Math.random() * validSpots.length)];
      renderer.spawnPopup('⏱️ TEMPS ÉCOULÉ !', r, c, '#ff2a55', 1.1);
      placePieceFromSlot(activeDragSlot, r, c, true);
      return;
    }
    rotatePieceInPlace(piece);
  }

  // 3. Ce jeton n'a aucune place dans la grille : partie terminée !
  triggerGameOver();
}

// --- Actions Tourner & Permuter ---
function rotateSelected() {
  if (state.phase !== 'PLAYING') return;
  const p = state.tray[state.selectedSlot];
  if (!p) return;
  rotatePieceInPlace(p);
  sound.rotate();
  renderTray();
}

function permuteSelected() {
  if (state.phase !== 'PLAYING') return;
  const p = state.tray[state.selectedSlot];
  if (!p) return;
  permutePieceLetters(p);
  sound.permute();
  renderTray();
}

rotateBtn.addEventListener('click', rotateSelected);
permuteBtn.addEventListener('click', permuteSelected);

// --- Drag & Drop (Souris & Tactile) + Tap-to-place ---
const drag = {
  active: false,
  moved: false,
  slotIdx: -1,
  startX: 0,
  startY: 0,
  isTouch: false
};

function getGridCoordsFromClient(clientX, clientY, piece, isTouch) {
  const rect = gameCanvas.getBoundingClientRect();
  const offsetY = isTouch ? -64 : 0; // Décalage vers le haut au doigt pour ne pas masquer la pièce !
  const x = clientX - rect.left;
  const y = (clientY + offsetY) - rect.top;

  if (x < -24 || y < -24 || x > rect.width + 24 || y > rect.height + 24) {
    return null;
  }

  const cs = rect.width / GRID_SIZE;
  const { w, h } = getPieceDimensions(piece);
  const col = Math.round((x / cs) - w / 2);
  const row = Math.round((y / cs) - h / 2);
  return { row, col };
}

function updateDragGhostPosition(clientX, clientY, isTouch) {
  const offsetY = isTouch ? -64 : 0;
  dragGhost.style.left = `${clientX}px`;
  dragGhost.style.top = `${clientY + offsetY}px`;
}

slotEls.forEach((el, idx) => {
  el.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'PLAYING') return;
    const piece = state.tray[idx];
    if (!piece) return;

    e.preventDefault();
    state.selectedSlot = idx;
    renderTray();

    drag.active = true;
    drag.moved = false;
    drag.slotIdx = idx;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.isTouch = e.pointerType === 'touch';

    el.setPointerCapture?.(e.pointerId);
  });
});

window.addEventListener('pointermove', (e) => {
  if (!drag.active || state.phase !== 'PLAYING') return;
  const piece = state.tray[drag.slotIdx];
  if (!piece) return;

  const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
  if (!drag.moved && dist > 8) {
    drag.moved = true;
    slotEls[drag.slotIdx].classList.add('dragging');
    dragGhost.classList.add('visible');
    renderer.renderPieceToCanvas(dragGhost, piece, state.feverActive, 38);
  }

  if (drag.moved) {
    updateDragGhostPosition(e.clientX, e.clientY, drag.isTouch);
    const pos = getGridCoordsFromClient(e.clientX, e.clientY, piece, drag.isTouch);
    if (pos) {
      const preview = previewPlacement(state.grid, state.bonusMap, piece, pos.row, pos.col);
      state.hoverPreview = { piece, row: pos.row, col: pos.col, ...preview };
    } else {
      state.hoverPreview = null;
    }
  }
});

window.addEventListener('pointerup', (e) => {
  if (!drag.active) return;
  const slotIdx = drag.slotIdx;
  const wasMoved = drag.moved;
  const isTouch = drag.isTouch;

  drag.active = false;
  drag.moved = false;
  slotEls[slotIdx]?.classList.remove('dragging');
  dragGhost.classList.remove('visible');

  if (wasMoved && state.phase === 'PLAYING') {
    const piece = state.tray[slotIdx];
    const pos = getGridCoordsFromClient(e.clientX, e.clientY, piece, isTouch);
    if (pos && canPlacePiece(state.grid, piece, pos.row, pos.col)) {
      placePieceFromSlot(slotIdx, pos.row, pos.col);
    }
    state.hoverPreview = null;
  }
});

// Toucher le plateau 8×8 : permet de GLISSER le jeton le long de la grille, et valide au relâchement !
gameCanvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'PLAYING' || drag.active) return;
  const piece = state.tray[state.selectedSlot];
  if (!piece) return;

  e.preventDefault();
  const isTouch = e.pointerType === 'touch';

  drag.active = true;
  drag.moved = true; // Active immédiatement l'aperçu & le glissement sur la grille
  drag.slotIdx = state.selectedSlot;
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.isTouch = isTouch;

  slotEls[drag.slotIdx].classList.add('dragging');
  gameCanvas.setPointerCapture?.(e.pointerId);

  const pos = getGridCoordsFromClient(e.clientX, e.clientY, piece, isTouch);
  if (pos) {
    const preview = previewPlacement(state.grid, state.bonusMap, piece, pos.row, pos.col);
    state.hoverPreview = { piece, row: pos.row, col: pos.col, ...preview };
  } else {
    state.hoverPreview = null;
  }
});

// Aperçu au survol souris sur PC
gameCanvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || drag.active || state.phase !== 'PLAYING') return;
  const piece = state.tray[state.selectedSlot];
  if (!piece) return;
  const pos = getGridCoordsFromClient(e.clientX, e.clientY, piece, false);
  if (pos) {
    const preview = previewPlacement(state.grid, state.bonusMap, piece, pos.row, pos.col);
    state.hoverPreview = { piece, row: pos.row, col: pos.col, ...preview };
  } else {
    state.hoverPreview = null;
  }
});

gameCanvas.addEventListener('pointerleave', () => {
  if (!drag.active) state.hoverPreview = null;
});

// Clic droit sur PC pour tourner rapidement
gameCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  rotateSelected();
});

// Raccourcis Clavier PC
window.addEventListener('keydown', (e) => {
  if (helpModal.classList.contains('open')) {
    if (e.key === 'Escape') closeTutorial();
    return;
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    togglePause();
    return;
  }
  if (state.phase !== 'PLAYING') return;

  if (e.key === 'r' || e.key === 'R' || e.key === 'ArrowUp') {
    e.preventDefault();
    rotateSelected();
  } else if (e.key === 's' || e.key === 'S' || e.key === ' ') {
    e.preventDefault();
    permuteSelected();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    state.selectedSlot = Number(e.key) - 1;
    renderTray();
  }
});

// Boucle 60 FPS
function loop(now) {
  const dt = Math.min(50, now - (state.lastTime || now));
  state.lastTime = now;

  try {
    if (state.feverActive && state.phase !== 'PAUSED' && state.phase !== 'MENU') {
      const rem = state.feverEndTime - now;
      if (rem <= 0) {
        state.feverActive = false;
        state.fever = 0;
        boardFrame.classList.remove('fever-active');
        renderTray();
      } else {
        state.fever = (rem / FEVER_DURATION) * 100;
      }
      updateHUD();
    }

    if (state.phase === 'PLAYING' && state.mode === 'arcade') {
      state.tempoRemaining -= dt;
      updateHUD();
      if (state.tempoRemaining <= 0) {
        autoPlaceOnTimeout();
      }
    } else if (state.phase === 'CLEARING') {
      state.clearingProgress = Math.min(1, (now - state.clearingStart) / CLEAR_DURATION);
      if (state.clearingProgress >= 1) {
        finishClearing();
      }
    }

    renderer.updateEffects();
    renderer.render(state, now);
  } catch (err) {
    console.error('Erreur Motris:', err);
    if (state.phase === 'CLEARING') {
      state.clearingSet = null;
      state.phase = 'PLAYING';
    }
  }

  requestAnimationFrame(loop);
}

// UI & Menus
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

// --- Tutoriel interactif (4 étapes) ---
const tutoSlides = [...document.querySelectorAll('.tuto-slide')];
const tutoDots = [...document.querySelectorAll('#tutoDots .dot')];
const tutoPrevBtn = document.getElementById('tutoPrevBtn');
const tutoNextBtn = document.getElementById('tutoNextBtn');
let tutoStep = 0;
let pausedByTuto = false;

function showTutoStep(idx) {
  tutoStep = Math.max(0, Math.min(tutoSlides.length - 1, idx));
  tutoSlides.forEach((s, i) => s.classList.toggle('active', i === tutoStep));
  tutoDots.forEach((d, i) => d.classList.toggle('active', i === tutoStep));
  tutoPrevBtn.style.visibility = tutoStep === 0 ? 'hidden' : 'visible';
  tutoNextBtn.textContent = tutoStep === tutoSlides.length - 1 ? 'C’est parti ! 🚀' : 'Suiv. ▶';
}

function openTutorial() {
  if (state.phase === 'PLAYING') {
    state.phase = 'PAUSED';
    pausedByTuto = true;
  }
  showTutoStep(0);
  helpModal.classList.add('open');
}

function closeTutorial() {
  helpModal.classList.remove('open');
  if (pausedByTuto) {
    pausedByTuto = false;
    state.phase = 'PLAYING';
  }
}

document.getElementById('helpBtn').addEventListener('click', openTutorial);
document.getElementById('introTutoBtn').addEventListener('click', openTutorial);
document.getElementById('closeHelpBtn').addEventListener('click', closeTutorial);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) closeTutorial();
});

tutoPrevBtn.addEventListener('click', () => showTutoStep(tutoStep - 1));
tutoNextBtn.addEventListener('click', () => {
  if (tutoStep === tutoSlides.length - 1) {
    closeTutorial();
  } else {
    showTutoStep(tutoStep + 1);
  }
});

tutoDots.forEach((dot, i) => {
  dot.addEventListener('click', () => showTutoStep(i));
});

// Ajustement automatique du Canvas dès que le cadre change de taille
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => renderer.resize()).observe(boardFrame);
}
window.addEventListener('resize', () => renderer.resize());

requestAnimationFrame(loop);
