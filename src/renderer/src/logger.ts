/**
 * Production-safe logger utility
 * Only logs in development mode, removed in production builds via terser
 */

const isDev = import.meta.env.DEV || !import.meta.env.PROD;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    // Always log errors, even in production, but they'll be removed by terser
    console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  }
};

