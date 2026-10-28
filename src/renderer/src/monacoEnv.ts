// Monaco environment bootstrap. Imported first by app.ts so index.html needs no inline script
// (lets the CSP drop 'unsafe-inline' for scripts). Must run before vs/editor/editor.main loads.

const isDev = window.location.protocol === 'http:';
window.monacoPath = isDev ? '/vs' : './vs';

// Mock Worker: satisfies Monaco's interface but does nothing; language features fall back
// to main-thread behaviour. Prevents 'define is not defined' / worker postMessage errors.
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
