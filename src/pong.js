import { PixelDisplay } from './pixel-display.js';
import { PIXEL_FONT, LARGE_LETTER_PATTERNS } from './sprites.js';
import {
  GOALS_TO_WIN, COUNTDOWN_MS, BUTTON_SIZE, BUTTON_PADDING, BUTTON_PADDING_V,
  BLINK_SPEED, BLINK_CACHE_MS, BLINK_ON_THRESHOLD, TRIANGLE_OFFSET, TRIANGLE_EXTRA,
  SMALL_TRIANGLE_LONG_SIDE, SMALL_TRIANGLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_SPEED, BALL_SPEED, PADDLE_EDGE_OFFSET,
  SPEED_INCREASE_PER_VOLLEY, MAX_SPEED_MULTIPLIER, SCALE_1P, SCALE_2P_DIGIT,
  GAME_OVER_TEXT_SCALE, GAME_OVER_CHAR_WIDTH, GAME_OVER_BOUNCE_SPEED, GAME_OVER_BOUNCE_AMOUNT,
  GAME_OVER_BASE_Y_OFFSET, GAME_OVER_WINNER_X_OFFSET, GAME_OVER_LOSE_X_OFFSET,
  LABEL_SCALE, LABEL_GLYPH_COLS, LABEL_GAP_W, LABEL_BOUNCE_SPEED, LABEL_BOUNCE_AMOUNT,
  PAUSE_BOUNCE_SPEED, PAUSE_BOUNCE_AMOUNT, PAUSE_BAR_WIDTH, PAUSE_BAR_HEIGHT, PAUSE_BAR_SPACING,
  RESTART_ARROW_RADIUS, RESTART_ARROW_SPEED, LOGIC_HZ, DT_MS, MAX_FRAME_MS, MAX_UPDATES_PER_FRAME
} from './constants.js';
import {
  UP_KEYS_1P, DOWN_KEYS_1P, UP_KEYS_LEFT_2P, DOWN_KEYS_LEFT_2P, UP_KEYS_RIGHT_2P, DOWN_KEYS_RIGHT_2P,
  KEY_DEGAUSS, KEY_ENTER, KEY_PAUSE, KEY_MENU_UP, KEY_MENU_DOWN, KEY_DEBUG_WIN, KEY_DEBUG_LOSE, KEY_DEBUG_1, KEY_DEBUG_2
} from './input.js';

/**
 * PlayerController - Base class for paddle control
 */
class PlayerController {
  update(paddle, ball, gameState) {
    // Returns: 'up', 'down', or null
    return null;
  }
}

/**
 * KeyboardController - Controls paddle with configurable keys
 * @param {Object} [options]
 * @param {string[]} [options.upKeys=['ArrowUp','w','W']]
 * @param {string[]} [options.downKeys=['ArrowDown','s','S']]
 */
class KeyboardController extends PlayerController {
  constructor(options = {}) {
    super();
    const upKeys = options.upKeys ?? ['ArrowUp', 'w', 'W'];
    const downKeys = options.downKeys ?? ['ArrowDown', 's', 'S'];
    this.keys = {};
    for (const k of upKeys) this.keys[k] = false;
    for (const k of downKeys) this.keys[k] = false;
    this._upKeys = upKeys;
    this._downKeys = downKeys;

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (this.keys.hasOwnProperty(e.key)) {
          e.preventDefault();
          this.keys[e.key] = true;
        }
      });
      document.addEventListener('keyup', (e) => {
        if (this.keys.hasOwnProperty(e.key)) {
          e.preventDefault();
          this.keys[e.key] = false;
        }
      });
    }
  }

  update(paddle, ball, gameState) {
    if (this._upKeys.some((k) => this.keys[k])) return 'up';
    if (this._downKeys.some((k) => this.keys[k])) return 'down';
    return null;
  }
}

/**
 * AIController - AI counterplayer with skill-based behavior
 */
class AIController extends PlayerController {
  constructor(skill = 0.5) {
    super();
    this.skill = skill; // 0.0-1.0, where 0.5 is normal
    this.targetY = 0;
    this.currentVelocity = 0;
    this.lastDirection = 0; // -1 down, 0 neutral, 1 up
    this.directionChangeTime = 0;
    this.reactionDelay = 0;
    this.reacting = false;
    this.lastDegaussStartTime = 0;
    this.shakenOffActive = false;
    
    // Skill-based parameters
    this.maxReactionTime = 500; // ms - increased for slower reactions
    this.minReactionTime = 150; // ms - increased so nothing is instant
    this.maxAccelRate = 0.016875; // Reduced by another 25% (0.0225 * 0.75)
    this.minAccelRate = 0.005625; // Reduced by another 25% (0.0075 * 0.75)
    this.smoothingFactor = 0.15; // Smoothing factor for velocity interpolation (0-1, lower = smoother)
  }
  
  update(paddle, ball, gameState) {
    // Degauss "shaken off" (levels 1 & 2): clear when degauss not running
    if (gameState.degaussStartTime === 0) {
      this.lastDegaussStartTime = 0;
    }

    if (gameState.degaussStartTime > 0 && gameState.degaussDuration > 0) {
      const elapsed = gameState.currentTime - gameState.degaussStartTime;
      const pct = elapsed / gameState.degaussDuration;

      if (gameState.degaussStartTime !== this.lastDegaussStartTime) {
        this.lastDegaussStartTime = gameState.degaussStartTime;
        if (gameState.aiDifficultyLevel === 1) {
          this.shakenOffActive = Math.random() < 0.75;
        } else if (gameState.aiDifficultyLevel === 2) {
          this.shakenOffActive = Math.random() < 0.5;
        } else {
          this.shakenOffActive = false;
        }
      }

      if (this.shakenOffActive) {
        if (pct >= 0.8) {
          this.shakenOffActive = false;
          this.reacting = false;
          this.lastDirection = ball.vy > 0 ? 1 : (ball.vy < 0 ? -1 : 0);
          // fall through to normal AI
        } else {
          const aiMaxSpeed = paddle.speed * 0.71;
          if (pct < 0.4) {
            const targetVelocity = this.currentVelocity >= 0 ? -aiMaxSpeed : aiMaxSpeed;
            this.currentVelocity += (targetVelocity - this.currentVelocity) * this.smoothingFactor;
          } else {
            this.currentVelocity += (0 - this.currentVelocity) * (this.smoothingFactor * 0.5);
          }
          this.currentVelocity = Math.max(-aiMaxSpeed, Math.min(aiMaxSpeed, this.currentVelocity));
          paddle.y += this.currentVelocity;
          return this.getDirectionFromVelocity();
        }
      }
    }

    // Update target - track ball's vertical position
    this.targetY = ball.y;
    
    // Detect direction change (ball's vertical velocity)
    const currentDir = ball.vy > 0 ? 1 : (ball.vy < 0 ? -1 : 0);
    if (currentDir !== this.lastDirection && currentDir !== 0) {
      // Direction changed - trigger reaction delay
      this.reacting = true;
      this.directionChangeTime = performance.now();
      
      // Calculate reaction delay based on skill
      // Lower skill = longer base delay
      const baseDelay = this.minReactionTime + 
                       (1.0 - this.skill) * (this.maxReactionTime - this.minReactionTime);
      // Add random variation: ±80% of base delay (more erratic)
      const randomVariation = (Math.random() - 0.5) * 1.6 * baseDelay;
      this.reactionDelay = Math.max(0, baseDelay + randomVariation);
    }
    this.lastDirection = currentDir;
    
    // Check if reaction delay has passed
    if (this.reacting) {
      const elapsed = performance.now() - this.directionChangeTime;
      if (elapsed < this.reactionDelay) {
        // Still reacting - continue current velocity (don't accelerate)
        // Apply current velocity to paddle
        paddle.y += this.currentVelocity;
        return this.getDirectionFromVelocity();
      }
      this.reacting = false;
    }
    
    // Calculate acceleration rate from skill
    // Higher skill = faster acceleration
    const accelRate = this.minAccelRate + 
                     this.skill * (this.maxAccelRate - this.minAccelRate);
    
    // Calculate desired direction based on target position
    const paddleCenterY = paddle.y + paddle.height / 2;
    const distance = this.targetY - paddleCenterY;
    const threshold = 2; // Small threshold to prevent jitter
    
    // Calculate target velocity (where we want to go)
    const maxSpeed = paddle.speed; // PADDLE_SPEED
    let targetVelocity = 0;
    if (Math.abs(distance) < threshold) {
      // Close enough - target is to stop
      targetVelocity = 0;
    } else {
      // Calculate target velocity based on distance and max speed
      const direction = distance > 0 ? 1 : -1;
      // Scale target velocity based on distance (closer = slower approach)
      const distanceFactor = Math.min(1.0, Math.abs(distance) / 20); // Normalize distance
      targetVelocity = direction * maxSpeed * distanceFactor;
    }
    
    // Smoothly interpolate current velocity towards target velocity
    // This creates smooth, natural motion
    this.currentVelocity += (targetVelocity - this.currentVelocity) * this.smoothingFactor;
    
    // Limit velocity to ~71% of max paddle speed (reduced by another 25% from 95%)
    // 95% * 0.75 = 71.25%, rounded to 71%
    const aiMaxSpeed = maxSpeed * 0.71; // 71% of human speed (25% slower)
    this.currentVelocity = Math.max(-aiMaxSpeed, Math.min(aiMaxSpeed, this.currentVelocity));
    
    // Update paddle position directly
    paddle.y += this.currentVelocity;
    
    // Return direction for consistency (not used by AI, but kept for interface)
    return this.getDirectionFromVelocity();
  }
  
