/**
 * Pong game logic unit tests. Uses a test PixelDisplay; no DOM.
 */
import { describe, it, expect } from 'vitest';
import { createDisplayForTest } from './pixel-display-test-utils.js';
import { Pong } from '../src/pong.js';
import { GOALS_TO_WIN } from '../src/constants.js';

function createPongForTest() {
  const display = createDisplayForTest({ emulatedWidth: 160, emulatedHeight: 120 });
  return new Pong(display);
}

describe('Pong', () => {
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
