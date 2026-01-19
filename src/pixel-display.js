import {
  CRT_ON_COLOR, CRT_FADE_IN_MS, CRT_FADE_OUT_MS,
  DEGAUSS_COOLDOWN_MS, DEGAUSS_COOLDOWN_MIN_MS, DEGAUSS_DURATION_BASE_MS,
  DEGAUSS_AMP_PX, DEGAUSS_OVERLAY_ALPHA, DEGAUSS_DECAY_ALPHA, DEGAUSS_FREQ_HZ, DEGAUSS_WAVE_K
} from './constants.js';

/**
 * PixelDisplay - A retro CRT-style pixel display renderer
 * 
 * Emulates a retro pixel display with CRT fade effects.
 * Pixels have two states: ON (retro green) or OFF (black).
 */
export class PixelDisplay {
  constructor(canvas, emulatedWidth = 300, emulatedHeight = 200, displayWidth = 800, displayHeight = 600, refreshHz = 60) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emulatedWidth = emulatedWidth;
    this.emulatedHeight = emulatedHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.refreshHz = refreshHz;
    this.targetIntervalMs = 1000 / refreshHz;

    // Set canvas size
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    
    // Gap between pixels (1px as specified)
    this.gapWidth = 1;
    this.gapHeight = 1;
    
    // Calculate pixel dimensions accounting for gaps
    this.pixelWidth = (displayWidth - (emulatedWidth - 1) * this.gapWidth) / emulatedWidth;
    this.pixelHeight = (displayHeight - (emulatedHeight - 1) * this.gapHeight) / emulatedHeight;
    
    // CRT color (retro green)
    this.onColor = CRT_ON_COLOR;
    
    // Fade timing (in milliseconds)
    this.fadeInTime = CRT_FADE_IN_MS;
    this.fadeOutTime = CRT_FADE_OUT_MS;
    
    // Pixel state: 2D array storing { state: boolean, onTimestamp: number, offTimestamp: number }
    this.pixels = [];
    for (let y = 0; y < emulatedHeight; y++) {
      this.pixels[y] = [];
      for (let x = 0; x < emulatedWidth; x++) {
        this.pixels[y][x] = {
          state: false,
          onTimestamp: 0,
          offTimestamp: 0
        };
      }
    }
    
    // Deterministic time for tests: when set, getTime() returns this instead of performance.now()
    this._now = undefined;

    // Degauss (CRT-style) effect: no stacking, 30s cooldown
    this.lastDegaussEndTime = 0;   // ms; 0 = never
    this.degaussStartTime = 0;     // 0 = not running
    this.degaussDuration = 0;      // ms for current run
    this.degaussStrength = 0;      // 0..1 for current run

