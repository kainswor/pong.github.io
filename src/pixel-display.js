/**
 * PixelDisplay - A retro CRT-style pixel display renderer
 * 
 * Emulates a retro pixel display with CRT fade effects.
 * Pixels have two states: ON (retro green) or OFF (black).
 */
export class PixelDisplay {
  constructor(canvas, emulatedWidth = 300, emulatedHeight = 200, displayWidth = 800, displayHeight = 600) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.emulatedWidth = emulatedWidth;
    this.emulatedHeight = emulatedHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    
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
    this.onColor = '#39ff14';
    this.offColor = '#000000';
    
    // Fade timing (in milliseconds)
    this.fadeInTime = 50;  // 0.05s
    this.fadeOutTime = 200; // 0.2s
    
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
    
    this.animationFrameId = null;
    this.isRunning = false;
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
      const now = performance.now();
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
   * Clear all pixels (set all to OFF)
   */
  clear() {
    const now = performance.now();
    for (let y = 0; y < this.emulatedHeight; y++) {
      for (let x = 0; x < this.emulatedWidth; x++) {
        this.pixels[y][x].state = false;
        this.pixels[y][x].offTimestamp = now;
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
   * Render a single frame
   */
  render() {
    const currentTime = performance.now();
    
    // Clear canvas with black background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    
    // Render each pixel
    for (let y = 0; y < this.emulatedHeight; y++) {
      for (let x = 0; x < this.emulatedWidth; x++) {
        const pixel = this.pixels[y][x];
        const brightness = this.calculateBrightness(pixel, currentTime);
        
        if (brightness > 0) {
          // Calculate pixel position accounting for gaps
          const pixelX = x * (this.pixelWidth + this.gapWidth);
          const pixelY = y * (this.pixelHeight + this.gapHeight);
          
          // Set color with brightness applied
          const r = parseInt(this.onColor.substring(1, 3), 16);
          const g = parseInt(this.onColor.substring(3, 5), 16);
          const b = parseInt(this.onColor.substring(5, 7), 16);
          
          // Apply brightness to color
          const alpha = brightness;
          this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          
          // Draw pixel rectangle
          this.ctx.fillRect(
            pixelX,
            pixelY,
            this.pixelWidth,
            this.pixelHeight
          );
        }
      }
    }
  }
  
  /**
   * Start the render loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    const renderLoop = () => {
      if (!this.isRunning) return;
      
      this.render();
      this.animationFrameId = requestAnimationFrame(renderLoop);
    };
    
    renderLoop();
  }
  
  /**
   * Stop the render loop
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
