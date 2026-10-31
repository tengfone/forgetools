import { textTool } from './textTool';
import { parseUrl } from '../lib/inspect';

export const render = textTool({
  prefix: 'urlp',
  inputLabel: 'URL',
  outputLabel: 'Parts',
  inputRows: 4,
  sample: { input: 'https://user:pass@api.example.com:8443/v1/items/42?sort=desc&tag=a&tag=b#details' },
  run: (s) => {
    const u = parseUrl(s);
    const rows: Array<[string, string]> = [
      ['Protocol', u.protocol],
      ['Origin', u.origin],
      ['Username', u.username],
      ['Password', u.password],
      ['Host', u.hostname],
      ['Port', u.port],
      ['Path', u.pathname],
      ['Query', u.search],
      ['Fragment', u.hash],
    ];
    let out = rows
      .filter(([, x]) => x)
      .map(([k, x]) => `${k.padEnd(10)} ${x}`)
      .join('\n');
    if (u.pathSegments.length) out += `\n\nPath segments:\n${u.pathSegments.map((p, i) => `  [${i}] ${p}`).join('\n')}`;
    if (u.params.length) out += `\n\nQuery parameters:\n${u.params.map(([k, x]) => `  ${k} = ${x}`).join('\n')}`;
    return out;
  },
});
