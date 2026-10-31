import { textTool } from './textTool';
import { lintDockerfile } from '../lib/format';

export const render = textTool({
  prefix: 'dfl',
  inputLabel: 'Dockerfile',
  outputLabel: 'Findings',
  sample: {
    input:
      'FROM node\nMAINTAINER dev@example.com\nRUN apt-get update\nRUN apt-get install curl\nADD . /app\nWORKDIR app\nENV API_KEY=supersecret\nRUN npm install\nCMD npm start\n',
  },
  run: (s) => {
    const issues = lintDockerfile(s);
    if (!issues.length) return 'No issues found ✓';
    const icon = { error: '✗', warning: '⚠', info: 'ℹ' } as const;
    return issues
      .map((i) => `${icon[i.level]} line ${String(i.line).padEnd(3)} ${i.rule.padEnd(11)} ${i.message}`)
      .join('\n');
  },
  okMessage: (o) => (o.startsWith('No issues') ? 'Clean' : `${o.split('\n').length} finding(s)`),
});
