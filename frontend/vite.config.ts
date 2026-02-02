import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      // Plugin SDK alias - allows plugins to import from '@pabawi/plugin-sdk'
      // This works for both native plugins (bundled) and external plugins (when built with Pabawi's config)
      '@pabawi/plugin-sdk': path.resolve(__dirname, 'src/lib/plugins/sdk/index.ts'),
      // Convenience aliases for internal use
      '$lib': path.resolve(__dirname, 'src/lib'),
      '$components': path.resolve(__dirname, 'src/components'),
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000
  },
  // Set public directory to serve static assets
  publicDir: 'public'
});
