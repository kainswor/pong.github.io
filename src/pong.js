import { PixelDisplay } from './pixel-display.js';
import { PIXEL_FONT, LARGE_LETTER_PATTERNS } from './sprites.js';

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
 * KeyboardController - Controls paddle with arrow keys
 */
class KeyboardController extends PlayerController {
  constructor() {
    super();
    this.keys = {
      ArrowUp: false,
      ArrowDown: false,
      w: false,
      W: false,
      s: false,
      S: false
    };
    
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
  
  update(paddle, ball, gameState) {
    // Arrow keys or WASD for up
    if (this.keys.ArrowUp || this.keys.w || this.keys.W) return 'up';
    // Arrow keys or WASD for down
    if (this.keys.ArrowDown || this.keys.s || this.keys.S) return 'down';
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
    this.PADDLE_WIDTH = 2;
    this.PADDLE_HEIGHT = 14;
    this.PADDLE_SPEED = 1.8; // 90% of 2.0
    this.BALL_SPEED = 1.0;
    
    // Paddle positions
    this.PADDLE_LEFT_X = 2;
    this.PADDLE_RIGHT_X = this.width - 4;
    
    // Game state
    this.gameState = 'MENU'; // 'MENU', 'COUNTDOWN', 'PLAYING', 'PAUSED', 'GAME_OVER'
    this.countdownNumber = 3;
    this.countdownStartTime = 0;
    this.countdownScale = 1.0;
    this.winner = null; // 'left' or 'right'
    this.winning = false; // debug win shortcut (o key); also used by drawGameOverMessage
    this.gameOverStartTime = 0;
    this.restartArrowRotation = 0;
    this.restartArrowRotationSpeed = 0.1;
    this.pauseButtonScale = 1.0;
    this.pauseButtonScaleDirection = 1;
    
    // Saved state for pause/resume
    this.savedState = null;
    this.resumingFromPause = false; // Flag to track if we're resuming from pause
    
    // Volley counter for speed increase
    this.volleyCount = 0;
    
    // Current speed multiplier for AI skill scaling
    this.currentSpeedMultiplier = 1.0;
    
    // AI difficulty level (1, 2, or 3)
    this.aiDifficultyLevel = 2; // Default: level 2 (normal skill 0.5)
    
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
    
    // Controllers
    this.leftController = new KeyboardController();
    this.rightController = new AIController(0.5); // Default skill: 0.5 (normal)
    
    // Track previous positions for clearing
    this.prevLeftPaddleY = this.leftPaddle.y;
    this.prevRightPaddleY = this.rightPaddle.y;
    this.prevBallX = this.ball.x;
    this.prevBallY = this.ball.y;
    
    // Button bounds for click detection
    this.startButtonBounds = null;
    this.restartButtonBounds = null;
    
    // Calculate menu frame positions (evenly spaced on left half, mirrored on right)
    this.calculateMenuFramePositions();
    
    // Setup mouse click handler
    this.setupClickHandler();
    
    // Setup pause key handler
    this.setupPauseHandler();
  }
  
  /**
   * Calculate menu frame positions (evenly spaced on left half, mirrored on right)
   */
  calculateMenuFramePositions() {
    const midX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const buttonSize = 20;
    
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
   * Draw a score (0-5) at position
   */
  drawScore(x, y, score) {
    this.drawNumber(x, y, score);
  }
  
  /**
   * Update score displays
   */
  updateScores() {
    // Left score (top-left)
    this.drawScore(2, 2, this.score.left);
    
    // Right score (top-right)
    this.drawScore(this.width - 7, 2, this.score.right);
  }
  
  /**
   * Draw countdown with zoom bounce animation
   */
  drawCountdown() {
    const currentTime = performance.now();
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
   * Draw a button with text
   */
  drawButton(x, y, text) {
    // Simple button: text with border
    // For simplicity, we'll just draw the text
    // Button bounds will be calculated based on text
    const textWidth = text.length * 6; // Approximate width per character
    const textHeight = 7;
    
    // Store button bounds for click detection
    const bounds = {
      x: x - 2,
      y: y - 2,
      width: textWidth + 4,
      height: textHeight + 4
    };
    
    // Draw button background (simple rectangle)
    for (let by = bounds.y; by < bounds.y + bounds.height; by++) {
      for (let bx = bounds.x; bx < bounds.x + bounds.width; bx++) {
        if (bx >= 0 && bx < this.width && by >= 0 && by < this.height) {
          if (bx !== Math.floor(this.width / 2) && by !== 0 && by !== this.height - 1) {
            this.display.setPixel(bx, by, true);
          }
        }
      }
    }
    
    // Draw text (simplified - just draw "START" or "RESTART" as numbers/letters)
    // For simplicity, we'll use a basic approach
    // Actually, let's just draw simple text using pixel patterns
    return bounds;
  }
  
  /**
   * Cached blink state so all blinking=true frames on screen are in sync. Uses 2P rates: speed 0.0025, on when cycle < 0.7. Recomputes once per ~16ms.
   */
  _getBlinkOn() {
    const now = performance.now();
    const BLINK_CACHE_MS = 16;
    if (!this._blinkSnapshot || (now - this._blinkSnapshot.at) > BLINK_CACHE_MS) {
      const blinkSpeed = 0.0025;
      const cycle = (now * blinkSpeed) % 1.0;
      this._blinkSnapshot = { at: now, on: cycle < 0.7 };
    }
    return this._blinkSnapshot.on;
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
    const buttonSize = 20;
    const buttonX = this.player1FrameX;
    const buttonY = this.player1FrameY;
    this.drawFrame(buttonX, buttonY, buttonSize, true);
    const scale = 17 / 12; // 2px wider than 5/4: "1" 8px + gap 1 + "P" 10px = 19; top-left fixed
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
    const buttonSize = 20;
    
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
          if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            if (x !== midX && y !== 0 && y !== this.height - 1) {
              this.display.setPixel(x, y, true);
            }
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
    const buttonSize = 20;
    
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
    const radius = 6;
    
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
                  if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
                    if (px !== midX && py !== 0 && py !== this.height - 1) {
                      this.display.setPixel(px, py, true);
                    }
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
          if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            if (px !== midX && py !== 0 && py !== this.height - 1) {
              this.display.setPixel(px, py, true);
            }
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
  drawSmallTriangle(centerX, centerY, direction, filled, midX) {
    const longSideLength = 10; // 2x larger: was 5, now 10
    const height = 6; // 2x larger: was 3, now 6
    
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
            if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
              if (px !== midX && py !== 0 && py !== this.height - 1) {
                // If filled, draw all pixels. If outlined, only draw border pixels
                const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
                if (filled || isBorder) {
                  this.display.setPixel(px, py, true);
                }
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
            if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
              if (px !== midX && py !== 0 && py !== this.height - 1) {
                // If filled, draw all pixels. If outlined, only draw border pixels
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
  }
  
  /**
   * Draw Player 2 frame with difficulty selector (blinking frame, up/down arrows, number)
   */
  drawPlayer2Frame() {
    const midX = Math.floor(this.width / 2);
    const buttonSize = 20;
    const buttonX = this.player2FrameX;
    const buttonY = this.player2FrameY;

    this.drawFrame(buttonX, buttonY, buttonSize, true);

    // Draw up/down arrow triangles OUTSIDE the frame (on the outside edges)
    // Triangles are now 2x larger (height 6), so adjust offset
    const centerX = buttonX + Math.floor(buttonSize / 2);
    const triangleOffset = 3; // Distance outside frame (adjusted for larger triangles)
    const upTriangleY = buttonY - triangleOffset - 3; // Above top edge (center of triangle)
    const downTriangleY = buttonY + buttonSize + triangleOffset + 3; // Below bottom edge (center of triangle)
    
    // Reversed order: up arrow increases (1->2->3), down arrow decreases (3->2->1)
    // Up triangle: solid if can increase (level < 3), outlined if can't (level === 3)
    const upFilled = this.aiDifficultyLevel < 3;
    this.drawSmallTriangle(centerX, upTriangleY, 'up', upFilled, midX);
    
    // Down triangle: solid if can decrease (level > 1), outlined if can't (level === 1)
    const downFilled = this.aiDifficultyLevel > 1;
    this.drawSmallTriangle(centerX, downTriangleY, 'down', downFilled, midX);
    
    const digit = this.aiDifficultyLevel;
    const digitWidth = 5;
    const scale = 2;
    const digitX = buttonX + Math.floor((buttonSize - digitWidth * scale) / 2);
    const digitY = buttonY + Math.floor((buttonSize - 7 * scale) / 2);
    this.display.drawPattern(PIXEL_FONT[digit], digitX, digitY, scale);
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
          if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            const midX = Math.floor(this.width / 2);
            if (px !== midX && py !== 0 && py !== this.height - 1) {
              this.display.setPixel(px, py, true);
            }
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
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          const midX = Math.floor(this.width / 2);
          if (px !== midX && py !== 0 && py !== this.height - 1) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
    
    // Draw center sparkle
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          const midX = Math.floor(this.width / 2);
          if (px !== midX && py !== 0 && py !== this.height - 1) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
  }
  
  /**
   * Draw large pixel text for WINNER or YOU LOSE (simple bouncing text)
   */
  drawGameOverMessage() {
    const currentTime = performance.now();
    const elapsed = currentTime - this.gameOverStartTime;
    
    const isWinner = this.winner === 'left' || this.winning === true;
    const message = isWinner ? 'WINNER!' : 'YOU LOSE';
    
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const charWidth = 10;
    const messageWidth = message.length * charWidth;
    
    // Bouncing animation for text (vertical bounce) - positioned higher to avoid button
    const bounceSpeed = 0.003;
    const bounceAmount = 3;
    const bounceY = Math.sin(elapsed * bounceSpeed) * bounceAmount;
    // Button is at centerY ± 10 (20px tall), text is ~13px tall, so position higher
    const baseY = centerY - 28; // Moved higher to avoid restart button
    const startY = baseY + bounceY;
    const startX = centerX - Math.floor(messageWidth / 2) + (isWinner ? 1 : 3); // WINNER! +1px right, YOU LOSE +3px right

    const letterPatterns = LARGE_LETTER_PATTERNS;
    
    // Draw main message text with bouncing
    let charIndex = 0;
    for (const char of message) {
      if (char === ' ') {
        charIndex++;
        continue;
      }
      
      const pattern = letterPatterns[char.toUpperCase()];
      if (pattern) {
        const charX = startX + (charIndex * charWidth);
        const charY = startY;
        const textScale = 1.26; // 10% smaller: 1.4 * 0.9 = 1.26
        
        for (let row = 0; row < 9; row++) {
          for (let col = 0; col < 7; col++) {
            if (pattern[row] && pattern[row][col] === 1) {
              for (let sy = 0; sy < textScale; sy++) {
                for (let sx = 0; sx < textScale; sx++) {
                  const px = Math.floor(charX + col * textScale + sx);
                  const py = Math.floor(charY + row * textScale + sy);
                  if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
                    const midX = Math.floor(this.width / 2);
                    // Keep button areas clear (right side for restart button)
                    const buttonPadding = 30;
                    const isInButtonArea = px > this.width - buttonPadding && 
                                         (py > centerY - 25 && py < centerY + 25);
                    if (px !== midX && py !== 0 && py !== this.height - 1 && !isInButtonArea) {
                      this.display.setPixel(px, py, true);
                    }
                  }
                }
              }
            }
          }
        }
      }
      charIndex++;
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
    
    // Update AI controller with selected difficulty
    this.updateAIControllerSkill();
    
    // Start countdown
    this.gameState = 'COUNTDOWN';
    this.countdownNumber = 3;
    this.countdownStartTime = performance.now();
    this.countdownScale = 2.0;
    this.winner = null;
    this.winning = false;
    this.gameOverStartTime = 0;
  }
  
  /**
   * Update countdown state
   */
  updateCountdown() {
    this.drawCountdown();
  }
  
  /**
   * Check if game should end
   */
  checkGameEnd() {
    if (this.score.left >= 5) {
      this.winner = 'left';
      this.gameState = 'GAME_OVER';
      this.gameOverStartTime = performance.now();
      this.ball.vx = 0;
      this.ball.vy = 0;
    } else if (this.score.right >= 5) {
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P' || e.keyCode === 80) {
        e.preventDefault();
        if (this.gameState === 'PLAYING') {
          // Pause the game
          this.pauseGame();
        } else if (this.gameState === 'PAUSED') {
          // Unpause - start countdown and resume
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
    this.pauseButtonScaleDirection = 1;
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
    
    // Update bounce animation
    const bounceSpeed = 0.005;
    const bounceAmount = 0.3;
    this.pauseButtonScale = 1.0 + Math.sin(currentTime * bounceSpeed) * bounceAmount;
    
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const barWidth = 3;
    const barHeight = 12;
    const barSpacing = 2;
    
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
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          const midX = Math.floor(this.width / 2);
          if (px !== midX && py !== 0 && py !== this.height - 1) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
    
    // Draw right bar
    for (let y = 0; y < scaledBarHeight; y++) {
      for (let x = 0; x < scaledBarWidth; x++) {
        const px = rightBarX + x;
        const py = barY + y;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          const midX = Math.floor(this.width / 2);
          if (px !== midX && py !== 0 && py !== this.height - 1) {
            this.display.setPixel(px, py, true);
          }
        }
      }
    }
  }
  
  /**
   * Setup mouse click and keyboard handlers
   */
  setupClickHandler() {
    const canvas = this.display.canvas;
    
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
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        if (this.display && typeof this.display.degauss === 'function') this.display.degauss();
        return;
      }
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        // Trigger button action based on current state
        if (this.gameState === 'MENU') {
          this.startNewGame();
        } else if (this.gameState === 'GAME_OVER') {
          this.goToMenu();
        }
      } else if (this.gameState === 'MENU' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S')) {
        // Handle arrow keys or WASD in menu state to change difficulty
        // Reversed order: up increases (1->2->3), down decreases (3->2->1)
        // W or ArrowUp = up, S or ArrowDown = down
        e.preventDefault();
        const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
        const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
        if (isUp && this.aiDifficultyLevel < 3) {
          this.aiDifficultyLevel++;
        } else if (isDown && this.aiDifficultyLevel > 1) {
          this.aiDifficultyLevel--;
        }
        // Update AI controller skill when difficulty changes
        this.updateAIControllerSkill();
      } else if ((e.key === 'o' || e.key === 'O') && this.gameState === 'MENU') {
        // Debug: show win screen
        e.preventDefault();
        this.gameState = 'GAME_OVER';
        this.winning = true;
        this.gameOverStartTime = performance.now();
      } else if ((e.key === 'l' || e.key === 'L') && this.gameState === 'MENU') {
        // Debug: show lose screen
        e.preventDefault();
        this.gameState = 'GAME_OVER';
        this.winner = null;
        this.winning = false;
        this.gameOverStartTime = performance.now();
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
        // Each volley increases speed by 0.25% (much more gradual, capped at reasonable maximum)
        const speedIncreasePerVolley = 0.0025;
        const maxSpeedMultiplier = 2.0; // Cap at 2x speed
        const speedMultiplier = Math.min(1.0 + (this.volleyCount * speedIncreasePerVolley), maxSpeedMultiplier);
        
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
   * Update game state (called each frame)
   */
  update() {
    // Always maintain court layer first (ensures court pixels are always ON)
    this.maintainCourt();
    
    if (this.gameState === 'MENU') {
      this.drawMenu();
      return;
    } else if (this.gameState === 'COUNTDOWN') {
      // Update countdown
      this.updateCountdown();
      // Don't update game objects during countdown
      return;
    } else if (this.gameState === 'PAUSED') {
      // Draw pause screen - show pause button and current game state
      this.drawPauseButton();
      // Draw current game state (paddles and ball frozen)
      this.drawCurrentFrame();
      return;
    } else if (this.gameState === 'GAME_OVER') {
      // Draw game over screen
      // Don't clear previous frame here - drawGameOverMessage handles its own cleanup
      // Draw game over (message and restart button) - this will animate
      this.drawGameOver();
      // Still draw paddles and ball in final position
      this.drawCurrentFrame();
      // Message animates continuously until restart
      return;
    } else if (this.gameState === 'PLAYING') {
      // Logic and draw are done by the main loop (updateLogic + drawCurrentFrame)
      return;
    }
  }

  /**
   * Logic-only update for PLAYING (called from main loop at 60Hz).
   */
  updateLogic(dtMs) {
    this.updatePaddle(this.leftPaddle, this.leftController);
    this.updatePaddle(this.rightPaddle, this.rightController);
    this.updateBall();
    this.checkGameEnd();
    this.prevLeftPaddleY = Math.floor(this.leftPaddle.y);
    this.prevRightPaddleY = Math.floor(this.rightPaddle.y);
    this.prevBallX = this.ball.x;
    this.prevBallY = this.ball.y;
  }
}

// Initialize game
const canvas = document.getElementById('display');
const display = new PixelDisplay(canvas, 160, 120, 800, 600);
const game = new Pong(display);

const LOGIC_HZ = 60;
const DT_MS = 1000 / LOGIC_HZ;
const MAX_FRAME_MS = 200;
const MAX_UPDATES_PER_FRAME = 5;

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
