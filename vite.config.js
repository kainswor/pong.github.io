import { defineConfig } from 'vite';

const debugScreens = process.env.DISABLE_DEBUG !== '1' && process.env.DISABLE_DEBUG !== 'true';

/** Trigger full reload when index.html changes (e.g. after build-gh-pages overwrites it). */
function fullReloadOnIndexHtml() {
  return {
    name: 'full-reload-on-index-html',
    configureServer(server) {
      server.watcher.on('change', (path) => {
        if (path.endsWith('index.html')) {
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      });
    }
  };
}

export default defineConfig({
  define: {
    __DEBUG_SCREENS_ENABLED__: debugScreens
  },
  plugins: [fullReloadOnIndexHtml()],
  // Development server configuration
  server: {
    port: 5173,
    open: true
  },
  
  // Vitest and coverage
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'node_modules',
        'tests',
        '**/*.test.js',
        '**/pixel-display-test-utils.js',
        'scripts'
      ],
      reportsDirectory: './coverage',
      reporter: ['text', 'text-summary', 'html'],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 66,
        statements: 50
      }
    }
  },

  // Production build configuration
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Generate source maps for debugging production issues
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunking strategy for better caching
        manualChunks: {
          'vendor': ['./src/pixel-display.js'],
          'game': ['./src/pong.js', './src/sprites.js']
        }
      }
    }
  },
  
  // Base path for assets (adjust if deploying to subdirectory)
  base: './'
});
