import { referenceTool } from './referenceTool';
import { searchHttpStatus } from '../lib/inspect';

const HTTP_CLASS: Record<string, string> = {
  '1': '1xx Informational',
  '2': '2xx Success',
  '3': '3xx Redirection',
  '4': '4xx Client error',
  '5': '5xx Server error',
};

export const render = referenceTool({
  prefix: 'http',
  placeholder: 'Code (404), class (4) or words (gateway)',
  sample: '5',
  rows: (q) =>
    searchHttpStatus(q).map(([c, n, d]) => ({
      group: HTTP_CLASS[String(c)[0]!] ?? 'Other',
      key: String(c),
      name: n,
      desc: d,
      copy: `${c} ${n}`,
    })),
});