  getDirectionFromVelocity() {
    if (Math.abs(this.currentVelocity) < 0.1) return null;
    return this.currentVelocity > 0 ? 'down' : 'up';
  }
}

/**
 * Pong Game
 */
class Pong {
  constructor(display) {
    this.display = display;
    this.width = display.emulatedWidth;
    this.height = display.emulatedHeight;
    
    // Game constants
    this.PADDLE_WIDTH = PADDLE_WIDTH;
    this.PADDLE_HEIGHT = PADDLE_HEIGHT;
    this.PADDLE_SPEED = PADDLE_SPEED;
    this.BALL_SPEED = BALL_SPEED;
    
    // Paddle positions
    this.PADDLE_LEFT_X = PADDLE_EDGE_OFFSET;
    this.PADDLE_RIGHT_X = this.width - 4;
    
    // Game state
    this.gameState = 'MENU'; // 'MENU', 'COUNTDOWN', 'PLAYING', 'PAUSED', 'GAME_OVER'
    this.countdownNumber = 3;
    this.countdownStartTime = 0;
    this.winner = null; // 'left' or 'right'
    this.winning = false; // debug win shortcut (o key); also used by drawGameOverMessage
    this.gameOverViaDebugKey = false; // O/L from menu; allows 1/2 to switch to 2P-style "1P"/"2P" view
    this.debugGameOverVariant = null; // null | '1P' | '2P' when gameOverViaDebugKey
    this.gameOverStartTime = 0;
    this.restartArrowRotation = 0;
    this.restartArrowRotationSpeed = RESTART_ARROW_SPEED;
    this.pauseButtonScale = 1.0;
    
    // Saved state for pause/resume
    this.savedState = null;
    this.resumingFromPause = false; // Flag to track if we're resuming from pause
    
    // Volley counter for speed increase
    this.volleyCount = 0;
    
    // Current speed multiplier for AI skill scaling
    this.currentSpeedMultiplier = 1.0;
    
    // Right-side selector: '2P' (human) or 1, 2, 3 (AI difficulty)
    this.rightPlayerOption = 2;
    this.aiDifficultyLevel = 2; // Kept in sync with rightPlayerOption when not 2P

    // Menu frame positions
    this.player1FrameX = 0;
    this.player1FrameY = 0;
    this.player2FrameX = 0;
    this.player2FrameY = 0;
    this.startButtonFrameX = 0;
    this.startButtonFrameY = 0;
    
    // Bouncing PONG title in menu
    this.pongTitleX = Math.floor(this.width / 2);
    this.pongTitleY = Math.floor(this.height / 2);
    this.pongTitleVx = (Math.random() > 0.5 ? 1 : -1) * 0.5;
    this.pongTitleVy = (Math.random() > 0.5 ? 1 : -1) * 0.5;
    
    // Initialize game objects
    this.leftPaddle = {
      x: this.PADDLE_LEFT_X,
      y: Math.floor(this.height / 2 - this.PADDLE_HEIGHT / 2),
      width: this.PADDLE_WIDTH,
      height: this.PADDLE_HEIGHT,
      speed: this.PADDLE_SPEED
    };
    
    this.rightPaddle = {
      x: this.PADDLE_RIGHT_X,
      y: Math.floor(this.height / 2 - this.PADDLE_HEIGHT / 2),
      width: this.PADDLE_WIDTH,
      height: this.PADDLE_HEIGHT,
      speed: this.PADDLE_SPEED
    };
    
    this.ball = {
      x: Math.floor(this.width / 2),
      y: Math.floor(this.height / 2),
      vx: 0,
      vy: 0,
      radius: 1
    };
    
    this.score = {
      left: 0,
      right: 0
    };
    
    // Pre-created controllers; leftController/rightController set in startNewGame
    this._keyboard1P = new KeyboardController({ upKeys: UP_KEYS_1P, downKeys: DOWN_KEYS_1P });
    this._keyboardLeft2P = new KeyboardController({ upKeys: UP_KEYS_LEFT_2P, downKeys: DOWN_KEYS_LEFT_2P });
    this._keyboardRight2P = new KeyboardController({ upKeys: UP_KEYS_RIGHT_2P, downKeys: DOWN_KEYS_RIGHT_2P });
    this._aiController = new AIController(0.5);
    this.leftController = this._keyboard1P;
    this.rightController = this._aiController;
    
    // Button bounds for click detection
    this.startButtonBounds = null;
    this.restartButtonBounds = null;
    
    // Calculate menu frame positions (evenly spaced on left half, mirrored on right)
    this.calculateMenuFramePositions();
    
    // Setup mouse click handler
    this.setupClickHandler();
    
    // Setup pause key handler
    this.setupPauseHandler();

    // State dispatch for update() to replace if/else chain
    this._runStateUpdate = {
      'MENU': function() { this.drawMenu(); },
      'COUNTDOWN': function() { this.drawCountdown(); },
      'PAUSED': function() { this.drawPauseButton(); this.drawCurrentFrame(); },
      'GAME_OVER': function() { this.drawGameOver(); this.drawCurrentFrame(); },
      'PLAYING': function() { }
    };
  }
  
