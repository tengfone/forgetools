// Monaco runtime glue that must exist before (and independently of) the lazily loaded editor chunk.
// The editor itself lives in ./monaco (dynamic import); this module only holds a typed handle to it
// so other modules (theme) can reach Monaco once loaded without pulling it into the startup bundle.
import type { Monaco } from './monaco';

let instance: Monaco | null = null;

/** The loaded Monaco API, or null before the first editor-based tool opened. */
export const getMonaco = (): Monaco | null => instance;

let loading: Promise<Monaco> | null = null;
/** Load Monaco once (separate chunk). Rejections reset so a later call can retry. */
export function loadMonaco(): Promise<Monaco> {
  loading ??= import('./monaco').then(m => (instance = m.monaco)).catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

// Monaco cancels its own pending work (hover, word highlight, layout) when an editor is disposed
// or re-laid out, rejecting with Error('Canceled'). Monaco treats that as expected; WebKit can
// surface it as an unhandled rejection, so drop exactly that error and nothing else.
window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  const r = ev.reason as { name?: string; message?: string } | null;
  if (r && r.name === 'Canceled' && r.message === 'Canceled') ev.preventDefault();
});
