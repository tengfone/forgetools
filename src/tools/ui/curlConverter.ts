import { textTool } from './textTool';
import { curlToCode, type CurlTarget } from '../lib/convert';

export const render = textTool({
  prefix: 'curl',
  inputLabel: 'cURL command',
  outputLabel: 'Code',
  options: [
    {
      id: 'target',
      label: 'Target',
      choices: [
        ['fetch', 'JavaScript fetch'],
        ['axios', 'Axios'],
        ['node-http', 'Node https'],
        ['python', 'Python requests'],
        ['go', 'Go net/http'],
        ['php', 'PHP cURL'],
        ['rust', 'Rust reqwest'],
      ],
    },
  ],
  sample: {
    input: `curl -X POST 'https://api.example.com/v1/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -d '{"name":"Ada","role":"admin"}'`,
  },
  run: (s, v) => curlToCode(s, v.target as CurlTarget),
});
