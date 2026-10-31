import type { Indent } from '../../types/tools';
import { clampIndent } from './indent';

// ---------------------------------------------------------------------------
// SQL formatter: tokenizer-based. Uppercases keywords, breaks major clauses,
// indents AND/OR and comma lists, tracks parenthesis depth (subqueries get
// their own indentation), and leaves strings, quoted identifiers and comments
// untouched.
// ---------------------------------------------------------------------------
const SQL_KEYWORDS = new Set(
  (
    'select from where and or not in is null like between exists as on join inner left right full outer cross ' +
    'group by order having limit offset union all distinct insert into values update set delete create table ' +
    'alter drop index view with case when then else end asc desc returning top fetch next rows only primary key ' +
    'foreign references default constraint unique check if replace truncate except intersect over partition ' +
    'count sum avg min max coalesce cast true false'
  ).split(' '),
);

// Multi-word clauses first so they win over their single-word prefixes.
const SQL_CLAUSES = [
  'GROUP BY',
  'ORDER BY',
  'PARTITION BY',
  'INSERT INTO',
  'DELETE FROM',
  'UNION ALL',
  'LEFT OUTER JOIN',
  'RIGHT OUTER JOIN',
  'FULL OUTER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'INNER JOIN',
  'CROSS JOIN',
  'JOIN',
  'SELECT',
  'FROM',
  'WHERE',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'EXCEPT',
  'INTERSECT',
  'VALUES',
  'UPDATE',
  'SET',
  'WITH',
  'RETURNING',
];

type SqlToken = { type: 'word' | 'string' | 'comment' | 'punct' | 'op'; value: string };

function tokenizeSql(input: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && input[i + 1] === '-') {
      const end = input.indexOf('\n', i);
      const stop = end === -1 ? input.length : end;
      tokens.push({ type: 'comment', value: input.slice(i, stop).trimEnd() });
      i = stop;
      continue;
    }
    if (c === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      const stop = end === -1 ? input.length : end + 2;
      tokens.push({ type: 'comment', value: input.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === close) {
          if (close !== ']' && input[j + 1] === close) {
            j += 2;
            continue;
          } // doubled quote escape
          break;
        }
        j++;
      }
      tokens.push({ type: 'string', value: input.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if ('(),;'.includes(c)) {
      tokens.push({ type: 'punct', value: c });
      i++;
      continue;
    }
    const word = /^[A-Za-z_@#$][\w$#@]*(\.[\w$*]+)*|^\d+(\.\d+)?/.exec(input.slice(i));
    if (word) {
      tokens.push({ type: 'word', value: word[0] });
      i += word[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|!=|\|\||::|[=<>+\-*/%.!])/.exec(input.slice(i));
    const v = op ? op[0] : c;
    tokens.push({ type: 'op', value: v });
    i += v.length;
  }
  return tokens;
}

export function formatSql(input: string, indent?: Indent): string {
  if (!input.trim()) return '';
  const i = clampIndent(indent);
  const unit = i === '\t' ? i : ' '.repeat(i);
  const tokens = tokenizeSql(input).map((t) =>
    t.type === 'word' && SQL_KEYWORDS.has(t.value.toLowerCase()) ? { ...t, value: t.value.toUpperCase() } : t,
  );

  const lines: string[] = [];
  let line = '';
  let base = 0; // indentation level of current clause
  // Stack of paren contexts: true = subquery (block indentation), false = inline (function call / list)
  const parens: Array<{ block: boolean; base: number }> = [];
  const pad = (lvl: number) => unit.repeat(Math.max(0, lvl));
  const newline = (lvl: number) => {
    if (line.trim()) lines.push(line.trimEnd());
    line = pad(lvl);
  };
  const append = (s: string) => {
    const last = line.slice(-1);
    if (line.trim() && last !== '(' && last !== ' ' && s !== ',' && s !== ')' && s !== ';' && s !== '.') line += ' ';
    line += s;
  };
  const inlineDepth = () => parens.filter((p) => !p.block).length;
  let clause = '';

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    // Match multi-word clauses
    if (t.type === 'word') {
      let matched = '';
      for (const cl of SQL_CLAUSES) {
        const parts = cl.split(' ');
        if (parts.every((p, n) => tokens[k + n]?.type === 'word' && tokens[k + n]!.value.toUpperCase() === p)) {
          matched = cl;
          break;
        }
      }
      if (matched && inlineDepth() === 0) {
        newline(base);
        append(matched);
        clause = matched;
        k += matched.split(' ').length - 1;
        newline(base + 1);
        // keep short clause args (e.g. LIMIT 10) on the clause line
        if (['LIMIT', 'OFFSET'].includes(matched)) line = lines.pop()!;
        continue;
      }
      // `x BETWEEN a AND b` keeps its AND inline
      const betweenAnd = t.value === 'AND' && tokens[k - 2]?.value === 'BETWEEN';
      if ((t.value === 'AND' || t.value === 'OR') && inlineDepth() === 0 && clause !== 'SELECT' && !betweenAnd) {
        newline(base + 1);
        append(t.value);
        continue;
      }
      if (t.value === 'ON' && inlineDepth() === 0) {
        newline(base + 1);
        append('ON');
        continue;
      }
    }
    if (t.type === 'comment') {
      append(t.value);
      if (t.value.startsWith('--')) newline(base + 1);
      continue;
    }
    if (t.type === 'punct') {
      if (t.value === '(') {
        const next = tokens[k + 1];
        const block = !!next && next.type === 'word' && /^(SELECT|WITH)$/.test(next.value);
        const prev = tokens[k - 1];
        const isCall =
          !!prev &&
          prev.type === 'word' &&
          !/^(IN|AS|EXISTS|ON|VALUES|AND|OR|NOT|INTO|FROM|JOIN|WHERE|SELECT|OVER|USING)$/.test(prev.value);
        if (isCall) line = line.trimEnd();
        else if (line.trim() && !line.endsWith(' ') && !line.endsWith('(')) line += ' ';
        line += '(';
        parens.push({ block, base });
        if (block) {
          base += 2;
          newline(base);
        }
        continue;
      }
      if (t.value === ')') {
        const ctx = parens.pop();
        if (ctx?.block) {
          base = ctx.base;
          newline(base + 1);
        }
        append(')');
        continue;
      }
      if (t.value === ',') {
        append(',');
        if (inlineDepth() === 0 && clause !== 'VALUES') newline(base + 1);
        continue;
      }
      if (t.value === ';') {
        append(';');
        lines.push(line.trimEnd());
        lines.push('');
        line = '';
        base = 0;
        parens.length = 0;
        clause = '';
        continue;
      }
    }
    append(t.value);
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
