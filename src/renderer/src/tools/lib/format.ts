// Formatters: CSS/SCSS/JS beautify + minify, GraphQL, Dockerfile lint, docker run <-> compose.
import beautify from 'js-beautify';
import { parse as gqlParse, print as gqlPrint } from 'graphql';
import yaml from 'js-yaml';
import { shellSplit } from './convert';

// ── CSS / JS ───────────────────────────────────────────────────────────────

export function beautifyCss(src: string, indent = 2): string {
  return beautify.css(src, { indent_size: indent, end_with_newline: false, selector_separator_newline: true });
}

export function beautifyJs(src: string, indent = 2): string {
  return beautify.js(src, {
    indent_size: indent,
    end_with_newline: false,
    preserve_newlines: true,
    max_preserve_newlines: 2,
  });
}

/** Comment/whitespace-stripping CSS minifier that leaves strings and url() alone. */
export function minifyCss(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (src[i + 2] === '!') out += src.slice(i, end === -1 ? src.length : end + 2); // keep /*! licence */
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      const prev = out.slice(-1),
        next = src[i] ?? '';
      if (prev && next && !/[{}:;,>~+(]/.test(prev) && !/[{}:;,>~+)!]/.test(next)) out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/;}/g, '}').trim();
}

export async function minifyJs(src: string): Promise<string> {
  const { minify } = await import('terser');
  try {
    const r = await minify(src, { compress: true, mangle: true, format: { comments: false } });
    return r.code ?? '';
  } catch (e) {
    const err = e as { message?: string; line?: number; col?: number };
    throw new Error(`${err.message ?? String(e)}${err.line ? ` (line ${err.line}, col ${err.col})` : ''}`);
  }
}

// ── GraphQL ────────────────────────────────────────────────────────────────

export function formatGraphql(src: string): string {
  try {
    return gqlPrint(gqlParse(src));
  } catch (e) {
    throw new Error('Invalid GraphQL: ' + (e as Error).message.split('\n')[0]);
  }
}

export function minifyGraphql(src: string): string {
  return formatGraphql(src)
    .replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|#[^\n]*|\s+/g, (m) =>
      m.startsWith('"') ? m : m.startsWith('#') ? '' : ' ',
    )
    .replace(/ ?([{}():,=@!$[\]|]) ?/g, '$1')
    .trim();
}

// ── Dockerfile lint ────────────────────────────────────────────────────────

