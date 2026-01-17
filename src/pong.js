import { PixelDisplay } from './pixel-display.js';

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
      ArrowDown: false
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
    if (this.keys.ArrowUp) return 'up';
    if (this.keys.ArrowDown) return 'down';
    return null;
  }
}

/**
 * AIController - Placeholder for AI or human control
 */
class AIController extends PlayerController {
  update(paddle, ball, gameState) {
    // Placeholder: stationary for now
    // Can be extended to follow ball or accept user input
    return null;
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
    this.PADDLE_WIDTH = 3;
    this.PADDLE_HEIGHT = 16;
    this.PADDLE_SPEED = 2.0;
    this.BALL_SPEED = 1.0;
    
    // Paddle positions
    this.PADDLE_LEFT_X = 2;
    this.PADDLE_RIGHT_X = this.width - 4;
    
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
      vx: this.BALL_SPEED,
      vy: (Math.random() > 0.5 ? 1 : -1) * this.BALL_SPEED * 0.7,
      radius: 1
    };
    
    this.score = {
      left: 0,
      right: 0
    };
    
    // Controllers
    this.leftController = new KeyboardController();
    this.rightController = new AIController();
    
    // Track previous positions for clearing
    this.prevLeftPaddleY = this.leftPaddle.y;
    this.prevRightPaddleY = this.rightPaddle.y;
    this.prevBallX = this.ball.x;
    this.prevBallY = this.ball.y;
    
    // Draw court (always-on elements)
    this.drawCourt();
  }
  
  /**
   * Draw the court (midcourt line and walls)
   * These pixels stay ON permanently
   */
  drawCourt() {
    const midX = Math.floor(this.width / 2);
    
    // Midcourt line (dashed pattern - every other pixel)
    for (let y = 0; y < this.height; y++) {
      if (y % 2 === 0) {
        this.display.setPixel(midX, y, true);
      }
    }
    
    // Top wall
    for (let x = 0; x < this.width; x++) {
      this.display.setPixel(x, 0, true);
    }
    
    // Bottom wall
    for (let x = 0; x < this.width; x++) {
      this.display.setPixel(x, this.height - 1, true);
    }
  }
  
  /**
   * Clear previous frame's dynamic elements
   */
  clearPreviousFrame() {
    // Clear left paddle
    for (let py = 0; py < this.PADDLE_HEIGHT; py++) {
      const y = this.prevLeftPaddleY + py;
      if (y >= 0 && y < this.height) {
        for (let px = 0; px < this.PADDLE_WIDTH; px++) {
          const x = this.PADDLE_LEFT_X + px;
          if (x >= 0 && x < this.width) {
            // Only clear if it's not part of the court
            if (x !== Math.floor(this.width / 2) && y !== 0 && y !== this.height - 1) {
              this.display.setPixel(x, y, false);
            }
          }
        }
      }
    }
    
    // Clear right paddle
    for (let py = 0; py < this.PADDLE_HEIGHT; py++) {
      const y = this.prevRightPaddleY + py;
      if (y >= 0 && y < this.height) {
        for (let px = 0; px < this.PADDLE_WIDTH; px++) {
          const x = this.PADDLE_RIGHT_X + px;
          if (x >= 0 && x < this.width) {
            // Only clear if it's not part of the court
            if (x !== Math.floor(this.width / 2) && y !== 0 && y !== this.height - 1) {
              this.display.setPixel(x, y, false);
            }
          }
        }
      }
    }
    
    // Clear ball
    const ballX = Math.floor(this.prevBallX);
    const ballY = Math.floor(this.prevBallY);
    if (ballX >= 0 && ballX < this.width && ballY >= 0 && ballY < this.height) {
      // Only clear if it's not part of the court
      if (ballX !== Math.floor(this.width / 2) && ballY !== 0 && ballY !== this.height - 1) {
        this.display.setPixel(ballX, ballY, false);
      }
    }
  }
  
  /**
   * Draw current frame's dynamic elements
   */
  drawCurrentFrame() {
    // Draw left paddle
    for (let py = 0; py < this.PADDLE_HEIGHT; py++) {
      const y = Math.floor(this.leftPaddle.y + py);
      if (y >= 0 && y < this.height) {
        for (let px = 0; px < this.PADDLE_WIDTH; px++) {
          const x = this.PADDLE_LEFT_X + px;
          if (x >= 0 && x < this.width) {
            this.display.setPixel(x, y, true);
          }
        }
      }
    }
    
    // Draw right paddle
    for (let py = 0; py < this.PADDLE_HEIGHT; py++) {
      const y = Math.floor(this.rightPaddle.y + py);
      if (y >= 0 && y < this.height) {
        for (let px = 0; px < this.PADDLE_WIDTH; px++) {
          const x = this.PADDLE_RIGHT_X + px;
          if (x >= 0 && x < this.width) {
            this.display.setPixel(x, y, true);
          }
        }
      }
    }
    
    // Draw ball
    const ballX = Math.floor(this.ball.x);
    const ballY = Math.floor(this.ball.y);
    if (ballX >= 0 && ballX < this.width && ballY >= 0 && ballY < this.height) {
      this.display.setPixel(ballX, ballY, true);
    }
  }
  
  /**
   * Update paddle position based on controller input
   */
  updatePaddle(paddle, controller) {
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
    
    // Constrain paddle to screen (can't move off back line)
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
        
        // Reverse x velocity
        this.ball.vx = -this.ball.vx;
        
        // Adjust y velocity based on hit position
        // Hit near top = upward angle, hit near bottom = downward angle
        const angle = (hitPos - 0.5) * 2; // -1 to 1
        this.ball.vy = angle * this.BALL_SPEED * 0.8;
        
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
      this.resetBall();
    } else if (this.ball.x >= this.width) {
      // Left player scores
      this.score.left++;
      this.resetBall();
    }
  }
  
  /**
   * Reset ball to center with random direction
   */
  resetBall() {
    this.ball.x = Math.floor(this.width / 2);
    this.ball.y = Math.floor(this.height / 2);
    this.ball.vx = (Math.random() > 0.5 ? 1 : -1) * this.BALL_SPEED;
    this.ball.vy = (Math.random() > 0.5 ? 1 : -1) * this.BALL_SPEED * 0.7;
  }
  
  /**
   * Update game state (called each frame)
   */
  update() {
    // Update paddles
    this.updatePaddle(this.leftPaddle, this.leftController);
    this.updatePaddle(this.rightPaddle, this.rightController);
    
    // Update ball
    this.updateBall();
    
    // Clear previous frame
    this.clearPreviousFrame();
    
    // Draw current frame
    this.drawCurrentFrame();
    
    // Store current positions for next frame
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

// Start display render loop
display.start();

// Game loop
function gameLoop() {
  game.update();
  requestAnimationFrame(gameLoop);
}

gameLoop();
