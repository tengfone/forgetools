import { defineConfig } from 'vite';
import { resolve } from 'path';
import pkg from './package.json';

// Tauri dev host (set by `tauri dev` for mobile/remote targets); falls back to localhost.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ command }) => {
  // `vite build` (and `vite build --mode wdio`) is the shipped/tested bundle: no maps, minified.
  // `vite` / `tauri dev` (command 'serve') keeps maps and readable output.
  const isProd = command === 'build';
  return {
    root: resolve(__dirname, 'src/renderer'),
    base: './',
    // Keep Tauri's Rust errors visible in the terminal.
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    // .env.<mode> files live at the repo root, not in `root` (src/renderer).
    envDir: __dirname,
    // Single source of truth for the version (tauri.conf.json reads package.json too).
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
      // Frontend output folder; tauri.conf.json frontendDist points here.
      outDir: resolve(__dirname, 'out/renderer'),
      // No source maps in shipped builds
      sourcemap: !isProd,
      cssCodeSplit: true,
      cssMinify: isProd,
      assetsInlineLimit: 4096, // Inline assets smaller than 4kb
      target: 'esnext',
      rollupOptions: {
        treeshake: {
          moduleSideEffects: true, // app relies on side-effect imports (./tools, ./monacoEnv)
          preset: 'smallest',
          propertyReadSideEffects: false
        },
        output: {
          // No manualChunks: a catch-all 'vendor' chunk made the entry import every library
          // (graphql, hash-wasm, js-beautify, DOMPurify...) at startup. Letting Rollup split
          // along the lazy tool imports keeps each library with the tool that needs it.
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          compact: isProd
        },
        external: []
      },
      minify: isProd ? 'terser' : false,
      terserOptions: isProd ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          passes: 3,
          // reduce_funcs with passes>1 drops the esbuild __reExport(...) call in Monaco's prebuilt
          // language contributions (monaco_editor_core_exports stays {} -> "Emitter is not a
          // constructor"). Costs ~7 KB.
          reduce_funcs: false,
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
      // Monaco is one lazily loaded ~2.9 MB chunk (editor core can't be split further); every
      // other chunk stays well under 1 MB.
      chunkSizeWarningLimit: 3000,
      reportCompressedSize: false, // Faster builds
      emptyOutDir: true
    }
  };
});