  /**
   * Calculate menu frame positions (evenly spaced on left half, mirrored on right)
   */
  calculateMenuFramePositions() {
    const midX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const buttonSize = BUTTON_SIZE;
    
    // Left half: divide into 3 equal sections
    // Player 1 at 1/3, Start at 2/3
    const leftSectionWidth = midX / 3;
    const player1CenterX = Math.floor(leftSectionWidth);
    const startButtonCenterX = Math.floor(leftSectionWidth * 2);
    
    // Player 1 frame position (left side)
    this.player1FrameX = player1CenterX - Math.floor(buttonSize / 2);
    this.player1FrameY = centerY - Math.floor(buttonSize / 2);
    
    // Start button frame position (left side, middle)
    this.startButtonFrameX = startButtonCenterX - Math.floor(buttonSize / 2);
    this.startButtonFrameY = centerY - Math.floor(buttonSize / 2);
    
    // Player 2 frame position (right side, mirrored from Player 1)
    const player2CenterX = this.width - player1CenterX;
    this.player2FrameX = player2CenterX - Math.floor(buttonSize / 2);
    this.player2FrameY = centerY - Math.floor(buttonSize / 2);
  }
  
  /**
   * Maintain court layer - redraws court pixels every frame
   * Ensures court pixels are always ON regardless of other elements
   */
  maintainCourt() {
    const midX = Math.floor(this.width / 2);
    this.display.drawLineVDashed(midX, 0, this.height - 1, 2);
    this.display.drawLineH(0, 0, this.width - 1);
    this.display.drawLineH(this.height - 1, 0, this.width - 1);
    this.updateScores();
  }
  
  /**
   * Draw a single digit at position (x, y)
   */
  drawNumber(x, y, digit, scale = 1.0) {
    const font = PIXEL_FONT[digit];
    if (!font) return;
    this.display.drawPattern(font, x, y, Math.max(1, scale));
  }
  
  /**
   * Update score displays
   */
  updateScores() {
    this.drawNumber(2, 2, this.score.left);
    this.drawNumber(this.width - 7, 2, this.score.right);
  }
  
  /**
   * Draw countdown with zoom bounce animation
   */
  drawCountdown() {
    const currentTime = (this.display.getTime && this.display.getTime()) || performance.now();
    const elapsed = currentTime - this.countdownStartTime;
    const countdownDuration = 750; // 750ms per number
    
    if (elapsed >= countdownDuration) {
      // Move to next number
      this.countdownNumber--;
      this.countdownStartTime = currentTime;
      
      if (this.countdownNumber < 1) {
        // Countdown complete
        this.gameState = 'PLAYING';
        
        // Only reset ball if we're not resuming from pause
        if (!this.resumingFromPause) {
          this.resetBall();
        }
        this.resumingFromPause = false; // Reset flag
        return;
      }
    }
    
    // Calculate bounce scale (starts at 2.0, bounces to 1.0)
    const progress = elapsed / countdownDuration;
    // Bounce easing: overshoot then settle
    let scale = 1.0;
    if (progress < 0.5) {
      // First half: scale down from 2.0 to 1.0
      scale = 2.0 - (progress * 2.0);
    } else {
      // Second half: slight bounce back
      const bounce = (progress - 0.5) * 2.0;
      scale = 1.0 - (bounce * bounce * 0.2); // Slight overshoot then settle
    }
    
    // Draw number centered: use actual drawn size so it zooms in place at screen center
    const w = Math.ceil(5 * scale);
    const h = Math.ceil(7 * scale);
    const centerX = Math.floor(this.width / 2) - Math.floor(w / 2);
    const centerY = Math.floor(this.height / 2) - Math.floor(h / 2);
    this.drawNumber(centerX, centerY, this.countdownNumber, scale);
  }
  
  /**
   * Cached blink state so all blinking=true frames on screen are in sync. Uses 2P rates: speed 0.0025, on when cycle < 0.7. Recomputes once per ~16ms.
   */
  _getBlinkOn() {
    const now = performance.now();
    if (!this._blinkSnapshot || (now - this._blinkSnapshot.at) > BLINK_CACHE_MS) {
      const cycle = (now * BLINK_SPEED) % 1.0;
      this._blinkSnapshot = { at: now, on: cycle < BLINK_ON_THRESHOLD };
    }
    return this._blinkSnapshot.on;
  }

  /**
   * Whether pixel (px, py) can be drawn: not on court midline/top/bottom; optionally exclude restart button area.
   * @param {number} px
   * @param {number} py
   * @param {{ excludeButton?: boolean }} [opts]
   */
  _canDrawPixel(px, py, opts = {}) {
    const midX = Math.floor(this.width / 2);
    if (px === midX || py === 0 || py === this.height - 1) return false;
    if (opts.excludeButton) {
      const centerY = Math.floor(this.height / 2);
      if (px > this.width - BUTTON_PADDING && (py > centerY - BUTTON_PADDING_V && py < centerY + BUTTON_PADDING_V)) return false;
    }
    return true;
  }

  /**
   * Draw frame (1px outline). Court preserve. Square: size×size at (x, y).
   * @param {boolean} [blinking=false] - If false, always draw. If true, draw only when blink is on (2P timing); all blinking frames stay in sync.
   */
  drawFrame(x, y, size, blinking = false) {
    if (blinking && !this._getBlinkOn()) return;
    const midX = Math.floor(this.width / 2);
    this.display.drawRectOutline(x, y, size, size, {
      preserve: (px, py) => px === midX || py === 0 || py === this.height - 1
    });
  }

  /**
   * Draw blinking frame around button
   */
  drawButtonFrame(buttonX, buttonY, buttonSize) {
    this.drawFrame(buttonX, buttonY, buttonSize, true);
  }
  
  drawPlayer1Frame() {
    const buttonSize = BUTTON_SIZE;
    const buttonX = this.player1FrameX;
    const buttonY = this.player1FrameY;
    this.drawFrame(buttonX, buttonY, buttonSize, true);
    const scale = SCALE_1P;
    const edgeGap = 1;
    const textStartX = buttonX + edgeGap - 1; // 1px left
    const textStartY = buttonY + edgeGap + 2;
    const digit1W = Math.ceil(5 * scale);
    this.display.drawPattern(PIXEL_FONT[1], textStartX, textStartY, scale);
    this.display.drawPattern(LARGE_LETTER_PATTERNS['P'], textStartX + digit1W + 1, textStartY, scale);
  }

  /**
   * Draw VCR Play icon (triangle) for start button (20x20)
   */
  drawStartArrow() {
    const midX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const buttonSize = BUTTON_SIZE;
    
    // Use calculated position from calculateMenuFramePositions
    const buttonX = this.startButtonFrameX;
    const buttonY = this.startButtonFrameY;
    
    // Draw VCR Play icon (right triangle with vertical left edge pointing right)
    const triangleLeftX = buttonX + 5; // Left vertical edge
    const triangleTopY = buttonY + 5; // Top point
    const triangleBottomY = buttonY + buttonSize - 5; // Bottom point
    const triangleRightX = buttonX + buttonSize - 5; // Right point (tip)
    const triangleCenterY = triangleTopY + Math.floor((triangleBottomY - triangleTopY) / 2);
    const triangleHeight = triangleBottomY - triangleTopY;
    
    // Draw filled right triangle
    // Triangle has vertical left edge, tapers to point on right
    for (let y = triangleTopY; y <= triangleBottomY; y++) {
      // Calculate distance from center (0 at center, max at top/bottom)
      const distFromCenter = Math.abs(y - triangleCenterY);
      // Width decreases as we move away from center
      // At center: full width, at top/bottom: narrows to point
      const maxWidth = triangleRightX - triangleLeftX;
      const width = Math.max(1, Math.floor(maxWidth * (1 - (distFromCenter / (triangleHeight / 2)))));
      
      // Draw horizontal line from left edge, width determined by position
      for (let x = triangleLeftX; x < triangleLeftX + width; x++) {
        if (x >= buttonX && x < buttonX + buttonSize && y >= buttonY && y < buttonY + buttonSize) {
          if (x >= 0 && x < this.width && y >= 0 && y < this.height && this._canDrawPixel(x, y)) {
            this.display.setPixel(x, y, true);
          }
        }
      }
    }
    
    // Draw blinking frame
    this.drawButtonFrame(buttonX, buttonY, buttonSize);
    
    // Store button bounds for click detection (20x20)
    this.startButtonBounds = {
      x: buttonX,
      y: buttonY,
      width: buttonSize,
      height: buttonSize
    };
  }
  