export interface LintIssue {
  line: number;
  level: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

const INSTRUCTIONS = new Set([
  'FROM',
  'RUN',
  'CMD',
  'LABEL',
  'MAINTAINER',
  'EXPOSE',
  'ENV',
  'ADD',
  'COPY',
  'ENTRYPOINT',
  'VOLUME',
  'USER',
  'WORKDIR',
  'ARG',
  'ONBUILD',
  'STOPSIGNAL',
  'HEALTHCHECK',
  'SHELL',
]);

export function lintDockerfile(src: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (line: number, level: LintIssue['level'], rule: string, message: string): void => {
    issues.push({ line, level, rule, message });
  };
  // join continuation lines, remembering the starting line number
  const raw = src.split(/\r?\n/);
  const logical: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const start = i;
    let text = raw[i]!;
    while (/\\\s*$/.test(text) && i + 1 < raw.length)
      text = text.replace(/\\\s*$/, ' ') + raw[++i]!.replace(/^\s*#.*$/, '');
    if (text.trim() && !text.trim().startsWith('#')) logical.push({ line: start + 1, text: text.trim() });
  }
  if (!logical.length)
    return [{ line: 1, level: 'error', rule: 'DL-EMPTY', message: 'Dockerfile has no instructions' }];

  let sawFrom = false,
    user: string | null = null,
    cmdCount = 0,
    entryCount = 0,
    healthcheck = false;
  const stages = new Set<string>();
  logical.forEach(({ line, text }, idx) => {
    const m = /^(\S+)\s*(.*)$/.exec(text)!;
    const ins = m[1]!.toUpperCase(),
      args = m[2]!;
    if (!INSTRUCTIONS.has(ins)) {
      add(line, 'error', 'DL-UNKNOWN', `Unknown instruction "${m[1]}"`);
      return;
    }
    if (m[1] !== ins) add(line, 'info', 'DL-CASE', `Write instructions in upper case (${ins})`);
    if (!sawFrom && ins !== 'FROM' && ins !== 'ARG')
      add(line, 'error', 'DL3061', 'The first instruction must be FROM (only ARG may come before it)');
    switch (ins) {
      case 'FROM': {
        sawFrom = true;
        cmdCount = 0;
        entryCount = 0;
        user = null;
        const fm = /^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(args);
        const image = fm?.[1] ?? '';
        if (fm?.[2]) stages.add(fm[2].toLowerCase());
        if (!stages.has(image.toLowerCase()) && image !== 'scratch' && !image.includes('$')) {
          if (!image.includes(':') && !image.includes('@'))
            add(line, 'warning', 'DL3006', `Pin the image version: "${image}" has no tag`);
          else if (/:latest$/.test(image))
            add(line, 'warning', 'DL3007', 'Avoid the :latest tag; pin a specific version');
        }
        break;
      }
      case 'MAINTAINER':
        add(line, 'warning', 'DL4000', 'MAINTAINER is deprecated; use LABEL maintainer="..."');
        break;
      case 'RUN':
        if (/\bapt-get\s+install\b/.test(args)) {
          if (!/\s-y\b|--yes|--assume-yes/.test(args))
            add(line, 'warning', 'DL3014', 'Use apt-get install -y to avoid interactive prompts');
          if (!/--no-install-recommends/.test(args))
            add(line, 'info', 'DL3015', 'Add --no-install-recommends to keep the image small');
          if (!/rm -rf \/var\/lib\/apt\/lists/.test(args))
            add(line, 'info', 'DL3009', 'Clean up with rm -rf /var/lib/apt/lists/* in the same RUN');
        }
        if (/\bapt-get\s+update\b/.test(args) && !/\bapt-get\s+install\b/.test(args))
          add(
            line,
            'warning',
            'DL3059-apt',
            'Run apt-get update and install in the same RUN, otherwise the update layer gets cached',
          );
        if (/\bapt-get\s+upgrade\b|\bapt-get\s+dist-upgrade\b/.test(args))
          add(line, 'warning', 'DL3005', 'Avoid apt-get upgrade in images; use a newer base image');
        if (/\bsudo\b/.test(args)) add(line, 'warning', 'DL3004', 'Do not use sudo in RUN; switch with USER instead');
        if (/^\s*cd\s/.test(args)) add(line, 'info', 'DL3003', 'Use WORKDIR instead of cd');
        if (/\bpip3?\s+install\b/.test(args) && !/--no-cache-dir/.test(args))
          add(line, 'info', 'DL3042', 'Use pip install --no-cache-dir');
        if (/\bapk\s+add\b/.test(args) && !/--no-cache/.test(args))
          add(line, 'info', 'DL3019', 'Use apk add --no-cache');
        if (/\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/.test(args))
          add(line, 'warning', 'SEC-PIPE', 'Piping a download into a shell runs unverified code');
        if (/\bnpm\s+install\b/.test(args) && !/\bnpm\s+ci\b/.test(args))
          add(line, 'info', 'DL-NPM', 'Prefer npm ci for reproducible installs');
        break;
      case 'ADD':
        if (!/\.(tar|tgz|tar\.gz|tar\.bz2|tar\.xz)\b/.test(args) && !/^https?:/.test(args.replace(/^--\S+\s+/g, '')))
          add(line, 'warning', 'DL3020', 'Use COPY instead of ADD for plain files');
        break;
      case 'CMD':
        cmdCount++;
        if (cmdCount > 1) add(line, 'warning', 'DL4003', 'Multiple CMD instructions: only the last one takes effect');
        if (!/^\[/.test(args))
          add(line, 'info', 'DL3025', 'Use the JSON (exec) form for CMD so signals reach your process');
        break;
      case 'ENTRYPOINT':
        entryCount++;
        if (entryCount > 1)
          add(line, 'warning', 'DL4004', 'Multiple ENTRYPOINT instructions: only the last one takes effect');
        if (!/^\[/.test(args)) add(line, 'info', 'DL3025', 'Use the JSON (exec) form for ENTRYPOINT');
        break;
      case 'WORKDIR':
        if (!/^[/$"]|^[A-Za-z]:/.test(args)) add(line, 'warning', 'DL3000', 'Use an absolute WORKDIR path');
        break;
      case 'USER':
        user = args.trim();
        break;
      case 'EXPOSE':
        for (const p of args.split(/\s+/)) {
          const n = parseInt(p, 10);
          if (!p.includes('$') && !(n >= 0 && n <= 65535)) add(line, 'error', 'DL3011', `Invalid port "${p}"`);
        }
        break;
      case 'ENV':
      case 'ARG':
        if (/(PASSWORD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY)\s*[= ]\s*\S/i.test(args))
          add(
            line,
            'warning',
            'SEC-SECRET',
            `Secrets in ${ins} are baked into the image; use build secrets or runtime env`,
          );
        if (ins === 'ENV' && !args.includes('=') && args.split(/\s+/).length > 1)
          add(line, 'info', 'DL-ENV', 'Use the ENV key=value form; "ENV key value" is legacy');
        break;
      case 'HEALTHCHECK':
        healthcheck = true;
        break;
    }
    if (idx === logical.length - 1 && user === null && ins !== 'FROM')
      add(line, 'info', 'DL3002', 'The final stage runs as root; add a USER instruction');
    if (idx === logical.length - 1 && user && /^(root|0)(:.*)?$/.test(user))
      add(line, 'warning', 'DL3002', 'The last USER is root');
  });
  if (!sawFrom) add(1, 'error', 'DL-NOFROM', 'No FROM instruction found');
  if (!healthcheck) add(logical[logical.length - 1]!.line, 'info', 'DL-HEALTH', 'Consider adding a HEALTHCHECK');
  return issues.sort((a, b) => a.line - b.line);
}

// ── docker run <-> compose ─────────────────────────────────────────────────

interface ComposeService {
  image?: string;
  container_name?: string;
  ports?: string[];
  environment?: Record<string, string>;
  env_file?: string[];
  volumes?: string[];
  networks?: string[];
  restart?: string;
  command?: string[] | string;
  entrypoint?: string;
  working_dir?: string;
  user?: string;
  hostname?: string;
  labels?: Record<string, string>;
  privileged?: boolean;
  network_mode?: string;
  extra_hosts?: string[];
  cap_add?: string[];
  devices?: string[];
  tty?: boolean;
  stdin_open?: boolean;
  mem_limit?: string;
  cpus?: string;
  depends_on?: string[];
  healthcheck?: Record<string, string | string[]>;
}

export function dockerRunToCompose(cmd: string): string {
  const args = shellSplit(cmd.trim());
  let i = 0;
  if (args[i] === 'docker') i++;
  if (args[i] === 'container') i++;
  if (args[i] !== 'run') throw new Error('Expected a "docker run ..." command');
  i++;
  const svc: ComposeService = {};
  const named = new Set<string>();
  const kv = (s: string): [string, string] => {
    const k = s.indexOf('=');
    return k === -1 ? [s, ''] : [s.slice(0, k), s.slice(k + 1)];
  };
  for (; i < args.length; i++) {
    let a = args[i]!;
    if (!a.startsWith('-')) break;
    let val: string | undefined;
    const eq = /^(--[\w-]+)=(.*)$/s.exec(a);
    if (eq) {
      a = eq[1]!;
      val = eq[2];
    }
    const next = (): string =>
      val ??
      args[++i] ??
      (() => {
        throw new Error(`${a} needs a value`);
      })();
    switch (a) {
      case '-d':
      case '--detach':
      case '--rm':
        break;
      case '-it':
      case '-ti':
        svc.tty = true;
        svc.stdin_open = true;
        break;
      case '-t':
      case '--tty':
        svc.tty = true;
        break;
      case '-i':
      case '--interactive':
        svc.stdin_open = true;
        break;
      case '--name':
        svc.container_name = next();
        break;
      case '-p':
      case '--publish':
        (svc.ports ??= []).push(next());
        break;
      case '-e':
      case '--env': {
        const [k, v] = kv(next());
        (svc.environment ??= {})[k] = v;
        break;
      }
      case '--env-file':
        (svc.env_file ??= []).push(next());
        break;
      case '-v':
      case '--volume': {
        const v = next();
        (svc.volumes ??= []).push(v);
        const src = v.split(':')[0]!;
        if (!/^[./~]|^[A-Za-z]:\\|^\$/.test(src) && v.includes(':')) named.add(src);
        break;
      }
      case '--mount':
        (svc.volumes ??= []).push(next());
        break;
      case '--network':
      case '--net': {
        const n = next();
        if (['host', 'none', 'bridge'].includes(n) || n.startsWith('container:')) svc.network_mode = n;
        else (svc.networks ??= []).push(n);
        break;
      }
      case '--restart':
        svc.restart = next();
        break;
      case '-w':
      case '--workdir':
        svc.working_dir = next();
        break;
      case '-u':
      case '--user':
        svc.user = next();
        break;
      case '-h':
      case '--hostname':
        svc.hostname = next();
        break;
      case '-l':
      case '--label': {
        const [k, v] = kv(next());
        (svc.labels ??= {})[k] = v;
        break;
      }
      case '--entrypoint':
        svc.entrypoint = next();
        break;
      case '--privileged':
        svc.privileged = true;
        break;
      case '--add-host':
        (svc.extra_hosts ??= []).push(next());
        break;
      case '--cap-add':
        (svc.cap_add ??= []).push(next());
        break;
      case '--device':
        (svc.devices ??= []).push(next());
        break;
      case '-m':
      case '--memory':
        svc.mem_limit = next();
        break;
      case '--cpus':
        svc.cpus = next();
        break;
      case '--health-cmd':
        (svc.healthcheck ??= {}).test = ['CMD-SHELL', next()];
        break;
      case '--health-interval':
        (svc.healthcheck ??= {}).interval = next();
        break;
      case '--health-retries':
        (svc.healthcheck ??= {}).retries = next();
        break;
      case '--link':
        (svc.depends_on ??= []).push(next().split(':')[0]!);
        break;
      default:
        if (val === undefined && args[i + 1] && !args[i + 1]!.startsWith('-') && /^--/.test(a)) i++; // unknown flag with value
    }
  }
  const image = args[i];
  if (!image) throw new Error('No image found in the docker run command');
  svc.image = image;
  const rest = args.slice(i + 1);
  if (rest.length) svc.command = rest;
  const name = (svc.container_name ?? image.split('/').pop()!.split(':')[0]!).replace(/[^\w.-]/g, '-');
  const doc: Record<string, unknown> = { services: { [name]: svc } };
  if (named.size) doc.volumes = Object.fromEntries([...named].map((v) => [v, {}]));
  if (svc.networks) doc.networks = Object.fromEntries(svc.networks.map((n) => [n, { external: true }]));
  return yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' });
}

/** Stringify a YAML scalar; structured values become JSON rather than "[object Object]". */
const str = (v: unknown): string => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

const q = (s: string): string => (/^[\w./:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

export function composeToDockerRun(src: string): string {
  const doc = yaml.load(src) as { services?: Record<string, Record<string, unknown>> } | null;
  if (!doc || typeof doc !== 'object' || !doc.services)
    throw new Error('Expected a compose file with a services: section');
  const cmds: string[] = [];
  for (const [name, s] of Object.entries(doc.services)) {
    if (!s.image) {
      cmds.push(`# ${name}: uses build:, run "docker build" first`);
      continue;
    }
    const parts = ['docker run -d', `--name ${q(str(s.container_name ?? name))}`];
    const list = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.map(String)
        : v && typeof v === 'object'
          ? Object.entries(v).map(([k, x]) => (x === null ? k : `${k}=${str(x)}`))
          : v
            ? [str(v)]
            : [];
    for (const p of list(s.ports)) parts.push(`-p ${q(p)}`);
    for (const e of list(s.environment)) parts.push(`-e ${q(e)}`);
    for (const e of list(s.env_file)) parts.push(`--env-file ${q(e)}`);
    for (const v of list(s.volumes)) parts.push(`-v ${q(v)}`);
    for (const n of Array.isArray(s.networks) ? s.networks : s.networks ? Object.keys(s.networks) : [])
      parts.push(`--network ${q(String(n))}`);
    if (s.network_mode) parts.push(`--network ${q(str(s.network_mode))}`);
    if (s.restart) parts.push(`--restart ${q(str(s.restart))}`);
    if (s.working_dir) parts.push(`-w ${q(str(s.working_dir))}`);
    if (s.user) parts.push(`-u ${q(str(s.user))}`);
    if (s.hostname) parts.push(`-h ${q(str(s.hostname))}`);
    for (const l of list(s.labels)) parts.push(`-l ${q(l)}`);
    for (const h of list(s.extra_hosts)) parts.push(`--add-host ${q(h)}`);
    for (const c of list(s.cap_add)) parts.push(`--cap-add ${q(c)}`);
    for (const d of list(s.devices)) parts.push(`--device ${q(d)}`);
    if (s.privileged) parts.push('--privileged');
    if (s.tty) parts.push('-t');
    if (s.stdin_open) parts.push('-i');
    if (s.mem_limit) parts.push(`-m ${q(str(s.mem_limit))}`);
    if (s.cpus) parts.push(`--cpus ${q(str(s.cpus))}`);
    if (s.entrypoint)
      parts.push(`--entrypoint ${q(Array.isArray(s.entrypoint) ? s.entrypoint.join(' ') : str(s.entrypoint))}`);
    parts.push(q(str(s.image)));
    if (s.command) parts.push(...(Array.isArray(s.command) ? s.command.map((x) => q(String(x))) : [str(s.command)]));
    cmds.push(parts.join(' \\\n  '));
  }
  return cmds.join('\n\n');
}
