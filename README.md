# Retro Pixel Display Library

A JavaScript library that emulates a retro CRT-style pixel display for games. Features configurable resolution, visible pixel separation, and authentic CRT fade effects.

## Features

- **Retro CRT Display**: Emulates a classic monochrome CRT monitor with retro green color (`#39ff14`)
- **Pixel Separation**: Visible 1px gaps between pixels for authentic retro look
- **CRT Fade Effects**: 
  - Quick fade-in (0.05s) when pixels turn ON
  - Exponential fade-out (~0.2s) when pixels turn OFF
- **Configurable Resolution**: Separate emulated resolution (default: 300x200) and display size (default: 800x600)
- **Two-State Pixels**: Simple ON/OFF states (no color variations)

## Installation

```bash
npm install
```

## Development

Start the development server with auto-reload:

```bash
npm run dev
```

The demo will open in your browser at `http://localhost:5173`. The page will automatically reload when you make changes to the code.

## Usage

### Basic Example

```javascript
import { PixelDisplay } from './src/pixel-display.js';

// Get canvas element
const canvas = document.getElementById('display');

// Create display instance
// Parameters: canvas, emulatedWidth, emulatedHeight, displayWidth, displayHeight
const display = new PixelDisplay(canvas, 300, 200, 800, 600);

// Set a pixel to ON
display.setPixel(150, 100, true);

// Start the render loop
display.start();
```

### API Reference

#### Constructor

```javascript
new PixelDisplay(canvas, emulatedWidth, emulatedHeight, displayWidth, displayHeight)
```

- `canvas` (HTMLElement): The canvas element to render to
- `emulatedWidth` (number, default: 300): Horizontal pixel count
- `emulatedHeight` (number, default: 200): Vertical pixel count
- `displayWidth` (number, default: 800): Actual canvas width in pixels
- `displayHeight` (number, default: 600): Actual canvas height in pixels

#### Methods

- `setPixel(x, y, state)` - Set a pixel's state (true = ON, false = OFF)
- `getPixel(x, y)` - Get a pixel's current state
- `clear()` - Clear all pixels (set all to OFF)
- `start()` - Start the render loop
- `stop()` - Stop the render loop

### Demo

The included demo (`src/demo.js`) demonstrates:
- Creating a PixelDisplay instance
- Moving a pixel with arrow keys
- Natural fade effects when the pixel moves

Use the arrow keys (↑↓←→) to move the pixel around the screen.

## Technical Details

- **Rendering**: Uses HTML5 Canvas with `requestAnimationFrame` for smooth 60fps rendering
- **Fade Effects**: 
  - Fade-in: Linear interpolation over 50ms
  - Fade-out: Exponential decay over 200ms using `e^(-t/τ)`
- **Performance**: Optimized for real-time rendering with efficient pixel state tracking

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## License

MIT
