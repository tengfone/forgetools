// Structural JSON diff.
import { IDENT } from './shared';

export interface DiffEntry {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  from?: unknown;
  to?: unknown;
}

const keyPath = (base: string, k: string | number): string =>
  typeof k === 'number' ? `${base}[${k}]` : IDENT.test(k) ? `${base}.${k}` : `${base}[${JSON.stringify(k)}]`;

export function jsonDiff(a: unknown, b: unknown, path = '$', out: DiffEntry[] = []): DiffEntry[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length) out.push({ path: keyPath(path, i), kind: 'added', to: b[i] });
      else if (i >= b.length) out.push({ path: keyPath(path, i), kind: 'removed', from: a[i] });
      else jsonDiff(a[i], b[i], keyPath(path, i), out);
    }
  } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>,
      bo = b as Record<string, unknown>;
    for (const k of Object.keys(ao)) {
      if (!(k in bo)) out.push({ path: keyPath(path, k), kind: 'removed', from: ao[k] });
      else jsonDiff(ao[k], bo[k], keyPath(path, k), out);
    }
    for (const k of Object.keys(bo)) if (!(k in ao)) out.push({ path: keyPath(path, k), kind: 'added', to: bo[k] });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, kind: 'changed', from: a, to: b });
  }
  return out;
}

export function formatJsonDiff(entries: DiffEntry[]): string {
  if (!entries.length) return 'No differences: the documents are structurally equal.';
  const j = (v: unknown): string => JSON.stringify(v);
  return entries
    .map((e) =>
      e.kind === 'added'
        ? `+ ${e.path}: ${j(e.to)}`
        : e.kind === 'removed'
          ? `- ${e.path}: ${j(e.from)}`
          : `~ ${e.path}: ${j(e.from)} → ${j(e.to)}`,
    )
    .join('\n');
}
