import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import type { Plugin } from 'vite';
import { existsSync } from 'fs';
import fsExtra from 'fs-extra';

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
          fsExtra.copySync(sourcePath, targetPath, { overwrite: true });
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
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      sourcemap: false, // Disable source maps in production
      minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
      terserOptions: process.env.NODE_ENV === 'production' ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2
        },
        format: {
          comments: false
        }
      } : undefined,
      rollupOptions: {
        external: ['@zxing/library', 'qrcode', 'jsbarcode', 'xmldom']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      sourcemap: false, // Disable source maps in production
      minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
      terserOptions: process.env.NODE_ENV === 'production' ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2
        },
        format: {
          comments: false
        }
      } : undefined,
      rollupOptions: {
        external: [
          'js-beautify',
          'jwt-decode',
          'js-yaml',
          'jsbarcode',
          'papaparse',
          'marked',
          'color-convert',
          'qrcode',
          'jsrsasign',
          'uuid',
          'ulid',
          'diff',
          'cron-parser',
          'htmltojsx',
          'php-serialize',
          'svgo',
          'sass',
          'less',
          'node-forge',
          'ajv'
        ]
      }
    }
  },
  renderer: {
    plugins: [copyMonacoFiles(), suppressMonacoSourceMapWarnings()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    server: {
      fs: {
        allow: ['..']
      }
    },
    build: {
      // Disable source maps in production for smaller bundle size
      sourcemap: process.env.NODE_ENV === 'production' ? false : true,
      // Enable CSS code splitting and minification
      cssCodeSplit: true,
      cssMinify: process.env.NODE_ENV === 'production',
      // Optimize asset handling
      assetsInlineLimit: 4096, // Inline assets smaller than 4kb
      // Target modern browsers for better optimization
      target: 'esnext',
      // Enable tree-shaking
      treeshake: {
        moduleSideEffects: false,
        preset: 'smallest',
        propertyReadSideEffects: false
      },
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Split Monaco Editor into its own chunk (loaded separately via script tag)
            if (id.includes('monaco-editor') || id.includes('/vs/')) {
              return 'monaco-editor';
            }
            // Split node_modules into vendor chunks for better caching
            if (id.includes('node_modules')) {
              // Keep large dependencies separate for better caching
              if (id.includes('marked')) return 'vendor-marked';
              if (id.includes('js-beautify')) return 'vendor-beautify';
              // Group smaller dependencies together
              return 'vendor';
            }
          },
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
          unsafe: true, // Enable unsafe optimizations
          unsafe_comps: true,
          unsafe_math: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true,
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
  }
});

