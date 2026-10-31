import { textTool } from './textTool';
import { jsonDiff, formatJsonDiff, parseJsonLabeled } from '../lib/json';

export const render = textTool({
  prefix: 'jd',
  inputLabel: 'Original JSON',
  outputLabel: 'Differences',
  fields: [{ id: 'other', label: 'Changed JSON', rows: 8 }],
  sample: {
    input: '{"name":"forge","version":1,"tags":["a","b"]}',
    fields: { other: '{"version":2,"name":"forge","tags":["a","b","c"],"new":true}' },
  },
  run: (s, v) =>
    formatJsonDiff(jsonDiff(parseJsonLabeled(s, 'Original'), parseJsonLabeled(v.other || 'null', 'Changed'))),
});
