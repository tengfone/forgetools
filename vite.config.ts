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
    root: resolve(__dirname, 'src'),
    base: './',
    // Keep Tauri's Rust errors visible in the terminal.
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    // .env.<mode> files live at the repo root, not in `root` (src).
    envDir: __dirname,
    // Single source of truth for the version (tauri.conf.json reads package.json too).
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      // Fixed port: tauri.conf.json devUrl points here.
      port: 5173,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
      fs: {
        allow: ['..'],
      },
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
          propertyReadSideEffects: false,
        },
        output: {
          // No manualChunks: a catch-all 'vendor' chunk made the entry import every library
          // (graphql, hash-wasm, js-beautify, DOMPurify...) at startup. Letting Rollup split
          // along the lazy tool imports keeps each library with the tool that needs it.
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          compact: isProd,
        },
        external: [],
      },
      minify: isProd ? 'terser' : false,
      terserOptions: isProd
        ? {
            compress: {
              // Strip chatty logs only; console.error/warn stay so production failures remain diagnosable.
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug'],
              passes: 3,
              // Workaround: reduce_funcs with passes>1 dropped the esbuild __reExport(...) call in
              // Monaco <=0.52's prebuilt language contributions ("Emitter is not a constructor").
              // monaco-editor 0.57 ships without __reExport, so this is probably no longer needed,
              // but it can only be verified at runtime (open an editor tool in a release build).
              // Costs ~7 KB; remove after that check.
              reduce_funcs: false,
              dead_code: true,
              unused: true,
            },
            format: {
              comments: false,
              ecma: 2020,
              safari10: true,
            },
            mangle: {
              safari10: true,
            },
          }
        : undefined,
      // Monaco is one lazily loaded chunk (editor core can't be split further): 0.57's core alone is
      // ~2.8 MB, ~3.2 MB with the curated features in monaco.ts. Every other chunk stays under 1 MB.
      chunkSizeWarningLimit: 3300,
      reportCompressedSize: false, // Faster builds
      emptyOutDir: true,
    },
  };
});
