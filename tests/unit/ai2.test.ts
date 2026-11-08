import { describe, it, expect } from 'vitest';
import { inspect, transcriptText } from '../../src/tools/lib/llm';
import { readToolDef, renderTool, checkTool, tsToSchema } from '../../src/tools/lib/toolSchema';
import { redact, restore } from '../../src/tools/lib/redact';
import { repairJson } from '../../src/tools/lib/json/repair';
import { renderConfig, readConfig, splitCommand, checkServer } from '../../src/tools/lib/mcp';

describe('LLM inspector', () => {
  it('OpenAI chat request with system, tool call and tool result', () => {
    const t = inspect(
      JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Weather in Paris?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
            ],
          },
          { role: 'tool', tool_call_id: 'c1', content: '18C' },
        ],
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }],
      }),
    );
    expect(t.provider).toBe('openai');
    expect(t.system).toBe('Be brief.');
    expect(t.tools).toEqual(['get_weather']);
    expect(t.turns.map((x) => x.role)).toEqual(['user', 'assistant', 'tool']);
    expect(t.turns[1]!.parts[0]).toMatchObject({ kind: 'tool_call', name: 'get_weather' });
    expect(transcriptText(t)).toContain('"city": "Paris"');
  });

  it('Anthropic request and response', () => {
    const req = inspect(
      JSON.stringify({
        model: 'claude-sonnet-4',
        system: 'You are terse.',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'lookup', input: { q: 1 } }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
        ],
      }),
    );
    expect(req.provider).toBe('anthropic');
    expect(req.turns.map((x) => x.role)).toEqual(['user', 'assistant', 'tool']);
    const res = inspect(
      JSON.stringify({
        type: 'message',
        role: 'assistant',
        model: 'claude',
        content: [{ type: 'text', text: 'Hello' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    );
    expect(res.source).toBe('response');
    expect(res.stopReason).toBe('end_turn');
    expect(res.usage).toEqual({ input_tokens: 5, output_tokens: 2 });
  });

  it('Gemini request', () => {
    const t = inspect(
      JSON.stringify({
        systemInstruction: { parts: [{ text: 'sys' }] },
        contents: [
          { role: 'user', parts: [{ text: 'hi' }] },
          { role: 'model', parts: [{ functionCall: { name: 'f', args: { a: 1 } } }] },
        ],
      }),
    );
    expect(t.provider).toBe('gemini');
    expect(t.system).toBe('sys');
    expect(t.turns[1]!.parts[0]!.kind).toBe('tool_call');
  });

  it('reassembles an OpenAI stream with text and streamed tool-call arguments', () => {
    const chunk = (d: object, finish: string | null = null): string =>
      `data: ${JSON.stringify({ object: 'chat.completion.chunk', model: 'gpt-4o', choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`;
    const sse =
      chunk({ role: 'assistant', content: 'Hel' }) +
      chunk({ content: 'lo' }) +
      chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'f', arguments: '{"a"' } }] }) +
      chunk({ tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }, 'tool_calls') +
      'data: [DONE]\n\n';
    const t = inspect(sse);
    expect(t.source).toBe('stream');
    expect(t.stopReason).toBe('tool_calls');
    expect(t.turns[0]!.parts[0]!.text).toBe('Hello');
    expect(t.turns[0]!.parts[1]).toMatchObject({ kind: 'tool_call', name: 'f', text: '{\n  "a": 1\n}' });
  });

  it('reassembles an Anthropic stream', () => {
    const ev = (type: string, o: object): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...o })}\n\n`;
    const sse =
      ev('message_start', { message: { model: 'claude', usage: { input_tokens: 9 } } }) +
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hi ' } }) +
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'there' } }) +
      ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 't', name: 'g', input: {} } }) +
      ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"x":' } }) +
      ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '2}' } }) +
      ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } });
    const t = inspect(sse);
    expect(t.provider).toBe('anthropic');
    expect(t.turns[0]!.parts.map((p) => p.text)).toEqual(['Hi there', '{\n  "x": 2\n}']);
    expect(t.usage).toEqual({ input_tokens: 9, output_tokens: 7 });
    expect(t.stopReason).toBe('tool_use');
  });

  it('rejects unrelated JSON', () => {
    expect(() => inspect('{"a":1}')).toThrow(/Not a recognised/);
  });
});

describe('tool schema', () => {
  it('converts between provider formats', () => {
    const { def, from } = readToolDef({
      name: 'get_weather',
      description: 'Get weather',
      input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    });
    expect(from).toBe('Anthropic tool');
    expect(renderTool(def, 'openai')).toMatchObject({ type: 'function', function: { name: 'get_weather' } });
    expect(renderTool(def, 'mcp')).toHaveProperty('inputSchema');
    expect(checkTool(def, 'openai')).toEqual([]);
  });
  it('strict mode makes optional fields nullable and required', () => {
    const def = {
      name: 'f',
      description: 'd',
      parameters: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer' } }, required: ['a'] },
    };
    const out = renderTool(def, 'openai', { strict: true }) as { function: { parameters: Record<string, unknown> } };
    expect(out.function.parameters).toMatchObject({
      required: ['a', 'b'],
      additionalProperties: false,
      properties: { b: { type: ['integer', 'null'] } },
    });
  });
  it('gemini drops unsupported keywords and flags names', () => {
    const def = {
      name: 'bad name',
      description: '',
      parameters: { type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'] } } },
    };
    expect(renderTool(def, 'gemini')).toEqual({
      functionDeclarations: [
        {
          name: 'bad name',
          description: '',
          parameters: { type: 'object', properties: { a: { type: 'string', nullable: true } } },
        },
      ],
    });
    expect(checkTool(def, 'gemini')).toHaveLength(2);
  });
  it('TypeScript interface to schema', () => {
    const s = tsToSchema(`interface Args {
      /** City name */
      city: string;
      units?: 'c' | 'f';
      days: number[];
      when: Date | null;
    }`);
    expect(s).toEqual({
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        units: { type: 'string', enum: ['c', 'f'] },
        days: { type: 'array', items: { type: 'number' } },
        when: { type: ['string', 'null'], format: 'date-time' },
      },
      required: ['city', 'days', 'when'],
    });
  });
});

describe('redactor', () => {
  it('replaces secrets with stable placeholders and restores them', () => {
    const src =
      'Email ada@example.com or ada@example.com, key sk-proj-abcdefghijklmnopqrstuvwx, ip 10.0.0.12, card 4242 4242 4242 4242, password=hunter22';
    const r = redact(src);
    expect(r.text).toBe('Email <EMAIL_1> or <EMAIL_1>, key <API_KEY_1>, ip <IP_1>, card <CARD_1>, password=<SECRET_1>');
    expect(restore(r.text, r.map)).toBe(src);
  });
  it('phone numbers in common formats, not plain numbers', () => {
    expect(redact('call +65 9123 4567 or (555) 123-4567').text).toBe('call <PHONE_1> or <PHONE_2>');
    expect(redact('order 20240601 qty 1500').text).toBe('order 20240601 qty 1500');
  });
  it('respects disabled rules and Luhn', () => {
    expect(redact('a@b.co', new Set(['IP'])).text).toBe('a@b.co');
    expect(redact('order 1234 5678 9012 3456').text).not.toContain('<CARD_');
  });
});

describe('json repair', () => {
  it('extracts from fences and prose and fixes common breakage', () => {
    const r = repairJson(
      "Sure! Here you go:\n```json\n{name: 'Ada', tags: ['a', 'b',], ok: True, // note\n}\n```\nHope that helps",
    );
    expect(r.value).toEqual({ name: 'Ada', tags: ['a', 'b'], ok: true });
    expect(r.fixes).toEqual(
      expect.arrayContaining(['Took the content of the code fence', 'Quoted bare keys', 'Removed trailing commas']),
    );
  });
  it('closes truncated output', () => {
    expect(repairJson('{"a": [1, 2, {"b": "unfinished').value).toEqual({ a: [1, 2, { b: 'unfinished' }] });
    expect(repairJson('{"a": 1, "b":').value).toEqual({ a: 1 });
  });
  it('valid JSON passes through without fixes', () => {
    expect(repairJson('[1,2]').fixes).toEqual([]);
  });
});

describe('mcp config', () => {
  it('renders per client and round-trips', () => {
    const servers = [
      {
        name: 'fs',
        transport: 'stdio' as const,
        command: 'npx',
        args: splitCommand('-y @modelcontextprotocol/server-filesystem "C:/my docs"'),
      },
      { name: 'remote', transport: 'http' as const, url: 'https://mcp.example.com/mcp' },
    ];
    expect(servers[0]!.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', 'C:/my docs']);
    const vs = JSON.parse(renderConfig(servers, 'vscode')) as { servers: Record<string, unknown> };
    expect(vs.servers.remote).toEqual({ type: 'http', url: 'https://mcp.example.com/mcp' });
    const cd = renderConfig(servers, 'claude-desktop');
    expect(cd).toContain('mcp-remote');
    expect(readConfig(cd)).toEqual([
      { name: 'fs', transport: 'stdio', command: 'npx', args: servers[0]!.args, env: undefined },
      { name: 'remote', transport: 'http', url: 'https://mcp.example.com/mcp', headers: {} },
    ]);
  });
  it('warns about literal secrets', () => {
    expect(checkServer({ name: 'x', transport: 'stdio', command: 'node', env: { API_KEY: 'abc123' } })).toHaveLength(1);
  });
});
