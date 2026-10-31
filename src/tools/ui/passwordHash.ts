import { textTool } from './textTool';
import { bcryptHash, bcryptCheck, argon2Hash, argon2Check } from '../lib/crypto';

export const render = textTool({
  prefix: 'pwh',
  inputLabel: 'Password',
  outputLabel: 'Result',
  inputType: 'password',
  outputRows: 6,
  options: [
    {
      id: 'algo',
      label: 'Algorithm',
      choices: [
        ['bcrypt', 'bcrypt'],
        ['argon2id', 'Argon2id'],
      ],
    },
    {
      id: 'cost',
      label: 'Cost',
      choices: [
        ['low', 'Low (fast)'],
        ['med', 'Medium'],
        ['high', 'High'],
      ],
      default: 'med',
    },
  ],
  fields: [{ id: 'hash', label: 'Existing hash to verify (optional)', placeholder: '$2b$10$… or $argon2id$…' }],
  sample: { input: 'hunter2' },
  run: async (s, v) => {
    const known = v.hash?.trim();
    if (known) {
      const ok = known.startsWith('$argon2') ? await argon2Check(s, known) : await bcryptCheck(s, known);
      return ok ? 'MATCH ✓: password matches the hash' : 'MISMATCH ✗: password does not match';
    }
    const lvl = v.cost === 'low' ? 0 : v.cost === 'high' ? 2 : 1;
    return v.algo === 'bcrypt'
      ? bcryptHash(s, [8, 10, 12][lvl]!)
      : argon2Hash(s, { memoryKiB: [8192, 19456, 65536][lvl]!, iterations: [2, 2, 3][lvl]!, parallelism: 1 });
  },
});
