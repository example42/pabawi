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
      // Plugin frontend aliases - allows importing plugin widgets
      '@plugins/native': path.resolve(__dirname, '..', 'plugins', 'native'),
      '@plugins/external': path.resolve(__dirname, '..', 'plugins', 'external'),
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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Include plugin frontend directories in the build
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    }
  },
  // Set public directory to serve static assets
  publicDir: 'public',
  // Optimize dependencies - include plugin frontend code
  optimizeDeps: {
    include: [],
    // Allow scanning plugin directories for dependencies
    entries: [
      'src/**/*.svelte',
      'src/**/*.ts',
      '../plugins/native/*/frontend/**/*.svelte',
      '../plugins/native/*/frontend/**/*.ts',
    ]
  }
});
