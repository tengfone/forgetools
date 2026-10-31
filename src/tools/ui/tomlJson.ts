import { textTool, dir } from './textTool';
import { tomlToJson, jsonToToml } from '../lib/convert';

export const render = textTool({
  prefix: 'tj',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [{ id: 'dir', label: 'Direction', choices: dir('TOML → JSON', 'JSON → TOML') }],
  sample: {
    input:
      'title = "ForgeTools"\n\n[server]\nhost = "localhost"\nport = 8080\n\n[[users]]\nname = "ada"\nadmin = true\n',
  },
  run: (s, v) => (v.dir === 'a' ? tomlToJson(s) : jsonToToml(s)),
});
