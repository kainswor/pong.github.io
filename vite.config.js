import { defineConfig } from 'vite';

export default defineConfig({
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
