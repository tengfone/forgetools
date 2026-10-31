import { textTool, dir } from './textTool';
import { envToJson, jsonToEnv } from '../lib/convert';

export const render = textTool({
  prefix: 'ej',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [{ id: 'dir', label: 'Direction', choices: dir('.env → JSON', 'JSON → .env') }],
  sample: {
    input:
      '# database\nDB_HOST=localhost\nDB_PORT=5432\nexport API_URL="https://api.example.com"\nGREETING=\'hello world\'\n',
  },
  run: (s, v) => (v.dir === 'a' ? envToJson(s) : jsonToEnv(s)),
});
