import { textTool } from './textTool';
import { jsonToTypes, type TypeLang } from '../lib/json';

export const render = textTool({
  prefix: 'jt',
  inputLabel: 'JSON',
  outputLabel: 'Types',
  options: [
    {
      id: 'lang',
      label: 'Language',
      choices: [
        ['typescript', 'TypeScript'],
        ['go', 'Go'],
        ['rust', 'Rust'],
        ['csharp', 'C#'],
        ['python', 'Python'],
      ],
    },
  ],
  fields: [{ id: 'root', label: 'Root type name', default: 'Root' }],
  sample: {
    input:
      '{"id":1,"name":"Ada","email":"ada@example.com","roles":["admin"],"address":{"city":"London","zip":"N1"},"orders":[{"sku":"A1","qty":2},{"sku":"B2"}]}',
  },
  run: (s, v) => jsonToTypes(s, v.lang as TypeLang, v.root?.trim() || 'Root'),
});