    // Full-strength tuning (from constants)
    this.DEGAUSS_COOLDOWN_MS = DEGAUSS_COOLDOWN_MS;
    this.DEGAUSS_COOLDOWN_MIN_MS = DEGAUSS_COOLDOWN_MIN_MS;
    this.DEGAUSS_DURATION_BASE_MS = DEGAUSS_DURATION_BASE_MS;
    this.DEGAUSS_AMP_PX = DEGAUSS_AMP_PX;
    this.DEGAUSS_OVERLAY_ALPHA = DEGAUSS_OVERLAY_ALPHA;
    this.DEGAUSS_DECAY_ALPHA = DEGAUSS_DECAY_ALPHA;
    this.DEGAUSS_FREQ_HZ = DEGAUSS_FREQ_HZ;
    this.DEGAUSS_WAVE_K = DEGAUSS_WAVE_K;
  }
  
  /**
   * Set a pixel's state (ON or OFF)
   * @param {number} x - X coordinate (0 to emulatedWidth - 1)
   * @param {number} y - Y coordinate (0 to emulatedHeight - 1)
   * @param {boolean} state - true for ON, false for OFF
   */
  setPixel(x, y, state) {
    if (x >= 0 && x < this.emulatedWidth && y >= 0 && y < this.emulatedHeight) {
      const pixel = this.pixels[y][x];
      const now = this.getTime();
      if (pixel.state !== state) {
        pixel.state = state;
        if (state) {
          pixel.onTimestamp = now;
        } else {
          pixel.offTimestamp = now;
        }
      }
    }
  }
  
  /**
   * Get a pixel's current state
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} Current state of the pixel
   */
  getPixel(x, y) {
    if (x >= 0 && x < this.emulatedWidth && y >= 0 && y < this.emulatedHeight) {
      return this.pixels[y][x].state;
    }
    return false;
  }

  /**
   * Set deterministic time for tests. When set, getTime() returns this instead of performance.now().
   * @param {number} nowMs - Time in milliseconds, or undefined to use real time again
   */
  setTime(nowMs) {
    this._now = nowMs;
  }

  /**
   * Get current time in ms. Returns _now when set (tests), else performance.now().
   */
  getTime() {
    return this._now !== undefined ? this._now : performance.now();
  }

  /**
   * Return ASCII art for region [x..x+w)[y..y+h): '#' for state true, '.' for false.
   * Clamps to emulatedWidth/emulatedHeight. Rows newline-separated; origin top-left.
   */
  toASCII(x, y, w, h) {
    const x0 = Math.max(0, Math.min(x, this.emulatedWidth));
    const y0 = Math.max(0, Math.min(y, this.emulatedHeight));
    const x1 = Math.min(this.emulatedWidth, x0 + Math.max(0, w));
    const y1 = Math.min(this.emulatedHeight, y0 + Math.max(0, h));
    const rows = [];
    for (let py = y0; py < y1; py++) {
      let row = '';
      for (let px = x0; px < x1; px++) {
        row += this.pixels[py][px].state ? '#' : '.';
      }
      rows.push(row);
    }
    return rows.join('\n');
  }

  /**
   * Return 2D array of pixel state (boolean) for region [x..x+w)[y..y+h). Clamps to bounds.
   * @returns {boolean[][]} [py][px] = pixels[y0+py][x0+px].state
   */
  getPixelRegion(x, y, w, h) {
    const x0 = Math.max(0, Math.min(x, this.emulatedWidth));
    const y0 = Math.max(0, Math.min(y, this.emulatedHeight));
    const x1 = Math.min(this.emulatedWidth, x0 + Math.max(0, w));
    const y1 = Math.min(this.emulatedHeight, y0 + Math.max(0, h));
    const out = [];
    for (let py = y0; py < y1; py++) {
      const row = [];
      for (let px = x0; px < x1; px++) {
        row.push(this.pixels[py][px].state);
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Trigger CRT-style degauss: wobble and color distortion.
   * No stacking (ignored while running). 30s cooldown scales effect:
   * at 1s after last end: no visible; at 30s: full. Exponential curve.
   */
  degauss() {
    const now = this.getTime();

    // No stacking: ignore if animation still running
    if (this.degaussStartTime !== 0 && (now - this.degaussStartTime) < this.degaussDuration) {
      return;
    }

    // Cooldown strength: elapsed since last end; treat "never" as full cooldown
    const elapsed = this.lastDegaussEndTime === 0
      ? this.DEGAUSS_COOLDOWN_MS
      : now - this.lastDegaussEndTime;
    const x = Math.max(0, Math.min(1,
      (elapsed - this.DEGAUSS_COOLDOWN_MIN_MS) /
      (this.DEGAUSS_COOLDOWN_MS - this.DEGAUSS_COOLDOWN_MIN_MS)
    ));
    const strength = Math.pow(x, 1.5);

    // No visible run: advance cooldown and return
    if (strength < 0.01) {
      this.lastDegaussEndTime = now;
      return;
    }

    this.degaussStartTime = now;
    this.degaussDuration = this.DEGAUSS_DURATION_BASE_MS * strength;
    this.degaussStrength = strength;
  }

  /**
   * Draw a 2D pattern. pattern[py][px]: 1=on, 0=skip. Scale: output size cols*scale × rows*scale.
   * Supports fractional scale for smooth zoom (e.g. countdown).
   */
  drawPattern(pattern, x, y, scale = 1) {
    const s = Math.max(1, scale);
    const rows = pattern.length;
    if (rows === 0) return;
    const cols = pattern[0]?.length ?? 0;
    if (cols === 0) return;
    const outW = Math.max(1, Math.ceil(cols * s));
    const outH = Math.max(1, Math.ceil(rows * s));
    for (let oy = 0; oy < outH; oy++) {
      const srcRow = Math.min(rows - 1, Math.floor(oy / s));
      const r = pattern[srcRow];
      if (!r || !Array.isArray(r)) continue;
      for (let ox = 0; ox < outW; ox++) {
        const srcCol = Math.min(cols - 1, Math.floor(ox / s));
        if (r[srcCol] === 1 || r[srcCol] === true) {
          this.setPixel(Math.floor(x + ox), Math.floor(y + oy), true);
        }
      }
    }
  }

  /**
   * Draw 1px outline of rectangle (x,y,w,h): top, bottom, left, right edges.
   * options.preserve(px, py) => true to skip that pixel (e.g. court).
   */
  drawRectOutline(x, y, w, h, options = {}) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.floor(x + w) - 1, y1 = Math.floor(y + h) - 1;
    const preserve = options.preserve;
    const skip = (px, py) => preserve && typeof preserve === 'function' && preserve(px, py);
    for (let px = x0; px <= x1; px++) { if (!skip(px, y0)) this.setPixel(px, y0, true); }
    for (let px = x0; px <= x1; px++) { if (!skip(px, y1)) this.setPixel(px, y1, true); }
    for (let py = y0; py <= y1; py++) { if (!skip(x0, py)) this.setPixel(x0, py, true); }
    for (let py = y0; py <= y1; py++) { if (!skip(x1, py)) this.setPixel(x1, py, true); }
  }

  /**
   * Draw filled rectangle [x..x+w)[y..y+h). Uses setPixel for each pixel.
   */
  drawRectFilled(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.emulatedWidth, x0 + Math.max(0, Math.floor(w)));
    const y1 = Math.min(this.emulatedHeight, y0 + Math.max(0, Math.floor(h)));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, true);
      }
    }
  }

  /**
   * Horizontal line at y from x0 to x1 (inclusive). x0,x1 can be in any order.
   */
  drawLineH(y, x0, x1) {
    const py = Math.floor(y);
    if (py < 0 || py >= this.emulatedHeight) return;
    const a = Math.min(Math.floor(x0), Math.floor(x1));
    const b = Math.max(Math.floor(x0), Math.floor(x1));
    for (let px = Math.max(0, a); px <= Math.min(this.emulatedWidth - 1, b); px++) {
      this.setPixel(px, py, true);
    }
  }

  /**
   * Vertical line at x from y0 to y1 (inclusive). y0,y1 can be in any order.
   */
  drawLineV(x, y0, y1) {
    const px = Math.floor(x);
    if (px < 0 || px >= this.emulatedWidth) return;
    const a = Math.min(Math.floor(y0), Math.floor(y1));
    const b = Math.max(Math.floor(y0), Math.floor(y1));
    for (let py = Math.max(0, a); py <= Math.min(this.emulatedHeight - 1, b); py++) {
      this.setPixel(px, py, true);
    }
  }

  /**
   * Dashed vertical line at x from y0 to y1: pixels every `stride` rows (y0, y0+stride, y0+2*stride, ...).
   */
  drawLineVDashed(x, y0, y1, stride = 2) {
    const px = Math.floor(x);
    if (px < 0 || px >= this.emulatedWidth) return;
    const s = Math.max(1, Math.floor(stride));
    const a = Math.min(Math.floor(y0), Math.floor(y1));
    const b = Math.max(Math.floor(y0), Math.floor(y1));
    for (let py = a; py <= b; py += s) {
      if (py >= 0 && py < this.emulatedHeight) this.setPixel(px, py, true);
    }
  }

  /**
   * Clear rectangle [x..x+w)[y..y+h). options.preserve(px, py) => true to keep pixel.
   */
  clearRect(x, y, w, h, options = {}) {
    const now = this.getTime();
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.emulatedWidth, x0 + Math.max(0, Math.floor(w)));
    const y1 = Math.min(this.emulatedHeight, y0 + Math.max(0, Math.floor(h)));
    const preserve = options.preserve;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (preserve && typeof preserve === 'function' && preserve(px, py)) continue;
        this.pixels[py][px].state = false;
        this.pixels[py][px].offTimestamp = now;
      }
    }
  }

  /**
   * Clear all pixels (set all to OFF).
   * Pixels that were ON get offTimestamp=now so they fade out. Pixels already OFF get
   * offTimestamp in the past so they render fully dark; using now would make them glow
   * as if just turned off (offElapsed=0 → full fade-out brightness).
   */
  clear() {
    const now = this.getTime();
    const alreadyFaded = now - this.fadeOutTime - 1;
    for (let y = 0; y < this.emulatedHeight; y++) {
      for (let x = 0; x < this.emulatedWidth; x++) {
        const p = this.pixels[y][x];
        if (p.state) {
          p.offTimestamp = now;
        } else {
          p.offTimestamp = alreadyFaded;
        }
        p.state = false;
      }
    }
  }
  
  /**
   * Calculate the brightness/alpha for a pixel based on its state and fade timing
   * @param {Object} pixel - Pixel object with state, onTimestamp, and offTimestamp
   * @param {number} currentTime - Current time in milliseconds
   * @returns {number} Brightness value between 0 and 1
   */
  calculateBrightness(pixel, currentTime) {
    let fadeInBrightness = 0;
    let fadeOutBrightness = 0;
    
    // Calculate fade-in brightness (if pixel is ON or recently turned ON)
    if (pixel.onTimestamp > 0) {
      const onElapsed = currentTime - pixel.onTimestamp;
      if (pixel.state) {
        // Currently ON - calculate fade-in
        if (onElapsed < this.fadeInTime) {
          fadeInBrightness = onElapsed / this.fadeInTime;
        } else {
          fadeInBrightness = 1.0; // Fully on
        }
      }
    }
    
    // Calculate fade-out brightness (if pixel is OFF or recently turned OFF)
    if (pixel.offTimestamp > 0) {
      const offElapsed = currentTime - pixel.offTimestamp;
      if (!pixel.state) {
        // Currently OFF - calculate fade-out
        if (offElapsed < this.fadeOutTime) {
          const t = offElapsed / this.fadeOutTime;
          fadeOutBrightness = Math.pow(1 - t, 6);
        } else {
          fadeOutBrightness = 0.0; // Fully off
        }
      } else {
        // Currently ON but was recently OFF - still calculate fade-out
        if (offElapsed < this.fadeOutTime) {
          const t = offElapsed / this.fadeOutTime;
          fadeOutBrightness = Math.pow(1 - t, 6);
        }
      }
    }
    
    // Return the maximum of fade-in and fade-out (never exceed 1.0)
    return Math.min(1.0, Math.max(fadeInBrightness, fadeOutBrightness));
  }
  
  /**
   * Render a single frame.
   * @param {number} [alpha] - Interpolation factor 0..1 (for future use).
   * @param {Object} [opts] - { now, dtSinceLastRender }. now=wall-clock ms; dtSinceLastRender=ms since last render.
   *   When omitted (e.g. internal loop), now=getTime() and dtSinceLastRender=0.
   *   driftMs = dtSinceLastRender - targetIntervalMs; effectiveDt = min(dtSinceLastRender, 2*targetIntervalMs) for delta-based logic.
   */
  render(alpha, opts) {
    const now = (opts && opts.now != null) ? opts.now : this.getTime();
    const dtSinceLastRender = (opts && opts.dtSinceLastRender != null) ? opts.dtSinceLastRender : 0;
    this.driftMs = dtSinceLastRender - this.targetIntervalMs;
    this.effectiveDt = Math.min(dtSinceLastRender, 2 * this.targetIntervalMs);
    const currentTime = now;

    // Degauss: end check
    if (this.degaussStartTime !== 0 && (currentTime - this.degaussStartTime) >= this.degaussDuration) {
      this.degaussStartTime = 0;
      this.lastDegaussEndTime = currentTime;
    }
    const degaussActive = this.degaussStartTime !== 0;
    let overlayAlpha = 0, t_sec = 0, decay = 0, f = 0, k = 0, A = 0;
    if (degaussActive) {
      t_sec = (currentTime - this.degaussStartTime) / 1000;
      decay = Math.exp(-this.DEGAUSS_DECAY_ALPHA * t_sec);
      overlayAlpha = decay * this.degaussStrength * this.DEGAUSS_OVERLAY_ALPHA;
      f = this.DEGAUSS_FREQ_HZ;
      k = this.DEGAUSS_WAVE_K;
      A = this.DEGAUSS_AMP_PX * this.degaussStrength;
    }

    const onR = parseInt(this.onColor.substring(1, 3), 16);
    const onG = parseInt(this.onColor.substring(3, 5), 16);
    const onB = parseInt(this.onColor.substring(5, 7), 16);

    // Clear canvas with black background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);

    if (!degaussActive) {
      // Neutral state: original logic only (pixels[y][x], no sampling)
      for (let y = 0; y < this.emulatedHeight; y++) {
        for (let x = 0; x < this.emulatedWidth; x++) {
          const pixel = this.pixels[y][x];
          const brightness = this.calculateBrightness(pixel, currentTime);
          if (brightness > 0) {
            const pixelX = x * (this.pixelWidth + this.gapWidth);
            const pixelY = y * (this.pixelHeight + this.gapHeight);
            this.ctx.fillStyle = `rgba(${onR}, ${onG}, ${onB}, ${brightness})`;
            this.ctx.fillRect(pixelX, pixelY, this.pixelWidth, this.pixelHeight);
          }
        }
      }
    } else {
      // Degauss: fixed grid, sample from warped (x_src,y_src)
      const stepX = this.pixelWidth + this.gapWidth;
      const stepY = this.pixelHeight + this.gapHeight;
      for (let y = 0; y < this.emulatedHeight; y++) {
        for (let x = 0; x < this.emulatedWidth; x++) {
          const pixelX = x * stepX;
          const pixelY = y * stepY;
          const nx = pixelX / this.displayWidth;
          const ny = pixelY / this.displayHeight;
          const r = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 2;
          const edge = 0.4 + 0.6 * Math.min(1, r);
          const dx = A * edge * decay * Math.sin(2 * Math.PI * f * t_sec + 2 * Math.PI * k * nx);
          const dy = A * edge * decay * Math.sin(2 * Math.PI * f * t_sec + Math.PI / 2 + 2 * Math.PI * k * ny);
          const x_src = (pixelX - dx) / stepX;
          const y_src = (pixelY - dy) / stepY;
          const ix = Math.max(0, Math.min(this.emulatedWidth - 1, Math.floor(x_src)));
          const iy = Math.max(0, Math.min(this.emulatedHeight - 1, Math.floor(y_src)));
          const pixel = this.pixels[iy][ix];
          const brightness = this.calculateBrightness(pixel, currentTime);
          if (brightness > 0) {
            this.ctx.fillStyle = `rgba(${onR}, ${onG}, ${onB}, ${brightness})`;
            this.ctx.fillRect(pixelX, pixelY, this.pixelWidth, this.pixelHeight);
          }
        }
      }
    }

    if (degaussActive) {
      this.ctx.fillStyle = `rgba(255, 0, 255, ${overlayAlpha})`;
      this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    }
  }
}
