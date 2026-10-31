import { textTool } from './textTool';
import { parseUserAgent } from '../lib/inspect';

export const render = textTool({
  prefix: 'ua',
  inputLabel: 'User-Agent',
  outputLabel: 'Parsed',
  inputRows: 3,
  sample: {
    input:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  run: (s) => {
    const u = parseUserAgent(s.trim());
    return `Browser:  ${u.browser} ${u.browserVersion}\nEngine:   ${u.engine}\nOS:       ${u.os} ${u.osVersion}\nDevice:   ${u.device}${u.vendor ? `\nVendor:   ${u.vendor}` : ''}${u.bot ? `\nBot:      ${u.bot}` : ''}`;
  },
});
