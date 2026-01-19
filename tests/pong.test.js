/**
 * Pong game logic unit tests. Uses a test PixelDisplay; no DOM.
 */
import { describe, it, expect } from 'vitest';
import { createDisplayForTest } from './pixel-display-test-utils.js';
import { Pong } from '../src/pong.js';
import { GOALS_TO_WIN, BUTTON_PADDING, BUTTON_PADDING_V } from '../src/constants.js';

function createPongForTest(displayOverrides = {}) {
  const display = createDisplayForTest({ emulatedWidth: 160, emulatedHeight: 120, ...displayOverrides });
  return new Pong(display);
}

describe('Pong', () => {
  describe('_canDrawPixel', () => {
    it('returns false for (midX, any), (any, 0), (any, height-1)', () => {
      const game = createPongForTest();
      const midX = Math.floor(game.width / 2);
      const h = game.height;
      expect(game._canDrawPixel(midX, 50)).toBe(false);
      expect(game._canDrawPixel(10, 0)).toBe(false);
      expect(game._canDrawPixel(10, h - 1)).toBe(false);
    });

    it('returns true for interior points not on court', () => {
      const game = createPongForTest();
      const midX = Math.floor(game.width / 2);
      expect(game._canDrawPixel(0, 1)).toBe(true);
      expect(game._canDrawPixel(midX - 1, 50)).toBe(true);
      expect(game._canDrawPixel(midX + 1, 50)).toBe(true);
      expect(game._canDrawPixel(10, game.height - 2)).toBe(true);
    });

    it('with opts.excludeButton: true, returns false in restart-button region, true elsewhere when not on court', () => {
      const game = createPongForTest();
      const centerY = Math.floor(game.height / 2);
      // Implementation: px > width - BUTTON_PADDING and py strictly in (centerY - BUTTON_PADDING_V, centerY + BUTTON_PADDING_V)
      const inBtnX = game.width - BUTTON_PADDING + 1;
      expect(game._canDrawPixel(inBtnX, centerY, { excludeButton: true })).toBe(false);
      expect(game._canDrawPixel(inBtnX, centerY - 1, { excludeButton: true })).toBe(false);
      // Boundaries are exclusive in implementation: centerY ± BUTTON_PADDING_V return true
      expect(game._canDrawPixel(inBtnX, centerY - BUTTON_PADDING_V, { excludeButton: true })).toBe(true);
      expect(game._canDrawPixel(inBtnX, centerY + BUTTON_PADDING_V, { excludeButton: true })).toBe(true);
      // Outside button: left side
      expect(game._canDrawPixel(50, centerY, { excludeButton: true })).toBe(true);
      // Outside vertical band
      expect(game._canDrawPixel(inBtnX, centerY - BUTTON_PADDING_V - 1, { excludeButton: true })).toBe(true);
      expect(game._canDrawPixel(inBtnX, centerY + BUTTON_PADDING_V + 1, { excludeButton: true })).toBe(true);
    });

    it('with opts.excludeButton: false or omitted, does not exclude button region', () => {
      const game = createPongForTest();
      const centerY = Math.floor(game.height / 2);
      const inBtnX = game.width - BUTTON_PADDING + 1;
      expect(game._canDrawPixel(inBtnX, centerY)).toBe(true);
      expect(game._canDrawPixel(inBtnX, centerY, { excludeButton: false })).toBe(true);
      expect(game._canDrawPixel(inBtnX, centerY - 1)).toBe(true);
      expect(game._canDrawPixel(inBtnX, centerY, {})).toBe(true);
    });
  });

  describe('maintainCourt', () => {
    it('draws dashed center line at midX (y=0,2,4,...), top border at y=0, bottom at y=height-1', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      const h = game.height;
      display.clear();
      game.maintainCourt();
      expect(display.getPixel(midX, 0)).toBe(true);
      expect(display.getPixel(midX, 2)).toBe(true);
      expect(display.getPixel(midX, 4)).toBe(true);
      expect(display.getPixel(0, 0)).toBe(true);
      expect(display.getPixel(midX, h - 1)).toBe(true);
    });

    it('draws score digits at (2,2) and (width-7,2)', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.maintainCourt();
      expect(display.getPixel(2, 2)).toBe(true);
      expect(display.getPixel(game.width - 7, 2)).toBe(true);
    });
  });

  describe('drawFrame', () => {
    it('with blinking false, draws outline and does not draw on court pixels when frame overlaps midline', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.drawFrame(midX - 2, 2, 6, false);
      expect(display.getPixel(midX - 1, 2)).toBe(true);
      expect(display.getPixel(midX, 2)).toBe(false);
    });

    it('with blinking false, draws 6x6 outline at (2,2) with corners and edges on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawFrame(2, 2, 6, false);
      expect(display.getPixel(2, 2)).toBe(true);
      expect(display.getPixel(7, 2)).toBe(true);
      expect(display.getPixel(2, 7)).toBe(true);
      expect(display.getPixel(7, 7)).toBe(true);
    });
  });

  describe('drawRestartArrow', () => {
    it('sets restartButtonBounds and draws at least one pixel in the button region', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawRestartArrow();
      expect(game.restartButtonBounds).toBeTruthy();
      expect(game.restartButtonBounds.width).toBe(20);
      expect(game.restartButtonBounds.height).toBe(20);
      const { x: bx, y: by, width: bw, height: bh } = game.restartButtonBounds;
      const region = display.getPixelRegion(bx, by, bw, bh);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawEmojiFace', () => {
    it('draws smiley at (10,10) with known 7x7 pattern', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawEmojiFace(10, 10, 'smiley');
      const result = display.toASCII(10, 10, 7, 7);
      const expected = '.#####.\n#.....#\n#.#.#.#\n#.....#\n#.#.#.#\n#..#..#\n.##.##.';
      expect(result).toBe(expected);
    });

    it('draws frowny at (5,5) with distinct pattern', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawEmojiFace(5, 5, 'frowny');
      expect(display.getPixel(8, 5)).toBe(true);
      expect(display.getPixel(8, 11)).toBe(true);
    });
  });

  describe('drawCountdown', () => {
    it('with countdownNumber=3, countdownStartTime=0, display.setTime(100), leaves countdownNumber 3 and draws a 3', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      display.setTime(100);
      game.countdownNumber = 3;
      game.countdownStartTime = 0;
      game.drawCountdown();
      expect(game.countdownNumber).toBe(3);
      const midX = Math.floor(game.width / 2);
      const midY = Math.floor(game.height / 2);
      const region = display.getPixelRegion(midX - 5, midY - 5, 12, 14);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });

    it('with countdownStartTime=0, display.setTime(800), decrements countdownNumber to 2', () => {
      const game = createPongForTest();
      const display = game.display;
      display.setTime(800);
      game.countdownNumber = 3;
      game.countdownStartTime = 0;
      game.drawCountdown();
      expect(game.countdownNumber).toBe(2);
    });
  });

  describe('drawNumber', () => {
    it('draws digit 5 at (0,0) with correct pattern', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawNumber(0, 0, 5);
      const result = display.toASCII(0, 0, 5, 7);
      expect(result).toBe('#####\n#....\n#....\n#####\n....#\n....#\n#####');
    });
  });

  describe('drawPauseButton', () => {
    it('draws two bars near center; at least one pixel in center region is on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawPauseButton();
      const midX = Math.floor(game.width / 2);
      const midY = Math.floor(game.height / 2);
      const region = display.getPixelRegion(midX - 6, midY - 8, 14, 16);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawCurrentFrame', () => {
    it('draws paddles and ball', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawCurrentFrame(1);
      expect(display.getPixel(game.PADDLE_LEFT_X, game.leftPaddle.y)).toBe(true);
      expect(display.getPixel(game.PADDLE_RIGHT_X, game.rightPaddle.y)).toBe(true);
      expect(display.getPixel(Math.floor(game.ball.x), Math.floor(game.ball.y))).toBe(true);
    });
  });

  describe('drawStartArrow', () => {
    it('sets startButtonBounds and draws at least one pixel in the play triangle', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawStartArrow();
      expect(game.startButtonBounds).toBeTruthy();
      const { x: bx, y: by, width: bw, height: bh } = game.startButtonBounds;
      const region = display.getPixelRegion(bx, by, bw, bh);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawBouncingPongTitle', () => {
    it('draws PONG and at least one pixel in the title region is on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawBouncingPongTitle();
      const region = display.getPixelRegion(20, 50, 60, 25);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawPlayer1Frame', () => {
    it('draws 1P (frame and/or digit P); at least one pixel in 1P region is on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawPlayer1Frame();
      const region = display.getPixelRegion(game.player1FrameX, game.player1FrameY, 20, 20);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawPlayer2Frame', () => {
    it('draws 2P or digit; at least one pixel in the frame content region is on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawPlayer2Frame();
      const region = display.getPixelRegion(game.player2FrameX, game.player2FrameY, 20, 20);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawGameOverMessage', () => {
    it('draws message; with winner=left and WINNER!, some pixel in message region is on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.gameOverStartTime = 0;
      game.winner = 'left';
      game.winning = false;
      game.rightPlayerOption = 1;
      game.gameOverViaDebugKey = false;
      game.drawGameOverMessage();
      const midX = Math.floor(game.width / 2);
      const region = display.getPixelRegion(midX - 40, 25, 80, 30);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('drawSmallTriangle', () => {
    it('draws filled up triangle at (50,60); center pixel and edges on', () => {
      const game = createPongForTest();
      const display = game.display;
      display.clear();
      game.drawSmallTriangle(50, 60, 'up', true);
      const region = display.getPixelRegion(46, 55, 10, 8);
      expect(region.some(row => row.some(Boolean))).toBe(true);
    });
  });

  describe('layering: court pixels stay on after overlay draws', () => {
    it('maintainCourt then drawFrame overlapping midline: court (midX,2) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.maintainCourt();
      game.drawFrame(midX - 2, 2, 6, false);
      expect(display.getPixel(midX, 2)).toBe(true);
    });

    it('maintainCourt then drawRestartArrow: court (midX,0) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.maintainCourt();
      game.drawRestartArrow();
      expect(display.getPixel(midX, 0)).toBe(true);
    });

    it('maintainCourt then drawEmojiFace: court (midX,2) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.maintainCourt();
      game.drawEmojiFace(10, 10, 'smiley');
      expect(display.getPixel(midX, 2)).toBe(true);
    });

    it('maintainCourt then drawGameOverMessage: court (midX,2) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.gameOverStartTime = 0;
      game.winner = 'left';
      game.maintainCourt();
      game.drawGameOverMessage();
      expect(display.getPixel(midX, 2)).toBe(true);
    });

    it('maintainCourt then drawCountdown: court (midX,0) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      display.setTime(100);
      game.countdownStartTime = 0;
      game.countdownNumber = 3;
      game.maintainCourt();
      game.drawCountdown();
      expect(display.getPixel(midX, 0)).toBe(true);
    });

    it('maintainCourt then drawPauseButton: court (midX,0) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.maintainCourt();
      game.drawPauseButton();
      expect(display.getPixel(midX, 0)).toBe(true);
    });

    it('maintainCourt then drawCurrentFrame: court (midX,2) still on', () => {
      const game = createPongForTest();
      const display = game.display;
      const midX = Math.floor(game.width / 2);
      display.clear();
      game.maintainCourt();
      game.drawCurrentFrame(1);
      expect(display.getPixel(midX, 2)).toBe(true);
    });
  });

  describe('checkGameEnd', () => {
    it('sets winner=left and gameState=GAME_OVER when score.left >= GOALS_TO_WIN', () => {
      const game = createPongForTest();
      game.gameState = 'PLAYING';
      game.score.left = GOALS_TO_WIN;
      game.score.right = 0;
      game.checkGameEnd();
      expect(game.winner).toBe('left');
      expect(game.gameState).toBe('GAME_OVER');
    });

    it('sets winner=right and gameState=GAME_OVER when score.right >= GOALS_TO_WIN', () => {
      const game = createPongForTest();
      game.gameState = 'PLAYING';
      game.score.left = 0;
      game.score.right = GOALS_TO_WIN;
      game.checkGameEnd();
      expect(game.winner).toBe('right');
      expect(game.gameState).toBe('GAME_OVER');
    });

    it('does not change state when both scores are below GOALS_TO_WIN', () => {
      const game = createPongForTest();
      game.gameState = 'PLAYING';
      game.score.left = GOALS_TO_WIN - 1;
      game.score.right = GOALS_TO_WIN - 1;
      game.checkGameEnd();
      expect(game.winner).toBe(null);
      expect(game.gameState).toBe('PLAYING');
    });
  });

  describe('checkPaddleCollision', () => {
    it('returns true and changes ball vx/vy when ball is inside left paddle and moving toward it', () => {
      const game = createPongForTest();
      game.ball.x = game.leftPaddle.x + 1;
      game.ball.y = game.leftPaddle.y + game.leftPaddle.height / 2;
      game.ball.vx = -2;
      game.ball.vy = 0;
      const out = game.checkPaddleCollision(game.leftPaddle);
      expect(out).toBe(true);
      expect(game.ball.vx).toBeGreaterThan(0); // reversed
      expect(Math.abs(game.ball.vy)).toBeLessThanOrEqual(1.0 * 0.8 * 2); // |angle|<=1, BALL_SPEED*0.8 * speedMultiplier
    });

    it('returns false when ball is outside paddle y range', () => {
      const game = createPongForTest();
      game.ball.x = game.leftPaddle.x + 1;
      game.ball.y = game.leftPaddle.y - 2;
      game.ball.vx = -1;
      const out = game.checkPaddleCollision(game.leftPaddle);
      expect(out).toBe(false);
    });

    it('returns false when ball is outside paddle x range', () => {
      const game = createPongForTest();
      game.ball.x = game.leftPaddle.x + game.leftPaddle.width + 2;
      game.ball.y = game.leftPaddle.y + 1;
      game.ball.vx = -1;
      const out = game.checkPaddleCollision(game.leftPaddle);
      expect(out).toBe(false);
    });
  });

  describe('resetBall', () => {
    it('places ball at center and sets non-zero vx and vy', () => {
      const game = createPongForTest();
      game.ball.x = 10;
      game.ball.y = 20;
      game.ball.vx = 0;
      game.ball.vy = 0;
      game.resetBall();
      expect(game.ball.x).toBe(Math.floor(game.width / 2));
      expect(game.ball.y).toBe(Math.floor(game.height / 2));
      expect(game.ball.vx).not.toBe(0);
      expect(game.ball.vy).not.toBe(0);
    });
  });
});
