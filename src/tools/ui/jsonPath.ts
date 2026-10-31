import { textTool, jsonBytes } from './textTool';
import { jsonPath, parseJsonLabeled } from '../lib/json';

export const render = textTool({
  prefix: 'jp',
  inputLabel: 'JSON',
  outputLabel: 'Matches',
  fields: [
    {
      id: 'path',
      label: 'JSONPath expression',
      default: '$..title',
      placeholder: '$.store.book[?(@.price < 10)].title',
    },
  ],
  sample: {
    input: '{"store":{"book":[{"title":"Dune","price":8},{"title":"Neuromancer","price":12}],"bicycle":{"price":19}}}',
    fields: { path: '$.store.book[?(@.price < 10)].title' },
  },
  run: (s, v) => jsonBytes(jsonPath(parseJsonLabeled(s, 'JSON'), v.path || '$')),
  okMessage: (o) => `${(JSON.parse(o) as unknown[]).length} match(es)`,
});
