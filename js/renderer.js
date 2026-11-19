import { getLetterCategory, LETTER_POINTS } from './pieces.js?v=6';

const PALETTES = {
  vowel: { top: '#ffea00', bot: '#ff9100', border: '#ffff8d', text: '#111827', glow: '#ffea00' },
  consonant: { top: '#00f5ff', bot: '#0077ff', border: '#b3ffff', text: '#04101f', glow: '#00f5ff' },
  rare: { top: '#ff2aff', bot: '#9d00ff', border: '#ffb3ff', text: '#ffffff', glow: '#ff2aff' },
  joker: { top: '#00ff88', bot: '#00b85c', border: '#b3ffda', text: '#022c1b', glow: '#00ff88' },
  bomb: { top: '#ff1744', bot: '#b71c1c', border: '#ff8a80', text: '#ffffff', glow: '#ff1744' }
};

export class Renderer {
  constructor(canvas, cols, rows) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = cols;
    this.rows = rows;
    this.particles = [];
    this.popups = [];
    this.shake = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(100, Math.floor(rect.width));
    this.height = Math.max(180, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cellW = this.width / this.cols;
    this.cellH = this.height / this.rows;
  }

  triggerShake(intensity = 6) {
    this.shake = Math.max(this.shake, intensity);
  }

