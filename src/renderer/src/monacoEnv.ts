// Monaco environment bootstrap. Imported first by app.ts so index.html needs no inline script
// (lets the CSP drop 'unsafe-inline' for scripts). Must run before vs/editor/editor.main loads.

const isDev = window.location.protocol === 'http:';
window.monacoPath = isDev ? '/vs' : './vs';

/**
 * Mock Worker: satisfies Monaco's interface but does nothing.
 *
 * INTENTIONAL TRADE-OFF: because no real worker runs, Monaco's language services are
 * effectively disabled — no JSON/CSS/HTML/TS validation diagnostics, schema completion,
 * hover info, or worker-based formatting. ForgeTools does its own parsing/formatting and
 * reports errors via the status bar + markers, so we skip shipping and booting the
 * (large) language workers to save bundle size and startup/CPU time. Basic tokenisation
 * (syntax colouring) still works on the main thread. Also prevents
 * 'define is not defined' / worker postMessage errors under the AMD loader.
 */
(window as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    const mockWorker = {
      postMessage(_message: unknown) { /* no-op */ },
      terminate() { /* no-op */ },
      addEventListener(_type: string, _listener: unknown, _options?: unknown) { /* no-op */ },
      removeEventListener(_type: string, _listener: unknown, _options?: unknown) { /* no-op */ },
      dispatchEvent(_event: Event) { return true; },
      onmessage: null,
      onmessageerror: null,
      onerror: null
    };
    return Promise.resolve(mockWorker);
  }
};

export {};
