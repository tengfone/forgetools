import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';
import fsExtra from 'fs-extra';

// Tauri dev host (set by 	auri dev for mobile/remote targets); falls back to localhost.
const host = process.env.TAURI_DEV_HOST;
function isNeededMonacoFile(src: string): boolean {
  const p = src.replace(/\\/g, '/');
  // Keep *Mode.js (jsonMode provides JSON tokenization); drop the heavy *Worker.js.
  if (/\/vs\/language\/[^/]+\/\w+Worker\.js$/.test(p)) return false;
  if (/\/vs\/base\/worker(\/|$)/.test(p)) return false;
  if (/\/vs\/base\/common\/worker(\/|$)/.test(p)) return false;
  if (/\.nls\.[a-z-]+\.js$/.test(p)) return false;
  return true;
}

// Plugin to copy Monaco Editor files to build output
function copyMonacoFiles(): Plugin {
  return {
    name: 'copy-monaco-files',
    closeBundle() {
      // Copy Monaco files from src/renderer/vs to out/renderer/vs after build
      const sourcePath = resolve(__dirname, 'src/renderer/vs');
      const targetPath = resolve(__dirname, 'out/renderer/vs');
      
      if (existsSync(sourcePath)) {
        try {
          fsExtra.copySync(sourcePath, targetPath, { overwrite: true, filter: isNeededMonacoFile });
          console.log('Monaco Editor files copied to build output');
        } catch (error) {
          console.error('Failed to copy Monaco files:', error);
        }
      }
    }
  };
}

// Plugin to suppress Monaco Editor source map warnings and handle loader script
function suppressMonacoSourceMapWarnings(): Plugin {
  return {
    name: 'suppress-monaco-sourcemap-warnings',
    configureServer(server) {
      // Override the logger to filter out Monaco source map warnings
      const originalWarn = server.config.logger.warn;
      server.config.logger.warn = (msg, options) => {
        if (typeof msg === 'string' && (
          msg.includes('Failed to load source map') ||
          msg.includes('min-maps') ||
          msg.includes('/vs/') ||
          msg.includes('ENOENT') ||
          msg.includes("can't be bundled without type=\"module\"")
        )) {
          return; // Suppress these warnings
        }
        return originalWarn(msg, options);
      };
      
      // Also intercept error logs
      const originalError = server.config.logger.error;
      server.config.logger.error = (msg, options) => {
        if (typeof msg === 'string' && (
          msg.includes('Failed to load source map') ||
          msg.includes('min-maps') ||
          msg.includes('/vs/') ||
          msg.includes('ENOENT')
        )) {
          return; // Suppress these errors
        }
        return originalError(msg, options);
      };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Mark Monaco loader script as ignored by Vite
        // This prevents Vite from trying to bundle it as a module
        return html.replace(
          /<script src="\/vs\/loader\.js"><\/script>/,
          '<script src="/vs/loader.js" type="text/javascript"></script>'
        );
      }
    },
    buildStart() {
      // Suppress warnings during build
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        const msg = args[0]?.toString() || '';
        if (msg.includes("can't be bundled without type=\"module\"")) {
          return; // Suppress this specific warning
        }
        return originalWarn.apply(console, args);
      };
    }
  };
}


export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  // Keep Tauri's Rust errors visible in the terminal.
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // .env.<mode> files live at the repo root, not in `root` (src/renderer).
  envDir: __dirname,
  plugins: [copyMonacoFiles(), suppressMonacoSourceMapWarnings()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  server: {
    // Fixed port: tauri.conf.json devUrl points here.
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    fs: {
      allow: ['..']
    }
  },
  build: {
    // Same output folder electron-vite used; tauri.conf.json frontendDist points here.
    outDir: resolve(__dirname, 'out/renderer'),
    // Disable source maps in production for smaller bundle size
    sourcemap: process.env.NODE_ENV === 'production' ? false : true,
    // Enable CSS code splitting and minification
    cssCodeSplit: true,
    cssMinify: process.env.NODE_ENV === 'production',
    // Optimize asset handling
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    // Target modern browsers for better optimization
    target: 'esnext',
    rollupOptions: {
      // Enable tree-shaking
      treeshake: {
        moduleSideEffects: true, // app relies on side-effect imports (./tools, ./monacoEnv)
        preset: 'smallest',
        propertyReadSideEffects: false
      },
      output: {
        // No manualChunks: a catch-all 'vendor' chunk made the entry import every library
        // (graphql, hash-wasm, js-beautify, DOMPurify...) at startup. Letting Rollup split
        // along the lazy tool imports keeps each library with the tool that needs it.
        // Optimize chunk size
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Optimize chunk size limits
        compact: process.env.NODE_ENV === 'production'
      },
      // Externalize dependencies that are already in preload
      external: []
    },
    minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
    terserOptions: process.env.NODE_ENV === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 3, // More passes for better compression
        dead_code: true,
        unused: true
      },
      format: {
        comments: false,
        ecma: 2020,
        safari10: true
      },
      mangle: {
        safari10: true
      }
    } : undefined,
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Additional optimizations
    reportCompressedSize: false, // Faster builds
    emptyOutDir: true
  }
});