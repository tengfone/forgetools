// MCP server configuration: build one server entry and render it for each client's config file.

export interface McpServer {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export type McpClient = 'claude-desktop' | 'claude-code' | 'cursor' | 'vscode' | 'windsurf';

export const MCP_CLIENTS: Array<[McpClient, string, string]> = [
  ['claude-desktop', 'Claude Desktop', 'claude_desktop_config.json'],
  ['claude-code', 'Claude Code', '.mcp.json (project) or `claude mcp add-json`'],
  ['cursor', 'Cursor', '.cursor/mcp.json or ~/.cursor/mcp.json'],
  ['vscode', 'VS Code', '.vscode/mcp.json'],
  ['windsurf', 'Windsurf', '~/.codeium/windsurf/mcp_config.json'],
];

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = <T extends object>(o: T | undefined): T | undefined => (o && Object.keys(o).length ? o : undefined);

/** Split a shell-like command line into argv (handles quotes). */
export function splitCommand(s: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  for (const m of s.matchAll(re)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : (m[2] ?? m[3]!));
  return out;
}

/** KEY=value lines (or KEY: value) to a record. */
export function parsePairs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of s.split(/\r?\n/)) {
    const m = /^\s*([^=:\s]+)\s*[=:]\s?(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function entry(s: McpServer, client: McpClient): O {
  if (s.transport === 'stdio') {
    const e: O = { command: s.command ?? '' };
    if (s.args?.length) e.args = s.args;
    if (nonEmpty(s.env)) e.env = s.env;
    if (client === 'vscode' || client === 'claude-code') return { type: 'stdio', ...e };
    return e;
  }
  const headers = nonEmpty(s.headers);
  switch (client) {
    case 'claude-desktop':
      // Claude Desktop config only launches local processes; bridge remote servers with mcp-remote.
      return {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote',
          s.url ?? '',
          ...Object.entries(headers ?? {}).flatMap(([k, v]) => ['--header', `${k}: ${v}`]),
        ],
      };
    case 'windsurf':
      return { serverUrl: s.url, ...(headers ? { headers } : {}) };
    case 'cursor':
      return { url: s.url, ...(headers ? { headers } : {}) };
    default:
      return { type: s.transport, url: s.url, ...(headers ? { headers } : {}) };
  }
}

export function renderConfig(servers: McpServer[], client: McpClient): string {
  const key = client === 'vscode' ? 'servers' : 'mcpServers';
  const obj: O = {};
  for (const s of servers) obj[s.name] = entry(s, client);
  return JSON.stringify({ [key]: obj }, null, 2);
}

/** Read servers from any client's config (or a bare servers map). */
export function readConfig(src: string): McpServer[] {
  const v: unknown = JSON.parse(src);
  if (!isObj(v)) throw new Error('Expected a JSON object');
  const map = isObj(v.mcpServers)
    ? v.mcpServers
    : isObj(v.servers)
      ? v.servers
      : isObj(v.mcp) && isObj(v.mcp.servers)
        ? v.mcp.servers
        : v;
  const out: McpServer[] = [];
  for (const [name, raw] of Object.entries(map)) {
    if (!isObj(raw)) continue;
    const url = (raw.url ?? raw.serverUrl ?? raw.httpUrl) as string | undefined;
    const args = Array.isArray(raw.args) ? raw.args.map(String) : [];
    // Unwrap mcp-remote bridges back to a remote server
    if (raw.command === 'npx' && args.includes('mcp-remote')) {
      const rest = args.slice(args.indexOf('mcp-remote') + 1);
      const headers: Record<string, string> = {};
      for (let i = 0; i < rest.length; i++)
        if (rest[i] === '--header' && rest[i + 1]) {
          const [k, ...v2] = rest[i + 1]!.split(':');
          headers[k!.trim()] = v2.join(':').trim();
          i++;
        }
      out.push({ name, transport: 'http', url: rest.find((a) => /^https?:/.test(a)), headers });
      continue;
    }
    if (typeof url === 'string') {
      out.push({
        name,
        transport: raw.type === 'sse' ? 'sse' : 'http',
        url,
        headers: isObj(raw.headers) ? (raw.headers as Record<string, string>) : undefined,
      });
    } else if (typeof raw.command === 'string') {
      out.push({
        name,
        transport: 'stdio',
        command: raw.command,
        args,
        env: isObj(raw.env) ? (raw.env as Record<string, string>) : undefined,
      });
    }
  }
  if (!out.length) throw new Error('No MCP servers found (expected "mcpServers" or "servers")');
  return out;
}

export function checkServer(s: McpServer): string[] {
  const w: string[] = [];
  if (!/^[\w.-]+$/.test(s.name)) w.push('Server name should only use letters, digits, _ . -');
  if (s.transport === 'stdio' && !s.command) w.push('Command is required for a local (stdio) server');
  if (s.transport !== 'stdio') {
    if (!s.url) w.push('URL is required for a remote server');
    else if (!/^https?:\/\//.test(s.url)) w.push('URL should start with http:// or https://');
  }
  for (const [k, v] of Object.entries({ ...s.env, ...s.headers }))
    if (/key|token|secret|password|authorization/i.test(k) && v && !/^\$\{|^\$[A-Z_]|^<|^\$\{input:/.test(v))
      w.push(`"${k}" contains a literal secret; consider an env var reference before committing this file`);
  return w;
}
