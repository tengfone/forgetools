// Runs text diffs off the main thread: a pathological pair (e.g. 50k `a`s vs 50k `b`s in character
// mode) has a huge edit distance, and computing it must never freeze the window.
import { diffLines, diffWords, diffChars } from 'diff';

interface Req {
  seq: number;
  mode: string;
  original: string;
  compared: string;
  ignoreCase: boolean;
  timeout: number;
}

self.onmessage = (e: MessageEvent<Req>): void => {
  const { seq, mode, original, compared, ignoreCase, timeout } = e.data;
  try {
    // With `timeout`, jsdiff gives up and returns undefined instead of running unbounded.
    const opts = { ignoreCase, timeout };
    const parts =
      mode === 'line'
        ? diffLines(original, compared, opts)
        : mode === 'word'
          ? diffWords(original, compared, opts)
          : diffChars(original, compared, opts);
    if (!parts) {
      self.postMessage({ seq, error: 'These texts are too different to compare in this mode; try Line by Line' });
      return;
    }
    self.postMessage({
      seq,
      parts: parts.map((p) => ({ value: p.value, added: !!p.added, removed: !!p.removed })),
    });
  } catch (err) {
    self.postMessage({ seq, error: err instanceof Error ? err.message : String(err) });
  }
};
