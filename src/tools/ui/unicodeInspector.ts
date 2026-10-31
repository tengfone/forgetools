import { textTool } from './textTool';
import { inspectUnicode, stripInvisible, graphemeCount } from '../lib/inspect';
import { toUtf8 } from '../lib/bytes';

export const render = textTool({
  prefix: 'uni',
  inputLabel: 'Text',
  outputLabel: 'Characters',
  outputRows: 16,
  options: [
    {
      id: 'mode',
      label: 'Show',
      choices: [
        ['all', 'All characters'],
        ['invisible', 'Invisible only'],
        ['strip', 'Text with invisibles removed'],
      ],
    },
  ],
  sample: { input: 'Price:\u00A0100\u200B€ — café 👍🏽\uFEFF' },
  run: (s, v) => {
    if (v.mode === 'strip') return stripInvisible(s);
    const chars = inspectUnicode(s).filter((c) => v.mode === 'all' || c.invisible);
    const head = `${[...s].length} code points, ${graphemeCount(s)} graphemes, ${s.length} UTF-16 units, ${toUtf8(s).length} UTF-8 bytes\n\n`;
    return (
      head +
      chars
        .map(
          (c) =>
            `${c.invisible ? '⚠' : ' '} ${c.codePoint.padEnd(8)} ${(c.invisible ? '·' : c.char).padEnd(3)} UTF-8 ${c.utf8.padEnd(12)} ${c.category.padEnd(4)} ${c.name}`,
        )
        .join('\n')
    );
  },
  okMessage: (_o, s) => `${inspectUnicode(s).filter((c) => c.invisible).length} invisible character(s)`,
});
