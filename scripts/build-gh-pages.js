#!/usr/bin/env node

/**
 * Build script for GitHub Pages inline HTML
 * 
 * Generates a single-file HTML with all JavaScript inlined
 * for GitHub Pages deployment (no build step required on GH Pages)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`[${step}/5]`, 'blue');
  log(` ${message}`, 'dim');
}

try {
  log('\n🚀 Building GitHub Pages inline HTML...\n', 'green');

  // Step 1: Read source files
  logStep(1, 'Reading source files...');
  const pixelDisplayJs = readFileSync(join(rootDir, 'src/pixel-display.js'), 'utf-8');
  const spritesJs = readFileSync(join(rootDir, 'src/sprites.js'), 'utf-8');
  const pongJs = readFileSync(join(rootDir, 'src/pong.js'), 'utf-8');

  // Step 2: Process JavaScript (remove import/export statements)
  logStep(2, 'Processing JavaScript modules...');
  
  // Remove export statements from pixel-display.js
  const pixelDisplayProcessed = pixelDisplayJs
    .replace(/^export\s+/gm, '')
    .trim();

  // Remove export statements from sprites.js
  const spritesProcessed = spritesJs
    .replace(/^export\s+/gm, '')
    .trim();

  // Remove import statements from pong.js
  const pongProcessed = pongJs
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
    .trim();

  // Step 3: Combine JavaScript
  logStep(3, 'Combining JavaScript into single bundle...');
  const combinedJs = `${pixelDisplayProcessed}\n\n${spritesProcessed}\n\n${pongProcessed}`;

  // Step 4: Generate HTML
  logStep(4, 'Generating HTML template...');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pong - Retro CRT Game</title>
  <meta name="description" content="Classic Pong game with retro CRT pixel display effects">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #000;
      font-family: monospace;
    }
    
    #display {
      display: block;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <canvas id="display"></canvas>
  <script>
${combinedJs}
  </script>
</body>
</html>`;

  // Step 5: Write output file
  logStep(5, 'Writing index.html...');
  writeFileSync(join(rootDir, 'index.html'), html, 'utf-8');

  // Success summary
  const stats = {
    pixelDisplay: (pixelDisplayProcessed.length / 1024).toFixed(1),
    sprites: (spritesProcessed.length / 1024).toFixed(1),
    pong: (pongProcessed.length / 1024).toFixed(1),
    total: (html.length / 1024).toFixed(1)
  };

  log('\n✓ Build complete!', 'green');
  log(`\n  File sizes:`, 'dim');
  log(`    pixel-display.js: ${stats.pixelDisplay} KB`, 'dim');
  log(`    sprites.js:       ${stats.sprites} KB`, 'dim');
  log(`    pong.js:          ${stats.pong} KB`, 'dim');
  log(`    ─────────────────────────────`, 'dim');
  log(`    index.html:       ${stats.total} KB\n`, 'yellow');

  log(`  Output: ${join(rootDir, 'index.html')}\n`, 'dim');

} catch (error) {
  log('\n✗ Build failed:', 'yellow');
  log(`  ${error.message}\n`, 'dim');
  process.exit(1);
}
