import { textTool } from './textTool';
import { calcSubnet, cidrContains } from '../lib/inspect';

export const render = textTool({
  prefix: 'cidr',
  inputLabel: 'CIDR / IP + mask',
  outputLabel: 'Subnet',
  inputRows: 2,
  fields: [{ id: 'ip', label: 'Check whether an IP is inside (optional)' }],
  sample: { input: '192.168.10.77/26', fields: { ip: '192.168.10.100' } },
  run: (s, v) => {
    const n = calcSubnet(s);
    const rows: Array<[string, string | undefined]> = [
      ['Network', n.network],
      ['Netmask', n.mask],
      ['Wildcard', n.wildcard],
      ['Broadcast', n.broadcast],
      ['First host', n.firstHost],
      ['Last host', n.lastHost],
      ['Addresses', n.totalAddresses],
      ['Usable hosts', n.usableHosts],
      ['Class', n.ipClass],
      ['Scope', n.scope],
      ['Binary mask', n.binaryMask],
    ];
    let out = rows
      .filter(([, x]) => x)
      .map(([k, x]) => `${k.padEnd(13)} ${x}`)
      .join('\n');
    if (v.ip?.trim())
      out += `\n\n${v.ip.trim()} is ${cidrContains(n.network, v.ip.trim()) ? 'INSIDE' : 'OUTSIDE'} this network`;
    return out;
  },
});
