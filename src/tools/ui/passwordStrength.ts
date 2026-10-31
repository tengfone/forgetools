import { textTool } from './textTool';
import { passwordStrength } from '../lib/crypto';

export const render = textTool({
  prefix: 'pws',
  inputLabel: 'Password',
  outputLabel: 'Strength',
  inputType: 'password',
  sample: { input: 'Tr0ub4dor&3' },
  run: (s) => {
    const r = passwordStrength(s);
    return `Score:       ${r.score}/4 (${r.label})\nEntropy:     ~${Math.round(r.entropy)} bits\nCrack time:  ${r.crackTime} (offline, 10B guesses/s)${r.warnings.length ? `\n\nWarnings:\n${r.warnings.map((w) => `  • ${w}`).join('\n')}` : ''}`;
  },
});
