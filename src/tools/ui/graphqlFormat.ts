import { textTool } from './textTool';
import { formatGraphql, minifyGraphql } from '../lib/format';

export const render = textTool({
  prefix: 'gql',
  inputLabel: 'GraphQL',
  outputLabel: 'Result',
  options: [
    {
      id: 'mode',
      label: 'Mode',
      choices: [
        ['pretty', 'Format'],
        ['min', 'Minify'],
      ],
    },
  ],
  sample: { input: 'query GetUser($id: ID!){user(id:$id){id name posts(first:5){edges{node{title}}}}}' },
  run: (s, v) => (v.mode === 'min' ? minifyGraphql(s) : formatGraphql(s)),
});
