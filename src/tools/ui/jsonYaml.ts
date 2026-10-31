import { textTool, dir } from './textTool';
import { jsonToYaml, yamlToJson } from '../lib/json';

export const render = textTool({
  prefix: 'jy',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [{ id: 'dir', label: 'Direction', choices: dir('JSON → YAML', 'YAML → JSON') }],
  sample: { input: '{"name":"forge","tags":["dev","tools"],"server":{"port":8080,"tls":true}}' },
  run: (s, v) => (v.dir === 'a' ? jsonToYaml(s) : yamlToJson(s)),
});
