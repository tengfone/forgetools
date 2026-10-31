// Time zone conversion.

export const DEFAULT_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function zoneOffset(date: Date, zone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

const fmtOffset = (m: number): string =>
  `UTC${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

/** Interpret a wall-clock "YYYY-MM-DD HH:mm[:ss]" in `zone`, or an ISO string with offset / "now". */
export function parseInZone(input: string, zone: string): Date {
  const s = input.trim();
  if (!s || /^now$/i.test(s)) return new Date();
  if (/^\d{10}$/.test(s)) return new Date(+s * 1000);
  if (/^\d{13}$/.test(s)) return new Date(+s);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    if (!isNaN(+d)) return d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) throw new Error('Use YYYY-MM-DD HH:mm, an ISO date with offset, a Unix timestamp, or "now"');
  validateZone(zone);
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  let t = guess - zoneOffset(new Date(guess), zone) * 60000;
  t = guess - zoneOffset(new Date(t), zone) * 60000; // second pass settles DST edges
  return new Date(t);
}

export function validateZone(zone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new Error(`Unknown time zone "${zone}"`);
  }
}

export function inZones(date: Date, zones: string[]): Array<{ zone: string; time: string; offset: string }> {
  return zones.map((zone) => {
    validateZone(zone);
    const time = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    }).format(date);
    return { zone, time, offset: fmtOffset(zoneOffset(date, zone)) };
  });
}
