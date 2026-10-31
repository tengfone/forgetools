import { textTool } from './textTool';
import { convertSize } from '../lib/convert';

export const render = textTool({
  prefix: 'dsz',
  inputLabel: 'Size',
  outputLabel: 'Conversions',
  inputRows: 2,
  outputRows: 16,
  sample: { input: '1.5 GiB' },
  run: (s) =>
    convertSize(s)
      .map(([u, n]) => `${u.padEnd(5)} ${n}`)
      .join('\n'),
});
