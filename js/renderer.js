import { getLetterCategory, LETTER_POINTS } from './pieces.js?v=9';

const PALETTES = {
  vowel: { top: '#ffea00', bot: '#ff9100', border: '#ffff8d', text: '#111827', glow: '#ffea00' },
  consonant: { top: '#00f5ff', bot: '#0077ff', border: '#b3ffff', text: '#04101f', glow: '#00f5ff' },
  rare: { top: '#ff2aff', bot: '#9d00ff', border: '#ffb3ff', text: '#ffffff', glow: '#ff2aff' },
  joker: { top: '#00ff88', bot: '#00b85c', border: '#b3ffda', text: '#022c1b', glow: '#00ff88' },
  bomb: { top: '#ff2a55', bot: '#b71c1c', border: '#ff9eb5', text: '#ffffff', glow: '#ff2a55' },
  lightning: { top: '#7df9ff', bot: '#6366f1', border: '#ffffff', text: '#ffffff', glow: '#00f5ff' }
};

export class Renderer {
  constructor(canvas, size = 8) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = size;
    this.particles = [];
    this.popups = [];
    this.shockwaves = [];
    this.lasers = [];
    this.shake = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(160, Math.floor(rect.width));
    this.height = Math.max(160, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cellSize = this.width / this.size;
  }

  triggerShake(intensity = 7) {
    this.shake = Math.max(this.shake, intensity);
  }