  /**
   * Draw curved arrow that twists clockwise for restart button (20x20)
   */
  drawRestartArrow() {
    const midX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const buttonSize = BUTTON_SIZE;
    
    // Center on right side of screen
    const rightSideCenterX = midX + Math.floor((this.width - midX) / 2);
    const buttonX = rightSideCenterX - Math.floor(buttonSize / 2);
    const buttonY = centerY - Math.floor(buttonSize / 2);
    
    // Update rotation for twisting effect
    this.restartArrowRotation += this.restartArrowRotationSpeed;
    if (this.restartArrowRotation >= Math.PI * 2) {
      this.restartArrowRotation -= Math.PI * 2;
    }
    
    // Draw curved arrow that twists clockwise (circular arrow pattern)
    const arrowCenterX = buttonX + Math.floor(buttonSize / 2);
    const arrowCenterY = buttonY + Math.floor(buttonSize / 2);
    const radius = RESTART_ARROW_RADIUS;
    
    // Draw circular arrow arc (curved arrow body)
    // Start from 0 and go around circle with twist based on rotation
    for (let angle = 0; angle < Math.PI * 1.5; angle += 0.15) {
      // Apply twist - the arrow rotates clockwise around the circle
      const twistedAngle = angle + this.restartArrowRotation;
      const x = Math.round(arrowCenterX + Math.cos(twistedAngle) * radius);
      const y = Math.round(arrowCenterY + Math.sin(twistedAngle) * radius);
      
      if (x >= buttonX && x < buttonX + buttonSize && y >= buttonY && y < buttonY + buttonSize) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
          if (x !== midX && y !== 0 && y !== this.height - 1) {
            // Draw thicker line (2-3 pixels wide)
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                const px = x + dx;
                const py = y + dy;
                if (px >= buttonX && px < buttonX + buttonSize && py >= buttonY && py < buttonY + buttonSize) {
                  if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
                    this.display.setPixel(px, py, true);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Draw arrow head at the end of the curve
    const headAngle = Math.PI * 1.5 + this.restartArrowRotation;
    const headX = Math.round(arrowCenterX + Math.cos(headAngle) * (radius + 2));
    const headY = Math.round(arrowCenterY + Math.sin(headAngle) * (radius + 2));
    
    // Draw arrow head pointing in direction of curve
    const headDirection = headAngle + Math.PI / 6; // Point along curve
    for (let i = 0; i < 3; i++) {
      const offsetAngle1 = headDirection + (i * Math.PI / 3);
      const offsetAngle2 = headDirection - (i * Math.PI / 3);
      const px1 = Math.round(headX + Math.cos(offsetAngle1) * i);
      const py1 = Math.round(headY + Math.sin(offsetAngle1) * i);
      const px2 = Math.round(headX + Math.cos(offsetAngle2) * i);
      const py2 = Math.round(headY + Math.sin(offsetAngle2) * i);
      
      for (const [px, py] of [[px1, py1], [px2, py2], [headX, headY]]) {
        if (px >= buttonX && px < buttonX + buttonSize && py >= buttonY && py < buttonY + buttonSize) {
          if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
    
    // Draw blinking frame
    this.drawButtonFrame(buttonX, buttonY, buttonSize);
    
    // Store button bounds for click detection (20x20)
    this.restartButtonBounds = {
      x: buttonX,
      y: buttonY,
      width: buttonSize,
      height: buttonSize
    };
  }
  
  /**
   * Draw bouncing PONG title
   */
  drawBouncingPongTitle() {
    // Update position
    this.pongTitleX += this.pongTitleVx;
    this.pongTitleY += this.pongTitleVy;
    
    // Bounce off walls
    const titleWidth = 28; // Approximate width of "PONG" at scale 2
    const titleHeight = 14; // Approximate height at scale 2
    
    if (this.pongTitleX < titleWidth / 2) {
      this.pongTitleX = titleWidth / 2;
      this.pongTitleVx = -this.pongTitleVx;
    } else if (this.pongTitleX > this.width - titleWidth / 2) {
      this.pongTitleX = this.width - titleWidth / 2;
      this.pongTitleVx = -this.pongTitleVx;
    }
    
    if (this.pongTitleY < titleHeight / 2 + 1) { // +1 for top wall
      this.pongTitleY = titleHeight / 2 + 1;
      this.pongTitleVy = -this.pongTitleVy;
    } else if (this.pongTitleY > this.height - titleHeight / 2 - 1) { // -1 for bottom wall
      this.pongTitleY = this.height - titleHeight / 2 - 1;
      this.pongTitleVy = -this.pongTitleVy;
    }
    
    // Draw "PONG" text at position (large scale). drawPattern has no court preserve; PONG stays in center and rarely hits walls.
    const letters = ['P', 'O', 'N', 'G'];
    const charWidth = 7;
    const scale = 2;
    const startX = Math.floor(this.pongTitleX - (letters.length * charWidth * scale) / 2);
    const startY = Math.floor(this.pongTitleY - (9 * scale) / 2);
    for (let i = 0; i < letters.length; i++) {
      const pattern = LARGE_LETTER_PATTERNS[letters[i]];
      if (pattern) this.display.drawPattern(pattern, startX + i * charWidth * scale, startY, scale);
    }
  }
  
  /**
   * Draw triangle with long side parallel to edge, pointing to right angle
   * FLIPPED: For up: long horizontal side at bottom, point at top (flipped)
   * FLIPPED: For down: long horizontal side at top, point at bottom (flipped)
   * 2x larger than before
   */
  drawSmallTriangle(centerX, centerY, direction, filled) {
    const longSideLength = SMALL_TRIANGLE_LONG_SIDE;
    const height = SMALL_TRIANGLE_HEIGHT;
    
    if (direction === 'up') {
      // Up triangle FLIPPED: long horizontal side at bottom, point at top (right angle)
      // Draw from bottom (long side) to top (point)
      for (let row = 0; row < height; row++) {
        const width = longSideLength - (height - 1 - row) * 2; // Increases from top to bottom
        if (width > 0) {
          const startX = centerX - Math.floor(width / 2);
          for (let col = 0; col < width; col++) {
            const px = startX + col;
            const py = centerY - height + row; // Start from top (point)
            if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
              const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
              if (filled || isBorder) {
                this.display.setPixel(px, py, true);
              }
            }
          }
        }
      }
    } else {
      // Down triangle FLIPPED: long horizontal side at top, point at bottom (right angle)
      // Draw from top (long side) to bottom (point)
      for (let row = 0; row < height; row++) {
        const width = longSideLength - row * 2; // Decreases from top to bottom
        if (width > 0) {
          const startX = centerX - Math.floor(width / 2);
          for (let col = 0; col < width; col++) {
            const px = startX + col;
            const py = centerY + row; // Start from top (long side)
            if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
              const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
              if (filled || isBorder) {
                this.display.setPixel(px, py, true);
              }
            }
          }
        }
      }
    }
  }
  
  /**
   * Draw Player 2 frame: 2P (human) or AI level 1/2/3. Cycle: 2P <-> 1 <-> 2 <-> 3.
   */
  drawPlayer2Frame() {
    const buttonSize = BUTTON_SIZE;
    const buttonX = this.player2FrameX;
    const buttonY = this.player2FrameY;

    this.drawFrame(buttonX, buttonY, buttonSize, true);

    const centerX = buttonX + Math.floor(buttonSize / 2);
    const upTriangleY = buttonY - TRIANGLE_OFFSET - TRIANGLE_EXTRA;
    const downTriangleY = buttonY + buttonSize + TRIANGLE_OFFSET + TRIANGLE_EXTRA;

    // Cycle 2P, 1, 2, 3 (wrap). Triangles: solid when that move is possible, hollow at limits.
    const order = ['2P', 1, 2, 3];
    const i = Math.max(0, order.indexOf(this.rightPlayerOption));
    const upFilled = i < 3;   // hollow at 3 (up would wrap to 2P; we treat 3 as top for "AI level")
    const downFilled = i > 0; // hollow at 2P (down would wrap to 3; we treat 2P as bottom for "human")
    this.drawSmallTriangle(centerX, upTriangleY, 'up', upFilled);
    this.drawSmallTriangle(centerX, downTriangleY, 'down', downFilled);

    if (this.rightPlayerOption === '2P') {
      // Draw "2P": "2" 2px narrower than 1P digit; P matches 1P style; +2px right
      const scaleP = SCALE_1P;
      const edgeGap = 1;
      const textStartX = buttonX + edgeGap - 1 + 2;
      const textStartY = buttonY + edgeGap + 2;
      const scale2 = SCALE_2P_DIGIT;
      const digit2W = Math.ceil(5 * scale2);
      this.display.drawPattern(PIXEL_FONT[2], textStartX, textStartY, scale2);
      this.display.drawPattern(LARGE_LETTER_PATTERNS['P'], textStartX + digit2W + 1, textStartY, scaleP);
    } else {
      const digit = this.aiDifficultyLevel;
      const digitWidth = 5;
      const scale = 2;
      const digitX = buttonX + Math.floor((buttonSize - digitWidth * scale) / 2);
      const digitY = buttonY + Math.floor((buttonSize - 7 * scale) / 2);
      this.display.drawPattern(PIXEL_FONT[digit], digitX, digitY, scale);
    }
  }
  
  drawMenu() {
    this.drawBouncingPongTitle();
    this.drawPlayer1Frame();
    this.drawStartArrow();
    this.drawPlayer2Frame();
  }
  
  /**
   * Draw emoji face (pixel art)
   */
  drawEmojiFace(x, y, type, size = 7) {
    // Emoji patterns: smiley, winking, frowny
    const patterns = {
      smiley: [
        [0,1,1,1,1,1,0],
        [1,0,0,0,0,0,1],
        [1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1],
        [1,0,1,0,1,0,1],
        [1,0,0,1,0,0,1],
        [0,1,1,0,1,1,0]
      ],
      winking: [
        [0,1,1,1,1,1,0],
        [1,0,0,0,0,0,1],
        [1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1],
        [1,0,0,1,0,0,1],
        [0,1,1,0,1,1,0]
      ],
      frowny: [
        [0,1,1,1,1,1,0],
        [1,0,0,0,0,0,1],
        [1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1],
        [1,0,1,0,1,0,1],
        [1,1,0,0,0,1,1],
        [0,0,1,1,1,0,0]
      ],
      thumbsDown: [
        [0,0,1,1,1,0,0],
        [0,1,1,1,1,1,0],
        [0,1,1,1,1,1,0],
        [0,0,1,1,1,0,0],
        [0,0,0,1,0,0,0],
        [0,0,1,1,1,0,0],
        [0,1,1,1,1,1,0]
      ],
      xMark: [
        [1,0,0,0,0,0,1],
        [0,1,0,0,0,1,0],
        [0,0,1,0,1,0,0],
        [0,0,0,1,0,0,0],
        [0,0,1,0,1,0,0],
        [0,1,0,0,0,1,0],
        [1,0,0,0,0,0,1]
      ]
    };
    
    const pattern = patterns[type];
    if (!pattern) return;
    
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col] === 1) {
          const px = x + col;
          const py = y + row;
          if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
  }
  
  /**
   * Draw firework burst (radial pattern)
   */
  drawFirework(x, y, time, index) {
    const burstRadius = 8 + Math.sin(time * 0.01 + index) * 3;
    const numRays = 8;
    
    // Draw radial rays
    for (let i = 0; i < numRays; i++) {
      const angle = (i / numRays) * Math.PI * 2 + (time * 0.002);
      const rayLength = burstRadius;
      
      for (let r = 0; r < rayLength; r += 0.5) {
        const px = Math.round(x + Math.cos(angle) * r);
        const py = Math.round(y + Math.sin(angle) * r);
        if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
          this.display.setPixel(px, py, true);
        }
      }
    }
    
    // Draw center sparkle
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
          this.display.setPixel(px, py, true);
        }
      }
    }
  }
  
  /**
   * Returns 'WINNER!' or 'YOU LOSE' from game-over state (for drawGameOverMessage).
   */
  _getGameOverMessage() {
    const is2P = this.rightPlayerOption === '2P';
    const isWinner = this.winner === 'left' || this.winning === true;
    if (this.gameOverViaDebugKey) {
      return this.debugGameOverVariant ? 'WINNER!' : (isWinner ? 'WINNER!' : 'YOU LOSE');
    }
    return is2P ? 'WINNER!' : (isWinner ? 'WINNER!' : 'YOU LOSE');
  }

  /**
   * Returns whether to draw the "1P"/"2P" bouncing label in game-over (for drawGameOverMessage).
   */
  _shouldShow2PLabel() {
    const is2P = this.rightPlayerOption === '2P';
    return (is2P && (this.winner === 'left' || this.winner === 'right')) ||
      (this.gameOverViaDebugKey && (this.debugGameOverVariant === '1P' || this.debugGameOverVariant === '2P'));
  }

  /**
   * Draw large pixel text for WINNER or YOU LOSE (simple bouncing text)
   */
  drawGameOverMessage() {
    const currentTime = performance.now();
    const elapsed = currentTime - this.gameOverStartTime;
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const message = this._getGameOverMessage();

    const charWidth = GAME_OVER_CHAR_WIDTH;
    const messageWidth = message.length * charWidth;
    const bounceY = Math.sin(elapsed * GAME_OVER_BOUNCE_SPEED) * GAME_OVER_BOUNCE_AMOUNT;
    const baseY = centerY - GAME_OVER_BASE_Y_OFFSET;
    const startY = baseY + bounceY;
    const startX = centerX - Math.floor(messageWidth / 2) + (message === 'WINNER!' ? GAME_OVER_WINNER_X_OFFSET : GAME_OVER_LOSE_X_OFFSET);

    const letterPatterns = LARGE_LETTER_PATTERNS;
    let charIndex = 0;
    for (const char of message) {
      if (char === ' ') { charIndex++; continue; }
      const pattern = letterPatterns[char.toUpperCase()];
      if (pattern) {
        const charX = startX + (charIndex * charWidth);
        const textScale = GAME_OVER_TEXT_SCALE;
        for (let row = 0; row < 9; row++) {
          for (let col = 0; col < 7; col++) {
            if (pattern[row] && pattern[row][col] === 1) {
              for (let sy = 0; sy < textScale; sy++) {
                for (let sx = 0; sx < textScale; sx++) {
                  const px = Math.floor(charX + col * textScale + sx);
                  const py = Math.floor(startY + row * textScale + sy);
                  if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py, { excludeButton: true })) {
                    this.display.setPixel(px, py, true);
                  }
                }
              }
            }
          }
        }
      }
      charIndex++;
    }

    // 2P or debug 2P-style: draw "1P" or "2P" big and bouncing in the center of the lower half
    if (this._shouldShow2PLabel()) {
      const label = this.debugGameOverVariant || (this.winner === 'left' ? '1P' : '2P');
      const digit = label[0];
      const lowerMidY = Math.floor(this.height / 2) + Math.floor((this.height / 2) / 2);
      const labelBounceY = Math.sin(elapsed * LABEL_BOUNCE_SPEED) * LABEL_BOUNCE_AMOUNT;
      const labelY = lowerMidY + labelBounceY;
      const labelScale = LABEL_SCALE;
      const glyphW = Math.ceil(LABEL_GLYPH_COLS * labelScale);
      const gapW = LABEL_GAP_W;
      const totalW = glyphW + gapW + glyphW;
      let labelX = centerX - Math.floor(totalW / 2);

      const drawGlyph = (pat, x) => {
        if (!pat) return;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 7; c++) {
            if (pat[r] && pat[r][c] === 1) {
              for (let sy = 0; sy < labelScale; sy++) {
                for (let sx = 0; sx < labelScale; sx++) {
                  const px = Math.floor(x + c * labelScale + sx);
                  const py = Math.floor(labelY + r * labelScale + sy);
                  if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py, { excludeButton: true })) {
                    this.display.setPixel(px, py, true);
                  }
                }
              }
            }
          }
        }
      };
      drawGlyph(letterPatterns[digit], labelX);
      drawGlyph(letterPatterns['P'], labelX + glyphW + gapW);
    }
  }
  
  /**
   * Draw game over state
   */
  drawGameOver() {
    // Draw winner/loser message
    this.drawGameOverMessage();
    
    // Draw restart arrow
    this.drawRestartArrow();
  }
  
  /**
   * Check if a click is within button bounds
   */
  checkButtonClick(pixelX, pixelY) {
    if (this.gameState === 'MENU' && this.startButtonBounds) {
      if (pixelX >= this.startButtonBounds.x && 
          pixelX < this.startButtonBounds.x + this.startButtonBounds.width &&
          pixelY >= this.startButtonBounds.y && 
          pixelY < this.startButtonBounds.y + this.startButtonBounds.height) {
        this.startNewGame();
        return true;
      }
    } else if (this.gameState === 'GAME_OVER' && this.restartButtonBounds) {
      if (pixelX >= this.restartButtonBounds.x && 
          pixelX < this.restartButtonBounds.x + this.restartButtonBounds.width &&
          pixelY >= this.restartButtonBounds.y && 
          pixelY < this.restartButtonBounds.y + this.restartButtonBounds.height) {
        this.goToMenu();
        return true;
      }
    }
    return false;
  }
  
  /**
   * Go to menu screen
   */
  goToMenu() {
    // Reset game state
    this.gameState = 'MENU';
    this.winner = null;
    this.winning = false;
    this.gameOverViaDebugKey = false;
    this.debugGameOverVariant = null;
    this.gameOverStartTime = 0;
    
    // Reset PONG title position and velocity
    this.pongTitleX = Math.floor(this.width / 2);
    this.pongTitleY = Math.floor(this.height / 2);
    this.pongTitleVx = (Math.random() > 0.5 ? 1 : -1) * 0.5;
    this.pongTitleVy = (Math.random() > 0.5 ? 1 : -1) * 0.5;
  }
  
  /**
   * Calculate AI skill from difficulty level and speed multiplier
   */
  calculateAISkill() {
    let baseSkill;
    if (this.aiDifficultyLevel === 1) {
      baseSkill = 0.2;
    } else if (this.aiDifficultyLevel === 2) {
      baseSkill = 0.5;
    } else { // Level 3
      baseSkill = 0.8;
      // For level 3, scale from 0.8 to 0.95 as speed increases
      const maxSpeedMultiplier = 2.0;
      const maxIncrease = 0.15; // 0.95 - 0.8
      const scaleFactor = maxIncrease / (maxSpeedMultiplier - 1.0);
      const speedIncrease = Math.min(this.currentSpeedMultiplier - 1.0, maxSpeedMultiplier - 1.0);
      baseSkill = 0.8 + speedIncrease * scaleFactor;
      // Cap at 0.95 maximum
      baseSkill = Math.min(baseSkill, 0.95);
    }
    return baseSkill;
  }
  
  /**
   * Update AI controller skill based on current difficulty and speed
   */
  updateAIControllerSkill() {
    const skill = this.calculateAISkill();
    this.rightController.skill = skill;
  }
  
  /**
   * Start a new game
   */
  startNewGame() {
    // Reset scores
    this.score.left = 0;
    this.score.right = 0;
    
    // Reset volley count and speed multiplier
    this.volleyCount = 0;
    this.currentSpeedMultiplier = 1.0;
    
    // Reset paddles
    this.leftPaddle.y = Math.floor(this.height / 2 - this.PADDLE_HEIGHT / 2);
    this.rightPaddle.y = Math.floor(this.height / 2 - this.PADDLE_HEIGHT / 2);
    
    // Reset ball (will be started after countdown)
    this.ball.x = Math.floor(this.width / 2);
    this.ball.y = Math.floor(this.height / 2);
    this.ball.vx = 0;
    this.ball.vy = 0;
    
    // Update scores display
    this.updateScores();

    // Apply controllers from rightPlayerOption (2P vs 1P)
    if (this.rightPlayerOption === '2P') {
      this.leftController = this._keyboardLeft2P;
      this.rightController = this._keyboardRight2P;
    } else {
      this.leftController = this._keyboard1P;
      this.rightController = this._aiController;
      this.updateAIControllerSkill();
    }

    // Start countdown
    this.gameState = 'COUNTDOWN';
    this.countdownNumber = 3;
    this.countdownStartTime = performance.now();
    this.winner = null;
    this.winning = false;
    this.gameOverViaDebugKey = false;
    this.debugGameOverVariant = null;
    this.gameOverStartTime = 0;
  }
  
  /**
   * Check if game should end
   */
  checkGameEnd() {
    if (this.score.left >= GOALS_TO_WIN) {
      this.winner = 'left';
      this.gameState = 'GAME_OVER';
      this.gameOverStartTime = performance.now();
      this.ball.vx = 0;
      this.ball.vy = 0;
    } else if (this.score.right >= GOALS_TO_WIN) {
      this.winner = 'right';
      this.gameState = 'GAME_OVER';
      this.gameOverStartTime = performance.now();
      this.ball.vx = 0;
      this.ball.vy = 0;
    }
  }
  
  /**
   * Setup pause key handler (P key)
   */
  setupPauseHandler() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', (e) => {
      if (KEY_PAUSE.includes(e.key) || e.keyCode === 80) {
        e.preventDefault();
        if (this.gameState === 'PLAYING') {
          this.pauseGame();
        } else if (this.gameState === 'PAUSED') {
          this.unpauseGame();
        }
      }
    });
  }
  
  /**
   * Pause the game
   */
  pauseGame() {
    // Save current game state
    this.savedState = {
      ball: {
        x: this.ball.x,
        y: this.ball.y,
        vx: this.ball.vx,
        vy: this.ball.vy
      },
      leftPaddle: {
        y: this.leftPaddle.y
      },
      rightPaddle: {
        y: this.rightPaddle.y
      },
      score: {
        left: this.score.left,
        right: this.score.right
      }
    };
    
    this.gameState = 'PAUSED';
    this.pauseButtonScale = 1.0;
  }
  
  /**
   * Unpause the game - start countdown and restore state
   */
  unpauseGame() {
    // Restore saved state
    if (this.savedState) {
      this.ball.x = this.savedState.ball.x;
      this.ball.y = this.savedState.ball.y;
      this.ball.vx = this.savedState.ball.vx;
      this.ball.vy = this.savedState.ball.vy;
      this.leftPaddle.y = this.savedState.leftPaddle.y;
      this.rightPaddle.y = this.savedState.rightPaddle.y;
      this.score.left = this.savedState.score.left;
      this.score.right = this.savedState.score.right;
      this.updateScores();
    }
    
    // Set flag to indicate we're resuming from pause
    this.resumingFromPause = true;
    
    // Start countdown
    this.gameState = 'COUNTDOWN';
    this.countdownNumber = 3;
    this.countdownStartTime = performance.now();
    this.savedState = null;
  }
  
  /**
   * Draw VCR Pause button (two vertical bars) with bounce animation
   */
  drawPauseButton() {
    const currentTime = performance.now();
    this.pauseButtonScale = 1.0 + Math.sin(currentTime * PAUSE_BOUNCE_SPEED) * PAUSE_BOUNCE_AMOUNT;
    
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const barWidth = PAUSE_BAR_WIDTH;
    const barHeight = PAUSE_BAR_HEIGHT;
    const barSpacing = PAUSE_BAR_SPACING;
    
    // Draw two vertical bars (pause icon)
    const scaledBarWidth = Math.floor(barWidth * this.pauseButtonScale);
    const scaledBarHeight = Math.floor(barHeight * this.pauseButtonScale);
    const totalWidth = scaledBarWidth * 2 + barSpacing;
    
    const leftBarX = centerX - Math.floor(totalWidth / 2);
    const rightBarX = leftBarX + scaledBarWidth + barSpacing;
    const barY = centerY - Math.floor(scaledBarHeight / 2);
    
    // Draw left bar
    for (let y = 0; y < scaledBarHeight; y++) {
      for (let x = 0; x < scaledBarWidth; x++) {
        const px = leftBarX + x;
        const py = barY + y;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
          this.display.setPixel(px, py, true);
        }
      }
    }
    
    // Draw right bar
    for (let y = 0; y < scaledBarHeight; y++) {
      for (let x = 0; x < scaledBarWidth; x++) {
        const px = rightBarX + x;
        const py = barY + y;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height && this._canDrawPixel(px, py)) {
          this.display.setPixel(px, py, true);
        }
      }
    }
  }
  
  /**
   * Setup mouse click and keyboard handlers
   */
  setupClickHandler() {
    const canvas = this.display.canvas;
    if (typeof document === 'undefined' || !canvas || typeof canvas.addEventListener !== 'function') return;

    // Mouse click handler
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      
      // Convert to pixel coordinates
      const pixelX = Math.floor((canvasX / canvas.width) * this.width);
      const pixelY = Math.floor((canvasY / canvas.height) * this.height);
      
      this.checkButtonClick(pixelX, pixelY);
    });
    
    // Keyboard handler for Enter key and arrow keys
    document.addEventListener('keydown', (e) => {
      if (e.key === KEY_DEGAUSS || e.keyCode === 32) {
        e.preventDefault();
        if (this.display && typeof this.display.degauss === 'function') this.display.degauss();
        return;
      }
      if (e.key === KEY_ENTER || e.keyCode === 13) {
        e.preventDefault();
        if (this.gameState === 'MENU') {
          this.startNewGame();
        } else if (this.gameState === 'GAME_OVER') {
          this.goToMenu();
        }
      } else if (this.gameState === 'MENU' && (KEY_MENU_UP.includes(e.key) || KEY_MENU_DOWN.includes(e.key))) {
        // Cycle right-side selector: 2P, 1, 2, 3 (no wrap: stop at 3 going up, at 2P going down)
        e.preventDefault();
        const isUp = KEY_MENU_UP.includes(e.key);
        const isDown = KEY_MENU_DOWN.includes(e.key);
        const order = ['2P', 1, 2, 3];
        let i = order.indexOf(this.rightPlayerOption);
        if (i === -1) i = 1;
        if (isUp && i < 3) i++;
        else if (isDown && i > 0) i--;
        this.rightPlayerOption = order[i];
        this.aiDifficultyLevel = this.rightPlayerOption === '2P' ? 1 : this.rightPlayerOption;
        if (this.rightPlayerOption !== '2P') this.updateAIControllerSkill();
      } else if (__DEBUG_SCREENS_ENABLED__ && KEY_DEBUG_WIN.includes(e.key) && this.gameState === 'MENU') {
        // Debug: show win screen (1P-style); on screen, 1/2 switch to 2P-style "1P"/"2P" view
        e.preventDefault();
        this.gameState = 'GAME_OVER';
        this.winning = true;
        this.gameOverViaDebugKey = true;
        this.debugGameOverVariant = null;
        this.gameOverStartTime = performance.now();
      } else if (__DEBUG_SCREENS_ENABLED__ && KEY_DEBUG_LOSE.includes(e.key) && this.gameState === 'MENU') {
        // Debug: show lose screen
        e.preventDefault();
        this.gameState = 'GAME_OVER';
        this.winner = null;
        this.winning = false;
        this.gameOverViaDebugKey = true;
        this.debugGameOverVariant = null;
        this.gameOverStartTime = performance.now();
      } else if (__DEBUG_SCREENS_ENABLED__ && this.gameState === 'GAME_OVER' && this.gameOverViaDebugKey && (e.key === KEY_DEBUG_1 || e.key === KEY_DEBUG_2)) {
        // Debug win screen only: switch to "1P won" or "2P won" 2P-style view
        e.preventDefault();
        this.debugGameOverVariant = e.key === KEY_DEBUG_1 ? '1P' : '2P';
      }
    });
  }
  
  /**
   * Draw current frame's dynamic elements.
   * @param {number} [alpha] - Interpolation factor 0..1. When provided with prevState, positions are interpolated.
   * @param {Object} [prevState] - { ball: {x,y}, leftPaddle: {y}, rightPaddle: {y} } at start of last logic tick.
   */
  drawCurrentFrame(alpha, prevState) {
    const a = alpha != null ? alpha : 1;
    const leftY = prevState ? prevState.leftPaddle.y + (this.leftPaddle.y - prevState.leftPaddle.y) * a : this.leftPaddle.y;
    const rightY = prevState ? prevState.rightPaddle.y + (this.rightPaddle.y - prevState.rightPaddle.y) * a : this.rightPaddle.y;
    const ballX = prevState ? prevState.ball.x + (this.ball.x - prevState.ball.x) * a : this.ball.x;
    const ballY = prevState ? prevState.ball.y + (this.ball.y - prevState.ball.y) * a : this.ball.y;

    this.display.drawRectFilled(this.PADDLE_LEFT_X, Math.floor(leftY), this.PADDLE_WIDTH, this.PADDLE_HEIGHT);
    this.display.drawRectFilled(this.PADDLE_RIGHT_X, Math.floor(rightY), this.PADDLE_WIDTH, this.PADDLE_HEIGHT);
    const bx = Math.floor(ballX);
    const by = Math.floor(ballY);
    if (bx >= 0 && bx < this.width && by >= 0 && by < this.height) {
      this.display.drawRectFilled(bx, by, 1, 1);
    }
  }
  
  /**
   * Update paddle position based on controller input
   */
  updatePaddle(paddle, controller) {
    // AI controllers directly modify paddle.y in their update() method
    // Human controllers return direction ('up'/'down'/'null')
    if (controller instanceof AIController) {
      // Update AI skill dynamically (especially for level 3 with speed scaling)
      this.updateAIControllerSkill();
      
      // AI controller handles movement internally
      controller.update(paddle, this.ball, {
        score: this.score,
        width: this.width,
        height: this.height,
        speedMultiplier: this.currentSpeedMultiplier,
        degaussStartTime: this.display.degaussStartTime,
        degaussDuration: this.display.degaussDuration,
        currentTime: performance.now(),
        aiDifficultyLevel: this.aiDifficultyLevel
      });
    } else {
      // Human controller returns direction
      const direction = controller.update(paddle, this.ball, {
        score: this.score,
        width: this.width,
        height: this.height
      });
      
      if (direction === 'up') {
        paddle.y -= paddle.speed;
      } else if (direction === 'down') {
        paddle.y += paddle.speed;
      }
    }
    
    // Constrain paddle to screen (can't move off back line) - applies to both AI and human
    if (paddle.y < 1) {
      paddle.y = 1; // 1 to account for top wall
    }
    if (paddle.y + paddle.height > this.height - 1) {
      paddle.y = this.height - 1 - paddle.height; // Account for bottom wall
    }
  }
  
  /**
   * Check collision between ball and paddle
   */
  checkPaddleCollision(paddle) {
    const ballX = this.ball.x;
    const ballY = this.ball.y;
    
    // Check if ball is within paddle's x range
    if (ballX >= paddle.x && ballX < paddle.x + paddle.width) {
      // Check if ball is within paddle's y range
      if (ballY >= paddle.y && ballY < paddle.y + paddle.height) {
        // Calculate hit position on paddle (0 to 1)
        const hitPos = (ballY - paddle.y) / paddle.height;
        
        // Increment volley count (ball hit a paddle)
        this.volleyCount++;
        
        // Calculate speed multiplier based on volley count
        const speedMultiplier = Math.min(1.0 + (this.volleyCount * SPEED_INCREASE_PER_VOLLEY), MAX_SPEED_MULTIPLIER);
        
        // Store current speed multiplier for AI skill scaling
        this.currentSpeedMultiplier = speedMultiplier;
        
        // Reverse x velocity and apply speed multiplier
        this.ball.vx = -this.ball.vx * speedMultiplier;
        
        // Adjust y velocity based on hit position, maintaining speed multiplier
        // Hit near top = upward angle, hit near bottom = downward angle
        const angle = (hitPos - 0.5) * 2; // -1 to 1
        // Maintain proportional speed increase
        const baseVyMagnitude = Math.abs(angle * this.BALL_SPEED * 0.8);
        this.ball.vy = (angle >= 0 ? 1 : -1) * baseVyMagnitude * speedMultiplier;
        
        // Ensure minimum speed
        if (Math.abs(this.ball.vx) < 0.5) {
          this.ball.vx = this.ball.vx > 0 ? 0.5 : -0.5;
        }
        
        return true;
      }
    }
    return false;
  }
  
  /**
   * Update ball position and check collisions
   */
  updateBall() {
    // Update position
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;
    
    // Check wall collisions (top and bottom)
    if (this.ball.y <= 1) {
      this.ball.y = 1;
      this.ball.vy = -this.ball.vy;
    }
    if (this.ball.y >= this.height - 2) {
      this.ball.y = this.height - 2;
      this.ball.vy = -this.ball.vy;
    }
    
    // Check paddle collisions
    this.checkPaddleCollision(this.leftPaddle);
    this.checkPaddleCollision(this.rightPaddle);
    
    // Check goals
    if (this.ball.x < 0) {
      // Right player scores
      this.score.right++;
      this.updateScores();
      this.volleyCount = 0; // Reset volley count on score
      this.currentSpeedMultiplier = 1.0; // Reset speed multiplier
      this.resetBall();
    } else if (this.ball.x >= this.width) {
      // Left player scores
      this.score.left++;
      this.updateScores();
      this.volleyCount = 0; // Reset volley count on score
      this.currentSpeedMultiplier = 1.0; // Reset speed multiplier
      this.resetBall();
    }
  }
  
  /**
   * Reset ball to center with random direction
   */
  resetBall() {
    this.ball.x = Math.floor(this.width / 2);
    this.ball.y = Math.floor(this.height / 2);
    
    // Reset volley count and speed multiplier when ball is reset
    this.volleyCount = 0;
    this.currentSpeedMultiplier = 1.0;
    
    // Randomize speed: ±5% from base BALL_SPEED
    const speedVariation = 1.0 + (Math.random() - 0.5) * 0.1; // ±5%
    const baseSpeed = this.BALL_SPEED * speedVariation;
    
    // Randomize direction: ±10 degrees from base angle
    // Base angle is approximately 45 degrees (when vy = 0.7 * vx)
    const baseAngle = Math.atan2(0.7, 1.0); // ~35 degrees
    const angleVariation = (Math.random() - 0.5) * (10 * Math.PI / 180); // ±10 degrees in radians
    const angle = baseAngle + angleVariation;
    
    // Randomize horizontal direction (left or right)
    const horizontalDir = Math.random() > 0.5 ? 1 : -1;
    
    // Calculate velocity components
    this.ball.vx = horizontalDir * baseSpeed * Math.cos(angle);
    this.ball.vy = baseSpeed * Math.sin(angle);
  }
  
  /**
   * Update game state (called each frame). Dispatches to _runStateUpdate[gameState].
   */
  update() {
    this.maintainCourt();
    const fn = this._runStateUpdate[this.gameState];
    if (fn) { fn.call(this); return; }
  }

  /**
   * Logic-only update for PLAYING (called from main loop at 60Hz).
   */
  updateLogic(dtMs) {
    this.updatePaddle(this.leftPaddle, this.leftController);
    this.updatePaddle(this.rightPaddle, this.rightController);
    this.updateBall();
    this.checkGameEnd();
  }
}

