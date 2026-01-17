import { PixelDisplay } from './pixel-display.js';

// Initialize the display - coarser grain for more retro look
const canvas = document.getElementById('display');
const display = new PixelDisplay(canvas, 160, 120, 800, 600);

// Cursor position (starts at center)
let cursorX = 80;
let cursorY = 60;
let prevX = 80;
let prevY = 60;

// Track which keys are currently pressed
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};

// Handle keydown events
document.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
  }
});

// Handle keyup events
document.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    e.preventDefault();
    keys[e.key] = false;
  }
});

// Update cursor position based on pressed keys
function updateCursor() {
  let moved = false;
  
  if (keys.ArrowUp && cursorY > 0) {
    cursorY--;
    moved = true;
  }
  if (keys.ArrowDown && cursorY < display.emulatedHeight - 1) {
    cursorY++;
    moved = true;
  }
  if (keys.ArrowLeft && cursorX > 0) {
    cursorX--;
    moved = true;
  }
  if (keys.ArrowRight && cursorX < display.emulatedWidth - 1) {
    cursorX++;
    moved = true;
  }
  
  return moved;
}

// Game loop: update cursor and set pixel
function gameLoop() {
  const moved = updateCursor();
  
  // If cursor moved, turn off previous pixel to trigger fade-out
  if (moved && (prevX !== cursorX || prevY !== cursorY)) {
    display.setPixel(prevX, prevY, false);
    prevX = cursorX;
    prevY = cursorY;
  }
  
  // Set the pixel at cursor position to ON
  display.setPixel(cursorX, cursorY, true);
  
  requestAnimationFrame(gameLoop);
}

// Start the display render loop
display.start();

// Start the game loop
gameLoop();
