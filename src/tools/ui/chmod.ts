import { textTool } from './textTool';
import { parseChmod } from '../lib/convert';

export const render = textTool({
  prefix: 'chmod',
  inputLabel: 'Permissions (octal or symbolic)',
  outputLabel: 'Result',
  inputRows: 2,
  sample: { input: '755' },
  run: (s) => {
    const c = parseChmod(s);
    return `Octal:     ${c.octal}\nSymbolic:  ${c.symbolic}\nCommand:   ${c.command}\n\n${c.description.join('\n')}`;
  },
});