  spawnParticles(gridR, gridC, letter, count = 16) {
    const cat = getLetterCategory(letter);
    const pal = PALETTES[cat] || PALETTES.consonant;
    const cx = (gridC + 0.5) * this.cellSize;
    const cy = (gridR + 0.5) * this.cellSize;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 5.2;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 3.5 + Math.random() * 5.5,
        color: i % 2 === 0 ? pal.top : pal.border,
        alpha: 1,
        decay: 0.022 + Math.random() * 0.025,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.28
      });
    }
  }

  spawnShockwave(gridR, gridC, color = '#ff2a55') {
    this.shockwaves.push({
      x: (gridC + 0.5) * this.cellSize,
      y: (gridR + 0.5) * this.cellSize,
      radius: this.cellSize * 0.3,
      maxRadius: this.cellSize * 2.4,
      color,
      alpha: 1
    });
  }

  spawnLaser(gridR, gridC) {
    this.lasers.push({
      r: gridR,
      c: gridC,
      alpha: 1
    });
  }

  spawnPopup(text, gridR, gridC, color = '#ffea00', scale = 1) {
    const x = Math.min(Math.max((gridC + 0.5) * this.cellSize, 74), this.width - 74);
    const y = Math.max((gridR + 0.3) * this.cellSize, 30);
    this.popups.push({
      text,
      x,
      y,
      vy: -1.15,
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

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * 0.18;
      s.alpha -= 0.045;
      if (s.alpha <= 0) this.shockwaves.splice(i, 1);
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      this.lasers[i].alpha -= 0.055;
      if (this.lasers[i].alpha <= 0) this.lasers.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y += pop.vy;
      pop.life -= 0.017;
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

  drawTile(ctx, x, y, size, letter, opts = {}) {
    const {
      alpha = 1,
      highlight = false,
      invalid = false,
      clearingProgress = 0,
      scale = 1,
      fever = false,
      ghost = false,
      pulse = 0
    } = opts;

    const pad = Math.max(2, size * 0.065);
    const rw = size - pad * 2;
    const rh = size - pad * 2;
    const radius = Math.max(6, rw * 0.23);

    ctx.save();
    ctx.globalAlpha = alpha;

    const cx = x + size / 2;
    const cy = y + size / 2;
    let totalScale = scale;
    if (clearingProgress > 0) {
      totalScale *= 1 + Math.sin(clearingProgress * Math.PI) * 0.18;
    } else if (pulse > 0) {
      totalScale *= 1 + Math.sin(pulse) * 0.04;
    }

    if (totalScale !== 1) {
      ctx.translate(cx, cy);
      ctx.scale(totalScale, totalScale);
      ctx.translate(-cx, -cy);
    }

    const rx = x + pad;
    const ry = y + pad;

    const cat = getLetterCategory(letter);
    const pal = (fever && cat === 'vowel')
      ? { top: '#fde047', bot: '#f59e0b', border: '#ffffff', text: '#111827', glow: '#fde047' }
      : (PALETTES[cat] || PALETTES.consonant);

    if (ghost) {
      this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
      ctx.fillStyle = invalid
        ? 'rgba(255, 42, 85, 0.28)'
        : (highlight ? 'rgba(0, 255, 136, 0.32)' : 'rgba(0, 245, 255, 0.22)');
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = invalid ? '#ff2a55' : (highlight ? '#00ff88' : '#00f5ff');
      ctx.stroke();

      ctx.fillStyle = invalid ? '#ff8a9f' : '#ffffff';
      ctx.font = `900 ${Math.floor(rh * 0.6)}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, cx, cy + 1);
      ctx.restore();
      return;
    }

    // Glow fluo
    ctx.shadowColor = clearingProgress > 0 ? '#ffffff' : (highlight ? '#00ff88' : pal.glow);
    ctx.shadowBlur = clearingProgress > 0 ? 22 : (highlight ? 18 : (fever ? 13 : 8));

    const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(1, pal.bot);

    this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
    ctx.fillStyle = grad;
    ctx.fill();

    // Reflet glossy
    ctx.shadowBlur = 0;
    this.drawRoundedRect(ctx, rx + 1.5, ry + 1.5, rw - 3, rh * 0.36, Math.max(3, radius - 1));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Bordure
    this.drawRoundedRect(ctx, rx, ry, rw, rh, radius);
    ctx.lineWidth = highlight ? 2.8 : 1.5;
    ctx.strokeStyle = clearingProgress > 0 ? '#ffffff' : (highlight ? '#00ff88' : pal.border);
    ctx.stroke();

    // Lettre principale (grosse et ultra-lisible)
    ctx.fillStyle = pal.text;
    const isEmoji = letter === '💣' || letter === '⚡';
    ctx.font = `900 ${Math.floor(rh * (isEmoji ? 0.56 : 0.62))}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy + 1);

    // Petit badge points sur grandes tuiles
    const pts = LETTER_POINTS[letter];
    if (pts && !isEmoji && letter !== '★' && rw >= 38) {
      ctx.fillStyle = cat === 'vowel' ? 'rgba(17, 24, 39, 0.6)' : 'rgba(255, 255, 255, 0.78)';
      ctx.font = `700 ${Math.max(8, Math.floor(rh * 0.21))}px Outfit, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(pts), rx + rw - 4, ry + rh - 2);
    }

    ctx.restore();
  }

  render(state, now) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    ctx.save();

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // Fond du plateau
    ctx.fillStyle = state.feverActive ? '#120a28' : '#090e1f';
    ctx.fillRect(0, 0, this.width, this.height);

    // Cases de la grille + cases Bonus ×2 / ×3
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const x = c * cs;
        const y = r * cs;
        const pad = 2.5;
        const bonus = state.bonusMap.get(`${r},${c}`);

        this.drawRoundedRect(ctx, x + pad, y + pad, cs - pad * 2, cs - pad * 2, 7);
        if (bonus) {
          ctx.fillStyle = bonus === 3 ? 'rgba(255, 42, 255, 0.18)' : 'rgba(0, 245, 255, 0.14)';
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = bonus === 3 ? 'rgba(255, 42, 255, 0.65)' : 'rgba(0, 245, 255, 0.55)';
          ctx.stroke();

          if (!state.grid[r][c]) {
            ctx.fillStyle = bonus === 3 ? '#ff80ff' : '#7df9ff';
            ctx.font = `900 ${Math.floor(cs * 0.34)}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`×${bonus}`, x + cs / 2, y + cs / 2);
          }
        } else {
          ctx.fillStyle = (r + c) % 2 === 0
            ? 'rgba(255, 255, 255, 0.025)'
            : 'rgba(255, 255, 255, 0.045)';
          ctx.fill();
        }
      }
    }

    const { grid, hoverPreview, clearingSet, clearingProgress, feverActive } = state;
    const allowPreview = state.settings ? state.settings.showWordPreview : true;
    const hoverMatches = (allowPreview && hoverPreview?.valid) ? hoverPreview.matchedCells : null;

    // Tuiles posées sur le plateau
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        // Animation de rebond à la pose
        if (cell.spawnAnim !== undefined && cell.spawnAnim < 1) {
          cell.spawnAnim = Math.min(1, cell.spawnAnim + 0.14);
        }
        const t = cell.spawnAnim ?? 1;
        const popScale = t < 1 ? 0.55 + Math.sin(t * Math.PI * 0.85) * 0.55 : 1;

        const key = `${r},${c}`;
        const isClearing = clearingSet && clearingSet.has(key);
        const isMatch = hoverMatches && hoverMatches.has(key);
        const isSpecial = cell.letter === '💣' || cell.letter === '⚡';

        this.drawTile(ctx, c * cs, r * cs, cs, cell.letter, {
          highlight: isMatch,
          clearingProgress: isClearing ? clearingProgress : 0,
          scale: popScale,
          fever: feverActive,
          pulse: isSpecial ? now * 0.006 : 0
        });
      }
    }

    // Aperçu en direct pendant le Drag & Drop
    if (hoverPreview && hoverPreview.piece && hoverPreview.row !== null) {
      const { piece, row, col, valid, foundWords } = hoverPreview;
      for (const b of piece.blocks) {
        const tr = row + b.y;
        const tc = col + b.x;
        if (tr >= 0 && tr < this.size && tc >= 0 && tc < this.size) {
          const isMatch = valid && hoverMatches && hoverMatches.has(`${tr},${tc}`);
          this.drawTile(ctx, tc * cs, tr * cs, cs, b.letter, {
            ghost: true,
            highlight: isMatch,
            invalid: !valid
          });
        }
      }

      // Bulle flottante du mot qui va se former (si aperçu activé)
      if (allowPreview && valid && foundWords && foundWords.length > 0) {
        const previewLabel = foundWords.map(w => w.word).join(' + ');
        const px = Math.min(Math.max((col + 0.8) * cs, 72), this.width - 72);
        const py = Math.max(row * cs - 16, 20);
        ctx.save();
        ctx.font = '900 15px Outfit, sans-serif';
        const tw = ctx.measureText(previewLabel).width + 24;
        this.drawRoundedRect(ctx, px - tw / 2, py - 14, tw, 28, 14);
        ctx.fillStyle = 'rgba(0, 255, 136, 0.92)';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#04140d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`✨ ${previewLabel}`, px, py + 1);
        ctx.restore();
      }
    }

    // Lasers Éclair (ligne + colonne fluo)
    for (const l of this.lasers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, l.alpha);
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 20;
      const thickness = cs * 0.55 * l.alpha;
      ctx.fillRect(0, (l.r + 0.5) * cs - thickness / 2, this.width, thickness);
      ctx.fillRect((l.c + 0.5) * cs - thickness / 2, 0, thickness, this.height);
      ctx.restore();
    }

    // Ondes de choc Bombes
    for (const s of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.lineWidth = 5 * s.alpha;
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.restore();
    }

    // Particules fluo
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Popups de score flottants
    for (const pop of this.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pop.alpha);
      ctx.font = `900 ${Math.floor(20 * pop.scale)}px Outfit, sans-serif`;
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

  // Rendu d'une pièce dans un slot du Dock (ou dans le fantôme flottant pendant le drag)
  renderPieceToCanvas(targetCanvas, piece, feverActive = false, maxTile = 34) {
    const ctx = targetCanvas.getContext('2d');
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!piece) return;

    const maxX = Math.max(...piece.blocks.map(b => b.x));
    const maxY = Math.max(...piece.blocks.map(b => b.y));
    const pw = maxX + 1;
    const ph = maxY + 1;

    const tile = Math.min(Math.floor((w - 10) / pw), Math.floor((h - 10) / ph), maxTile);
    const ox = (w - pw * tile) / 2;
    const oy = (h - ph * tile) / 2;

    for (const b of piece.blocks) {
      this.drawTile(ctx, ox + b.x * tile, oy + b.y * tile, tile, b.letter, { fever: feverActive });
    }
  }
}