export { Pong };

// Initialize game (skip in test when #display is missing)
if (typeof document !== 'undefined' && document.getElementById('display')) {
const canvas = document.getElementById('display');
const display = new PixelDisplay(canvas, 160, 120, 800, 600);
const game = new Pong(display);

let lastTs = 0;
let accumulator = 0;
let lastRenderTime;
let prevGameState = null;

function gameLoop(ts) {
  if (!lastTs) lastTs = ts;
  let frameMs = Math.min(ts - lastTs, MAX_FRAME_MS);
  lastTs = ts;
  accumulator += frameMs;

  // On transition into PLAYING (e.g. from COUNTDOWN), reset accumulator so we don't
  // run a burst of logic updates that glitches paddles to edges and can corrupt score.
  if (game.gameState === 'PLAYING' && prevGameState !== 'PLAYING') {
    accumulator = 0;
  }
  prevGameState = game.gameState;

  display.clear();

  let prevState = null;
  if (game.gameState === 'PLAYING') {
    game.maintainCourt();
    let n = 0;
    while (accumulator >= DT_MS && n < MAX_UPDATES_PER_FRAME) {
      prevState = { ball: { x: game.ball.x, y: game.ball.y }, leftPaddle: { y: game.leftPaddle.y }, rightPaddle: { y: game.rightPaddle.y } };
      game.updateLogic(DT_MS);
      accumulator -= DT_MS;
      n++;
    }
    if (prevState == null) prevState = { ball: { x: game.ball.x, y: game.ball.y }, leftPaddle: { y: game.leftPaddle.y }, rightPaddle: { y: game.rightPaddle.y } };
  } else {
    game.update(DT_MS);
  }

  const alpha = accumulator / DT_MS;
  const now = performance.now();
  const dtSinceLastRender = lastRenderTime != null ? now - lastRenderTime : 0;
  if (game.gameState === 'PLAYING') {
    game.drawCurrentFrame(alpha, prevState);
  }
  display.render(alpha, { now, dtSinceLastRender });
  lastRenderTime = now;

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
}
