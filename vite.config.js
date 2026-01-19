import { defineConfig } from 'vite';

const debugScreens = process.env.DISABLE_DEBUG !== '1' && process.env.DISABLE_DEBUG !== 'true';

export default defineConfig({
  define: {
    __DEBUG_SCREENS_ENABLED__: debugScreens
  },
  // Development server configuration
  server: {
    port: 5173,
    open: true
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
