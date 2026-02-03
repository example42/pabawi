import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

/**
 * Vite Configuration for Pabawi Frontend
 *
 * This configuration supports:
 * - Native plugins from plugins/native/
 * - External plugins from plugins/external/
 * - Dynamic widget loading via lazy imports
 * - Path aliases for clean imports
 *
 * Environment Variables:
 * - PABAWI_NATIVE_PLUGINS_PATH: Override native plugins directory
 * - PABAWI_EXTERNAL_PLUGINS_PATH: Override external plugins directory
 */

// Get plugin paths from environment or use defaults
const nativePluginsPath = process.env.PABAWI_NATIVE_PLUGINS_PATH
  ? path.resolve(process.env.PABAWI_NATIVE_PLUGINS_PATH)
  : path.resolve(__dirname, '..', 'plugins', 'native');

const externalPluginsPath = process.env.PABAWI_EXTERNAL_PLUGINS_PATH
  ? path.resolve(process.env.PABAWI_EXTERNAL_PLUGINS_PATH)
  : path.resolve(__dirname, '..', 'plugins', 'external');

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
      // These use the environment-configurable paths
      '@plugins/native': nativePluginsPath,
      '@plugins/external': externalPluginsPath,
      // Legacy aliases for backward compatibility
      '@plugins': path.resolve(__dirname, '..', 'plugins'),
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
      output: {
        // Manual chunks for better code splitting
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('svelte')) return 'vendor-svelte';
            if (id.includes('chart.js') || id.includes('chartjs')) return 'vendor-charts';
            return 'vendor';
          }
          // Plugin chunks - each plugin gets its own chunk
          if (id.includes('/plugins/native/bolt/')) return 'plugin-bolt';
          if (id.includes('/plugins/native/puppetdb/')) return 'plugin-puppetdb';
          if (id.includes('/plugins/native/puppetserver/')) return 'plugin-puppetserver';
          if (id.includes('/plugins/native/hiera/')) return 'plugin-hiera';
          // External plugins get their own chunks
          if (id.includes('/plugins/external/')) {
            const match = id.match(/\/plugins\/external\/([^/]+)\//);
            if (match) return `plugin-external-${match[1]}`;
          }
          return undefined;
        },
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
      `${nativePluginsPath}/*/frontend/**/*.svelte`,
      `${nativePluginsPath}/*/frontend/**/*.ts`,
      `${externalPluginsPath}/*/frontend/**/*.svelte`,
      `${externalPluginsPath}/*/frontend/**/*.ts`,
    ]
  }
});