  spawnParticles(gridR, gridC, letter, count = 12) {
    const cat = getLetterCategory(letter);
    const pal = PALETTES[cat] || PALETTES.consonant;
    const cx = (gridC + 0.5) * this.cellW;
    const cy = (gridR + 0.5) * this.cellH;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 4.5;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: 3 + Math.random() * 5,
        color: i % 2 === 0 ? pal.top : pal.border,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.025,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.25
      });
    }
  }

  spawnPopup(text, gridR, gridC, color = '#fbbf24', scale = 1) {
    const x = Math.min(Math.max((gridC + 0.5) * this.cellW, 56), this.width - 56);
    const y = Math.max((gridR + 0.3) * this.cellH, 32);
    this.popups.push({
      text,
      x,
      y,
      vy: -1.1,
      alpha: 1,
      color,
      scale,
      life: 1
    });
  }

  updateEffects() {
    if (this.shake > 0.2) this.shake *= 0.84;
    else this.shake = 0;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.rot += p.vrot;
      p.alpha -= p.decay;
      if (p.alpha <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y += pop.vy;
      pop.life -= 0.018;
      pop.alpha = Math.min(1, pop.life * 1.6);
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }

  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawTile(ctx, x, y, w, h, letter, opts = {}) {
    const {
      alpha = 1,
      highlight = false,
      clearingProgress = 0,
      fever = false,
      ghost = false
    } = opts;

    const pad = Math.max(1.5, w * 0.06);
    const rx = x + pad;
    const ry = y + pad;
    const rw = w - pad * 2;
    const rh = h - pad * 2;
    const radius = Math.max(4, rw * 0.22);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (clearingProgress > 0) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const s = 1 + Math.sin(clearingProgress * Math.PI) * 0.16;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    }

    const cat = getLetterCategory(letter);
    const pal = (fever && cat === 'vowel')
      ? { top: '#fde047', bot: '#f59e0b', border: '#ffffff', text: '#1c1917', glow: '#fde047' }
      : (PALETTES[cat] || PALETTES.consonant);

    if (ghost) {
      this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
      ctx.fillStyle = highlight ? 'rgba(52, 211, 153, 0.25)' : 'rgba(148, 163, 184, 0.12)';
      ctx.fill();
      ctx.lineWidth = highlight ? 2 : 1.5;
      ctx.strokeStyle = highlight ? '#34d399' : 'rgba(148, 163, 184, 0.35)';
      ctx.stroke();

      ctx.fillStyle = highlight ? '#6ee7b7' : 'rgba(226, 232, 240, 0.45)';
      ctx.font = `800 ${Math.floor(rh * 0.54)}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x + w / 2, y + h / 2 + 1);
      ctx.restore();
      return;
    }

    // Glow fluo permanent subtil + intense si mot en cours de validation ou preview
    ctx.shadowColor = clearingProgress > 0 ? '#ffffff' : (highlight ? '#00ff88' : pal.glow);
    ctx.shadowBlur = clearingProgress > 0 ? 22 : (highlight ? 16 : (fever ? 12 : 7));

    const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(1, pal.bot);

    this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reflet glossy supérieur
    ctx.shadowBlur = 0;
    this.drawRoundedRect(ctx, rx + 1.5, ry + 1.5, rw - 3, rh * 0.36, Math.max(2, radius - 1));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.fill();

    // Bordure fluo
    this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
    ctx.lineWidth = highlight ? 2.6 : 1.5;
    ctx.strokeStyle = clearingProgress > 0 ? '#ffffff' : (highlight ? '#00ff88' : pal.border);
    ctx.stroke();

    // Lettre principale (grande et très lisible sur mobile et PC)
    ctx.fillStyle = pal.text;
    ctx.font = `900 ${Math.floor(rh * 0.65)}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + w / 2, y + h / 2 + 1);

    // Petit badge de points uniquement sur les grandes tuiles (PC) pour ne pas encombrer le mobile
    const pts = LETTER_POINTS[letter];
    if (pts && letter !== '★' && letter !== '💣' && rw >= 36) {
      ctx.fillStyle = cat === 'vowel' ? 'rgba(28, 25, 23, 0.65)' : 'rgba(255, 255, 255, 0.78)';
      ctx.font = `700 ${Math.max(8, Math.floor(rh * 0.21))}px Outfit, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(pts), rx + rw - 3, ry + rh - 2);
    }

    ctx.restore();
  }

  render(state, now) {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake
    if (this.shake > 0) {
      const dx = (Math.random() - 0.5) * this.shake;
      const dy = (Math.random() - 0.5) * this.shake;
      ctx.translate(dx, dy);
    }

    // Fond de la grille
    ctx.fillStyle = state.feverActive ? '#100a24' : '#080c1a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Lignes de grille fluo subtiles (plus lumineuses en Mode Fièvre)
    ctx.strokeStyle = state.feverActive
      ? 'rgba(255, 42, 255, 0.18)'
      : 'rgba(0, 245, 255, 0.09)';
    ctx.lineWidth = 1;
    for (let c = 1; c < this.cols; c++) {
      const x = Math.round(c * this.cellW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let r = 1; r < this.rows; r++) {
      const y = Math.round(r * this.cellH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Ligne de danger en haut (ligne 2)
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 2 * this.cellH);
    ctx.lineTo(this.width, 2 * this.cellH);
    ctx.stroke();
    ctx.setLineDash([]);

    const { grid, activePiece, ghostY, ghostMatches, clearingSet, clearingProgress, feverActive } = state;

    // Guide vertical subtil de la colonne active
    if (activePiece && state.phase === 'PLAYING') {
      const colX = activePiece.x * this.cellW;
      ctx.fillStyle = 'rgba(0, 245, 255, 0.045)';
      ctx.fillRect(colX, 0, this.cellW, this.height);
    }

    // 1. Cellules posées dans la grille
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const key = `${r},${c}`;
        const drawY = (cell.visualY !== undefined ? cell.visualY : r) * this.cellH;
        const isClearing = clearingSet && clearingSet.has(key);
        const isGhostMatch = ghostMatches && ghostMatches.has(key);

        this.drawTile(ctx, c * this.cellW, drawY, this.cellW, this.cellH, cell.letter, {
          highlight: isGhostMatch,
          clearingProgress: isClearing ? clearingProgress : 0,
          fever: feverActive
        });
      }
    }

    // 2. Ombre d'atterrissage (brille en vert si un mot va se former)
    if (activePiece && state.phase === 'PLAYING') {
      for (const b of activePiece.blocks) {
        const gr = ghostY + b.y;
        const gc = activePiece.x + b.x;
        if (gr >= 0 && gr < this.rows) {
          const isMatch = ghostMatches && ghostMatches.has(`${gr},${gc}`);
          this.drawTile(ctx, gc * this.cellW, gr * this.cellH, this.cellW, this.cellH, b.letter, {
            ghost: true,
            highlight: isMatch
          });
        }
      }

      // 3. Pièce active qui tombe
      for (const b of activePiece.blocks) {
        const pr = activePiece.y + b.y;
        const pc = activePiece.x + b.x;
        if (pr >= 0) {
          this.drawTile(ctx, pc * this.cellW, pr * this.cellH, this.cellW, this.cellH, b.letter, {
            fever: feverActive
          });
        }
      }
    }

    // 4. Particules
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // 5. Popups de score / mots flottants (gros + glow fluo)
    for (const pop of this.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pop.alpha);
      ctx.font = `900 ${Math.floor(21 * pop.scale)}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(8, 12, 26, 0.92)';
      ctx.strokeText(pop.text, pop.x, pop.y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // Rendu d'une pièce dans les mini-canvas (Suivant / Réserve)
  renderMiniPiece(miniCanvas, piece, feverActive = false) {
    const ctx = miniCanvas.getContext('2d');
    const w = miniCanvas.width;
    const h = miniCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!piece) return;

    const minX = Math.min(...piece.blocks.map(b => b.x));
    const maxX = Math.max(...piece.blocks.map(b => b.x));
    const minY = Math.min(...piece.blocks.map(b => b.y));
    const maxY = Math.max(...piece.blocks.map(b => b.y));

    const pw = maxX - minX + 1;
    const ph = maxY - minY + 1;
    const tileSize = Math.min(Math.floor((w - 12) / Math.max(pw, 3)), Math.floor((h - 12) / Math.max(ph, 2)), 26);

    const offsetX = (w - pw * tileSize) / 2;
    const offsetY = (h - ph * tileSize) / 2;

    for (const b of piece.blocks) {
      const bx = offsetX + (b.x - minX) * tileSize;
      const by = offsetY + (b.y - minY) * tileSize;
      this.drawTile(ctx, bx, by, tileSize, tileSize, b.letter, { fever: feverActive });
    }
  }
}
