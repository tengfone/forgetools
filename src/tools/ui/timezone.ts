import { textTool } from './textTool';
import { parseInZone, inZones, DEFAULT_ZONES } from '../lib/convert';

export const render = textTool({
  prefix: 'tz',
  inputLabel: 'Date / time',
  outputLabel: 'In each zone',
  inputRows: 2,
  runOnEmpty: true,
  placeholder: 'now, 2024-06-01 09:00, ISO with offset, or Unix seconds',
  fields: [
    {
      id: 'from',
      label: 'Interpret wall time in zone',
      default: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    { id: 'zones', label: 'Show zones (one per line)', rows: 6, default: DEFAULT_ZONES.join('\n') },
  ],
  sample: { input: '2024-06-01 09:00', fields: { from: 'America/New_York' } },
  run: (s, v) => {
    const d = parseInZone(s, v.from?.trim() || 'UTC');
    const zones = (v.zones ?? '')
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean);
    return (
      `ISO (UTC):  ${d.toISOString()}\nUnix:       ${Math.floor(d.getTime() / 1000)}\n\n` +
      inZones(d, zones)
        .map((z) => `${z.zone.padEnd(22)} ${z.time}  ${z.offset}`)
        .join('\n')
    );
  },
});
