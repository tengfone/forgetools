import type { Indent } from '../../types/tools';

const DEFAULT_INDENT = 2;

/** Normalise a formatter indent to a tab or a width clamped to 1–8 spaces. */
export const clampIndent = (indent?: Indent): Indent =>
  indent === '\t'
    ? indent
    : typeof indent === 'number' && Number.isFinite(indent) && indent > 0
      ? Math.min(Math.floor(indent), 8)
      : DEFAULT_INDENT;

/** js-beautify options for one indentation level. */
export const beautifyIndent = (indent?: Indent): { indent_size: number; indent_char?: string } => {
  const i = clampIndent(indent);
  return i === '\t' ? { indent_size: 1, indent_char: '\t' } : { indent_size: i };
};
