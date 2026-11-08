import { $, $f, esc, reportOk, reportError, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton, select } from './common';
import {
  MCP_CLIENTS,
  renderConfig,
  readConfig,
  splitCommand,
  parsePairs,
  checkServer,
  type McpClient,
  type McpServer,
} from '../lib/mcp';

const clientChoices = MCP_CLIENTS.map(([v, l]): [string, string] => [v, l]);

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                ${select('mcp-mode', 'Mode', [
                  ['build', 'Build a server entry'],
                  ['convert', 'Convert an existing config'],
                ])}
                ${select('mcp-client', 'Client', clientChoices)}
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="mcp-in-label">Server</h3>
                        ${inputActions({ sample: 'mcp-sample', clear: 'mcp-clear' })}
                    </div>
                    <div id="mcp-build">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="ui-label" for="mcp-name">Name</label><input type="text" class="form-control font-mono" id="mcp-name" placeholder="github"></div>
                            <div><label class="ui-label" for="mcp-transport">Transport</label><select id="mcp-transport" class="form-control cursor-pointer">
                              <option value="stdio">stdio (local)</option>
                              <option value="http">HTTP (remote)</option>
                              <option value="sse">SSE (legacy)</option>
                            </select></div>
                        </div>
                        <div class="mt-3" data-for="stdio"><label class="ui-label" for="mcp-cmd">Command</label><input type="text" class="form-control font-mono" id="mcp-cmd" placeholder="npx -y @modelcontextprotocol/server-github"></div>
                        <div class="mt-3" data-for="remote" hidden><label class="ui-label" for="mcp-url">URL</label><input type="text" class="form-control font-mono" id="mcp-url" placeholder="https://mcp.example.com/mcp"></div>
                        <div class="mt-3"><label class="ui-label" for="mcp-pairs" id="mcp-pairs-label">Environment variables (KEY=value per line)</label><textarea class="form-control font-mono" id="mcp-pairs" rows="4" spellcheck="false" placeholder="GITHUB_TOKEN=\${GITHUB_TOKEN}"></textarea></div>
                    </div>
                    <div id="mcp-convert" hidden>
                        <textarea class="form-control font-mono" id="mcp-input" rows="13" spellcheck="false" aria-labelledby="mcp-in-label" placeholder="Paste claude_desktop_config.json, .mcp.json, .cursor/mcp.json or .vscode/mcp.json..."></textarea>
                    </div>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="mcp-out-label">Config</h3>
                        ${copyButton('mcp-output')}
                    </div>
                    <p class="ui-meta mb-2" id="mcp-file"></p>
                    <textarea class="form-control font-mono" id="mcp-output" rows="13" aria-labelledby="mcp-out-label" readonly data-output spellcheck="false"></textarea>
                    <ul class="tsch-warn mt-2" id="mcp-warn" aria-live="polite"></ul>
                </div>
            </div>
        </div>`;

  const mode = $<HTMLSelectElement>('mcp-mode');
  const client = $<HTMLSelectElement>('mcp-client');
  const transport = $<HTMLSelectElement>('mcp-transport');
  const output = $f('mcp-output');
  const warn = $('mcp-warn');

  const server = (): McpServer => {
    const t = transport.value as McpServer['transport'];
    const pairs = parsePairs($f('mcp-pairs').value);
    const name = $f('mcp-name').value.trim() || 'my-server';
    if (t === 'stdio') {
      const [command, ...args] = splitCommand($f('mcp-cmd').value);
      return { name, transport: t, command, args, env: pairs };
    }
    return { name, transport: t, url: $f('mcp-url').value.trim(), headers: pairs };
  };

  const update = (): void => {
    const building = mode.value === 'build';
    $('mcp-build').hidden = !building;
    $('mcp-convert').hidden = building;
    const remote = transport.value !== 'stdio';
    container.querySelector<HTMLElement>('[data-for="stdio"]')!.hidden = remote;
    container.querySelector<HTMLElement>('[data-for="remote"]')!.hidden = !remote;
    $('mcp-pairs-label').textContent = remote
      ? 'HTTP headers (Name: value per line)'
      : 'Environment variables (KEY=value per line)';
    const c = client.value as McpClient;
    $('mcp-file').textContent = `File: ${MCP_CLIENTS.find(([v]) => v === c)?.[2] ?? ''}`;
    try {
      let servers: McpServer[];
      if (building) {
        if (!$f('mcp-cmd').value.trim() && !$f('mcp-url').value.trim()) {
          output.value = '';
          warn.innerHTML = '';
          resetStatus();
          return;
        }
        servers = [server()];
      } else {
        const src = $f('mcp-input').value.trim();
        if (!src) {
          output.value = '';
          warn.innerHTML = '';
          setFieldInvalid('mcp-input', false);
          resetStatus();
          return;
        }
        servers = readConfig(src);
        setFieldInvalid('mcp-input', false);
      }
      output.value = renderConfig(servers, c);
      const issues = servers.flatMap((s) => checkServer(s).map((w) => (servers.length > 1 ? `${s.name}: ${w}` : w)));
      if (c === 'claude-desktop' && servers.some((s) => s.transport !== 'stdio'))
        issues.push(
          'Claude Desktop config only launches local servers, so remote ones are bridged with npx mcp-remote',
        );
      warn.innerHTML = issues
        .map((w) => `<li><i class="material-icons icon-sm" aria-hidden="true">warning</i>${esc(w)}</li>`)
        .join('');
      reportOk(`${servers.length} server(s)`, issues.length ? `${issues.length} note(s)` : '');
    } catch (e) {
      if (!building) setFieldInvalid('mcp-input', true);
      reportError(e);
    }
  };
  const live = debounce(update);
  for (const id of ['mcp-name', 'mcp-cmd', 'mcp-url', 'mcp-pairs', 'mcp-input']) $(id).addEventListener('input', live);
  for (const el of [mode, client, transport]) el.addEventListener('change', update);
  $('mcp-sample').onclick = () => {
    if (mode.value === 'build') {
      transport.value = 'stdio';
      $f('mcp-name').value = 'github';
      $f('mcp-cmd').value = 'npx -y @modelcontextprotocol/server-github';
      $f('mcp-pairs').value = 'GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}';
    } else {
      $f('mcp-input').value = JSON.stringify(
        {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/projects'] },
            linear: { url: 'https://mcp.linear.app/sse' },
          },
        },
        null,
        2,
      );
    }
    update();
  };
  $('mcp-clear').onclick = () => clearWithUndo(['mcp-name', 'mcp-cmd', 'mcp-url', 'mcp-pairs', 'mcp-input'], update);
  update();
}
