import { $, $f } from '../../ui';
import { select } from './common';
import { referenceTool } from './referenceTool';
import { CHEATSHEETS } from '../lib/generate';

export const render = referenceTool({
  prefix: 'cheat',
  placeholder: 'Filter, e.g. stash, lookahead, prune',
  sample: '',
  toolbar: select(
    'cheat-sheet',
    'Sheet',
    [['', 'All sheets'], ...Object.keys(CHEATSHEETS).map((k) => [k, k] as [string, string])],
    '',
  ),
  rows: (q) => {
    const sheet = (document.getElementById('cheat-sheet') as HTMLSelectElement | null)?.value ?? '';
    const s = q.toLowerCase();
    return Object.entries(CHEATSHEETS)
      .filter(([name]) => !sheet || name === sheet)
      .flatMap(([name, rows]) =>
        rows
          .filter(([a, b]) => !s || `${a} ${b}`.toLowerCase().includes(s))
          .map(([a, b]) => ({ group: name, key: a, desc: b, copy: a })),
      );
  },
  onReady: (update) => {
    $('cheat-sheet').addEventListener('change', update);
    $('cheat-sample').onclick = () => {
      $f('cheat-sheet').value = 'Git';
      $f('cheat-input').value = '';
      update();
    };
  },
});
