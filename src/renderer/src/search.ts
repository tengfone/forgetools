// Tool search shared by the command palette and the sidebar filter.
// Ranking per field: prefix > word-start > substring > subsequence (fuzzy).
import type { Tool } from '../../types/tools';

const PREFIX = 100,
  WORD = 70,
  SUB = 50,
  SEQ = 20;

/** Score one string against a lowercase query. 0 = no match. */
export function scoreText(text: string, q: string): number {
  if (!q) return 0;
  const s = text.toLowerCase();
  if (s.startsWith(q)) return PREFIX;
  const i = s.indexOf(q);
  if (i > 0 && /[^a-z0-9]/.test(s[i - 1]!)) return WORD;
  // Word-start acronym/camel boundary, e.g. "rs" -> "Random String"
  const words = text
    .split(/[^A-Za-z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.some((w) => w.startsWith(q))) return WORD;
  if (i >= 0) return SUB;
  // Subsequence: every char in order; tighter spans score higher (max SEQ)
  let from = 0,
    first = -1,
    last = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = s.indexOf(ch, from);
    if (at < 0) return 0;
    if (first < 0) first = at;
    last = at;
    from = at + 1;
  }
  const span = last - first + 1;
  return Math.max(1, SEQ - (span - q.length));
}

/** Best score across title, keywords, id, category, description (weighted). 0 = no match. */
export function scoreTool(
  tool: Pick<Tool, 'title' | 'id' | 'category' | 'description' | 'keywords'>,
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const fields: [string, number][] = [
    [tool.title, 1],
    ...(tool.keywords ?? []).map((k) => [k, 0.95] as [string, number]),
    [tool.id, 0.9],
  ];
  let best = 0;
  for (const [text, w] of fields) best = Math.max(best, scoreText(text, q) * w);
  // Category: substring-or-better only (fuzzy across category names is noise)
  const cat = scoreText(tool.category, q);
  if (cat >= SUB) best = Math.max(best, cat * 0.5);
  // Description: substring only
  if (!best && tool.description.toLowerCase().includes(q)) best = 10;
  return best;
}
