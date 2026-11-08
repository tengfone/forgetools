// Extract and repair JSON from LLM output: code fences, surrounding prose, comments, single
// quotes, unquoted keys, trailing commas, Python literals and truncated output.

export interface RepairResult {
  json: string;
  value: unknown;
  fixes: string[];
}

/** Find the first balanced-looking JSON value in prose (prefers ```json fences). */
function extract(src: string, fixes: string[]): string {
  const fence = /```(?:json|JSON|jsonc|json5)?[ \t]*\r?\n([\s\S]*?)(?:```|$)/.exec(src);
  if (fence && /[[{]/.test(fence[1]!)) {
    fixes.push('Took the content of the code fence');
    src = fence[1]!;
  }
  const start = src.search(/[[{]/);
  if (start < 0) return src.trim();
  // Walk to the matching close bracket (string-aware); if none, keep to the end (truncated).
  let depth = 0;
  let inStr: string | null = null;
  let end = src.length;
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (start > 0 || src.slice(end).trim()) fixes.push('Removed text around the JSON');
  return src.slice(start, end);
}

/** Tokenising rewrite into strict JSON. */
function normalise(s: string, fixes: string[]): string {
  const out: string[] = [];
  const note = (f: string): void => {
    if (!fixes.includes(f)) fixes.push(f);
  };
  const stack: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    // comments
    if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      note('Removed comments');
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      i = e < 0 ? s.length : e + 2;
      note('Removed comments');
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < s.length) {
        const d = s[j]!;
        if (d === '\\') {
          const n = s[j + 1] ?? '';
          buf += n === "'" ? "'" : `\\${n}`;
          j += 2;
          continue;
        }
        if (d === q) {
          closed = true;
          break;
        }
        if (d === '"' && q === "'") buf += '\\"';
        else if (d === '\n') {
          buf += '\\n';
          note('Escaped raw newlines in strings');
        } else if (d === '\t') buf += '\\t';
        else buf += d;
        j++;
      }
      if (q === "'") note('Converted single quotes to double quotes');
      if (!closed) note('Closed an unterminated string');
      out.push(`"${buf}"`);
      i = closed ? j + 1 : j;
      continue;
    }
    if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
      out.push(c);
      i++;
      continue;
    }
    if (c === '}' || c === ']') {
      // trailing comma
      while (out.length && /^\s*$/.test(out[out.length - 1]!)) out.pop();
      if (out[out.length - 1] === ',') {
        out.pop();
        note('Removed trailing commas');
      }
      stack.pop();
      out.push(c);
      i++;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
    if (word) {
      const w = word[0];
      const next = s.slice(i + w.length).match(/^\s*(.)/)?.[1];
      if (next === ':' && stack[stack.length - 1] === '}') {
        out.push(`"${w}"`);
        note('Quoted bare keys');
      } else if (w === 'True' || w === 'False' || w === 'None') {
        out.push(w === 'None' ? 'null' : w.toLowerCase());
        note('Converted Python literals (True/False/None)');
      } else if (w === 'undefined' || w === 'NaN' || w === 'Infinity') {
        out.push('null');
        note(`Replaced ${w} with null`);
      } else out.push(w);
      i += w.length;
      continue;
    }
    out.push(c);
    i++;
  }
  // Truncated output: drop a dangling key/comma, then close open brackets
  if (stack.length) {
    let tail = out.join('').replace(/\s+$/, '');
    tail = tail
      .replace(/,\s*$/, '')
      .replace(/,?\s*"[^"]*"\s*:\s*$/, '')
      .replace(/:\s*$/, ': null');
    note('Closed truncated output');
    return tail + stack.reverse().join('');
  }
  return out.join('');
}

export function repairJson(src: string): RepairResult {
  if (!src.trim()) throw new Error('Paste model output containing JSON');
  const fixes: string[] = [];
  try {
    const value: unknown = JSON.parse(src);
    return { json: JSON.stringify(value, null, 2), value, fixes };
  } catch {
    /* fall through */
  }
  const raw = extract(src, fixes);
  const fixed = normalise(raw, fixes);
  let value: unknown;
  try {
    value = JSON.parse(fixed);
  } catch (e) {
    throw new Error(`Could not repair: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { json: JSON.stringify(value, null, 2), value, fixes };
}
