// LLM Inspector: normalise OpenAI / Anthropic / Gemini request, response and SSE stream
// payloads into one readable transcript. Pure functions, no network.

export type Provider = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'unknown';

export interface Part {
  kind: 'text' | 'tool_call' | 'tool_result' | 'image' | 'thinking' | 'other';
  text: string;
  /** Tool name for calls/results. */
  name?: string;
  id?: string;
}

export interface Turn {
  role: string;
  parts: Part[];
}

export interface Transcript {
  provider: Provider;
  source: 'request' | 'response' | 'stream';
  model?: string;
  system?: string;
  tools?: string[];
  turns: Turn[];
  usage?: Record<string, number>;
  stopReason?: string;
  /** Extra notes (e.g. how many stream events were merged). */
  notes: string[];
}

type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v, null, 2));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tryParseArgs(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function numbers(o: unknown): Record<string, number> | undefined {
  if (!isObj(o)) return undefined;
  const out: Record<string, number> = {};
  const walk = (x: O, prefix: string): void => {
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'number') out[prefix + k] = v;
      else if (isObj(v)) walk(v, `${prefix}${k}.`);
    }
  };
  walk(o, '');
  return Object.keys(out).length ? out : undefined;
}

// ---- OpenAI Chat Completions ----
function openaiContent(c: unknown): Part[] {
  if (typeof c === 'string') return c ? [{ kind: 'text', text: c }] : [];
  return arr(c).map((p): Part => {
    if (!isObj(p)) return { kind: 'other', text: str(p) };
    if (p.type === 'text' || p.type === 'input_text' || p.type === 'output_text')
      return { kind: 'text', text: str(p.text) };
    if (p.type === 'image_url' || p.type === 'input_image') {
      const url = isObj(p.image_url) ? str(p.image_url.url) : str(p.image_url);
      return { kind: 'image', text: url.startsWith('data:') ? `${url.slice(0, 40)}… (inline image)` : url };
    }
    return { kind: 'other', text: str(p) };
  });
}

function openaiMessage(m: O): Turn {
  const parts = openaiContent(m.content);
  for (const tc of arr(m.tool_calls)) {
    if (!isObj(tc)) continue;
    const fn = isObj(tc.function) ? tc.function : {};
    parts.push({ kind: 'tool_call', name: str(fn.name), id: str(tc.id), text: tryParseArgs(str(fn.arguments)) });
  }
  if (isObj(m.function_call))
    parts.push({
      kind: 'tool_call',
      name: str(m.function_call.name),
      text: tryParseArgs(str(m.function_call.arguments)),
    });
  const role = str(m.role) || 'assistant';
  if (role === 'tool' || role === 'function')
    return {
      role: 'tool',
      parts: parts.map((p) => ({ ...p, kind: 'tool_result', id: str(m.tool_call_id), name: str(m.name) || undefined })),
    };
  if (typeof m.refusal === 'string' && m.refusal) parts.push({ kind: 'text', text: `[refusal] ${m.refusal}` });
  return { role, parts };
}

// ---- Anthropic Messages ----
function anthropicContent(c: unknown): Part[] {
  if (typeof c === 'string') return c ? [{ kind: 'text', text: c }] : [];
  return arr(c).map((b): Part => {
    if (!isObj(b)) return { kind: 'other', text: str(b) };
    switch (b.type) {
      case 'text':
        return { kind: 'text', text: str(b.text) };
      case 'thinking':
        return { kind: 'thinking', text: str(b.thinking) };
      case 'redacted_thinking':
        return { kind: 'thinking', text: '[redacted thinking]' };
      case 'tool_use':
      case 'server_tool_use':
        return { kind: 'tool_call', name: str(b.name), id: str(b.id), text: JSON.stringify(b.input ?? {}, null, 2) };
      case 'tool_result': {
        const inner =
          typeof b.content === 'string'
            ? b.content
            : anthropicContent(b.content)
                .map((p) => p.text)
                .join('\n');
        return { kind: 'tool_result', id: str(b.tool_use_id), text: (b.is_error ? '[error] ' : '') + inner };
      }
      case 'image':
      case 'document':
        return {
          kind: 'image',
          text: `[${str(b.type)}${isObj(b.source) ? `: ${str(b.source.media_type || b.source.type)}` : ''}]`,
        };
      default:
        return { kind: 'other', text: str(b) };
    }
  });
}

const anthropicSystem = (s: unknown): string | undefined =>
  typeof s === 'string' ? s : Array.isArray(s) ? s.map((b) => (isObj(b) ? str(b.text) : str(b))).join('\n') : undefined;

// ---- Gemini ----
function geminiParts(ps: unknown): Part[] {
  return arr(ps).map((p): Part => {
    if (!isObj(p)) return { kind: 'other', text: str(p) };
    if (typeof p.text === 'string') return { kind: p.thought ? 'thinking' : 'text', text: p.text };
    if (isObj(p.functionCall))
      return {
        kind: 'tool_call',
        name: str(p.functionCall.name),
        text: JSON.stringify(p.functionCall.args ?? {}, null, 2),
      };
    if (isObj(p.functionResponse))
      return {
        kind: 'tool_result',
        name: str(p.functionResponse.name),
        text: JSON.stringify(p.functionResponse.response ?? {}, null, 2),
      };
    if (isObj(p.inlineData)) return { kind: 'image', text: `[inline ${str(p.inlineData.mimeType)}]` };
    if (isObj(p.fileData)) return { kind: 'image', text: str(p.fileData.fileUri) };
    return { kind: 'other', text: str(p) };
  });
}

const toolNames = (tools: unknown): string[] | undefined => {
  const names: string[] = [];
  for (const t of arr(tools)) {
    if (!isObj(t)) continue;
    if (isObj(t.function)) names.push(str(t.function.name));
    else if (Array.isArray(t.functionDeclarations))
      for (const f of t.functionDeclarations)
        if (isObj(f)) names.push(str(f.name));
        else if (typeof t.name === 'string') names.push(t.name);
        else if (typeof t.type === 'string') names.push(t.type);
  }
  return names.length ? names : undefined;
};

/** Inspect a parsed JSON payload. */
export function inspectJson(v: unknown): Transcript {
  // An exported conversation: plain array of messages.
  if (Array.isArray(v)) v = { messages: v };
  if (!isObj(v)) throw new Error('Expected a JSON object (request or response body) or an array of messages');
  const t: Transcript = { provider: 'unknown', source: 'request', turns: [], notes: [] };
  if (typeof v.model === 'string') t.model = v.model;

  // Responses
  if (Array.isArray(v.choices)) {
    t.provider = 'openai';
    t.source = 'response';
    for (const c of v.choices) {
      if (!isObj(c)) continue;
      if (isObj(c.message)) t.turns.push(openaiMessage(c.message));
      if (typeof c.finish_reason === 'string') t.stopReason = c.finish_reason;
    }
    t.usage = numbers(v.usage);
    return t;
  }
  if (v.type === 'message' && Array.isArray(v.content)) {
    t.provider = 'anthropic';
    t.source = 'response';
    t.turns.push({ role: str(v.role) || 'assistant', parts: anthropicContent(v.content) });
    t.usage = numbers(v.usage);
    if (typeof v.stop_reason === 'string') t.stopReason = v.stop_reason;
    return t;
  }
  if (Array.isArray(v.candidates)) {
    t.provider = 'gemini';
    t.source = 'response';
    for (const c of v.candidates) {
      if (!isObj(c)) continue;
      const content = isObj(c.content) ? c.content : {};
      t.turns.push({ role: str(content.role) || 'model', parts: geminiParts(content.parts) });
      if (typeof c.finishReason === 'string') t.stopReason = c.finishReason;
    }
    t.usage = numbers(v.usageMetadata);
    if (typeof v.modelVersion === 'string') t.model = v.modelVersion;
    return t;
  }
  if (v.object === 'response' && Array.isArray(v.output)) {
    t.provider = 'openai-responses';
    t.source = 'response';
    t.turns.push(...responsesItems(v.output));
    t.usage = numbers(v.usage);
    if (typeof v.status === 'string') t.stopReason = v.status;
    return t;
  }

  // Requests
  t.tools = toolNames(v.tools);
  if (Array.isArray(v.contents)) {
    t.provider = 'gemini';
    const si = v.systemInstruction ?? v.system_instruction;
    if (isObj(si))
      t.system = geminiParts(si.parts)
        .map((p) => p.text)
        .join('\n');
    for (const c of v.contents)
      if (isObj(c)) t.turns.push({ role: str(c.role) || 'user', parts: geminiParts(c.parts) });
    return t;
  }
  if (v.input !== undefined && v.messages === undefined) {
    t.provider = 'openai-responses';
    if (typeof v.instructions === 'string') t.system = v.instructions;
    if (typeof v.input === 'string') t.turns.push({ role: 'user', parts: [{ kind: 'text', text: v.input }] });
    else t.turns.push(...responsesItems(v.input));
    return t;
  }
  if (Array.isArray(v.messages)) {
    const msgs = v.messages.filter(isObj);
    const anthropicLike =
      v.system !== undefined ||
      msgs.some((m) =>
        arr(m.content).some(
          (b) =>
            isObj(b) &&
            (['tool_use', 'tool_result', 'thinking', 'redacted_thinking'].includes(str(b.type)) ||
              (b.type === 'image' && isObj(b.source))),
        ),
      );
    if (anthropicLike) {
      t.provider = 'anthropic';
      t.system = anthropicSystem(v.system);
      for (const m of msgs) {
        const parts = anthropicContent(m.content);
        const allResults = parts.length > 0 && parts.every((p) => p.kind === 'tool_result');
        t.turns.push({ role: allResults ? 'tool' : str(m.role), parts });
      }
    } else {
      t.provider = 'openai';
      for (const m of msgs) {
        const turn = openaiMessage(m);
        if ((turn.role === 'system' || turn.role === 'developer') && t.system === undefined && t.turns.length === 0) {
          t.system = turn.parts.map((p) => p.text).join('\n');
        } else t.turns.push(turn);
      }
    }
    return t;
  }
  throw new Error(
    'Not a recognised LLM payload (expected messages, contents, input, choices, candidates or a Messages response)',
  );
}

function responsesItems(items: unknown): Turn[] {
  const turns: Turn[] = [];
  for (const it of arr(items)) {
    if (!isObj(it)) continue;
    if (it.type === 'message' || (it.role && it.content !== undefined))
      turns.push({ role: str(it.role) || 'assistant', parts: openaiContent(it.content) });
    else if (it.type === 'function_call')
      turns.push({
        role: 'assistant',
        parts: [{ kind: 'tool_call', name: str(it.name), id: str(it.call_id), text: tryParseArgs(str(it.arguments)) }],
      });
    else if (it.type === 'function_call_output')
      turns.push({
        role: 'tool',
        parts: [{ kind: 'tool_result', id: str(it.call_id), text: tryParseArgs(str(it.output)) }],
      });
    else if (it.type === 'reasoning')
      turns.push({
        role: 'assistant',
        parts: [
          {
            kind: 'thinking',
            text:
              arr(it.summary)
                .map((s) => (isObj(s) ? str(s.text) : ''))
                .join('\n') || '[reasoning]',
          },
        ],
      });
    else turns.push({ role: 'other', parts: [{ kind: 'other', text: str(it) }] });
  }
  return turns;
}

/** Parse an SSE body (`data: {...}` lines) into JSON events; `[DONE]` and comments are skipped. */
export function parseSse(src: string): unknown[] {
  const events: unknown[] = [];
  let buf: string[] = [];
  const flush = (): void => {
    if (!buf.length) return;
    const data = buf.join('\n').trim();
    buf = [];
    if (!data || data === '[DONE]') return;
    try {
      events.push(JSON.parse(data));
    } catch {
      throw new Error(`Event is not JSON: ${data.slice(0, 80)}`);
    }
  };
  for (const line of src.split(/\r?\n/)) {
    if (!line.trim()) flush();
    else if (line.startsWith('data:')) buf.push(line.slice(5).replace(/^ /, ''));
    else if (/^(event|id|retry):|^:/.test(line)) continue;
    else if (/^\s*[{[]/.test(line)) {
      // Bare JSON lines (NDJSON, Gemini streamGenerateContent arrays)
      flush();
      buf.push(line);
      flush();
    }
  }
  flush();
  return events;
}

export const looksLikeSse = (s: string): boolean => /^\s*(data|event):/m.test(s);

/** Merge streamed chunks into the final message. */
export function reassembleStream(src: string): Transcript {
  return mergeEvents(parseSse(src).flat());
}

function mergeEvents(events: unknown[]): Transcript {
  if (!events.length) throw new Error('No data events found');
  const t: Transcript = { provider: 'unknown', source: 'stream', turns: [], notes: [`${events.length} events merged`] };
  const first = events.find(isObj);

  // Anthropic: message_start / content_block_* / message_delta
  if (events.some((e) => isObj(e) && typeof e.type === 'string' && e.type.startsWith('content_block'))) {
    t.provider = 'anthropic';
    const blocks: Array<{ type: string; text: string; name?: string; id?: string }> = [];
    let usage: O = {};
    for (const e of events) {
      if (!isObj(e)) continue;
      if (e.type === 'message_start' && isObj(e.message)) {
        t.model = str(e.message.model) || undefined;
        if (isObj(e.message.usage)) usage = { ...usage, ...e.message.usage };
      } else if (e.type === 'content_block_start' && isObj(e.content_block)) {
        const b = e.content_block;
        blocks[Number(e.index)] = {
          type: str(b.type),
          text: str(b.text ?? b.thinking ?? ''),
          name: str(b.name) || undefined,
          id: str(b.id) || undefined,
        };
      } else if (e.type === 'content_block_delta' && isObj(e.delta)) {
        const b = (blocks[Number(e.index)] ??= { type: 'text', text: '' });
        const d = e.delta;
        b.text += str(d.text ?? d.partial_json ?? d.thinking ?? '');
      } else if (e.type === 'message_delta') {
        if (isObj(e.delta) && typeof e.delta.stop_reason === 'string') t.stopReason = e.delta.stop_reason;
        if (isObj(e.usage)) usage = { ...usage, ...e.usage };
      } else if (e.type === 'error') t.notes.push(`error: ${str(e.error)}`);
    }
    const parts: Part[] = blocks
      .filter(Boolean)
      .map((b) =>
        b.type === 'tool_use' || b.type === 'server_tool_use'
          ? { kind: 'tool_call', name: b.name, id: b.id, text: tryParseArgs(b.text || '{}') }
          : b.type === 'thinking'
            ? { kind: 'thinking', text: b.text }
            : { kind: 'text', text: b.text },
      );
    t.turns.push({ role: 'assistant', parts });
    t.usage = numbers(usage);
    return t;
  }

  // OpenAI Responses API stream
  if (events.some((e) => isObj(e) && typeof e.type === 'string' && e.type.startsWith('response.'))) {
    t.provider = 'openai-responses';
    const done = [...events].reverse().find((e) => isObj(e) && e.type === 'response.completed' && isObj(e.response));
    if (isObj(done) && isObj(done.response)) {
      const r = inspectJson(done.response);
      return { ...r, source: 'stream', notes: t.notes };
    }
    let text = '';
    for (const e of events) if (isObj(e) && e.type === 'response.output_text.delta') text += str(e.delta);
    t.turns.push({ role: 'assistant', parts: [{ kind: 'text', text }] });
    t.notes.push('no response.completed event; text only');
    return t;
  }

  // OpenAI chat.completion.chunk
  if (isObj(first) && (first.object === 'chat.completion.chunk' || Array.isArray(first.choices))) {
    t.provider = 'openai';
    if (typeof first.model === 'string') t.model = first.model;
    let text = '';
    let reasoning = '';
    const calls: Array<{ id?: string; name: string; args: string }> = [];
    for (const e of events) {
      if (!isObj(e)) continue;
      if (isObj(e.usage)) t.usage = numbers(e.usage);
      for (const c of arr(e.choices)) {
        if (!isObj(c)) continue;
        if (typeof c.finish_reason === 'string') t.stopReason = c.finish_reason;
        const d = isObj(c.delta) ? c.delta : {};
        if (typeof d.content === 'string') text += d.content;
        if (typeof d.reasoning_content === 'string') reasoning += d.reasoning_content;
        for (const tc of arr(d.tool_calls)) {
          if (!isObj(tc)) continue;
          const i = typeof tc.index === 'number' ? tc.index : calls.length;
          const call = (calls[i] ??= { name: '', args: '' });
          if (typeof tc.id === 'string') call.id = tc.id;
          if (isObj(tc.function)) {
            if (typeof tc.function.name === 'string') call.name += tc.function.name;
            if (typeof tc.function.arguments === 'string') call.args += tc.function.arguments;
          }
        }
      }
    }
    const parts: Part[] = [];
    if (reasoning) parts.push({ kind: 'thinking', text: reasoning });
    if (text) parts.push({ kind: 'text', text });
    for (const c of calls.filter(Boolean))
      parts.push({ kind: 'tool_call', name: c.name, id: c.id, text: tryParseArgs(c.args) });
    t.turns.push({ role: 'assistant', parts });
    return t;
  }

  // Gemini: each chunk is a full GenerateContentResponse with partial text
  if (isObj(first) && Array.isArray(first.candidates)) {
    t.provider = 'gemini';
    const parts: Part[] = [];
    for (const e of events) {
      if (!isObj(e)) continue;
      {
        const turn = inspectJson(e);
        if (turn.usage) t.usage = turn.usage;
        if (turn.stopReason) t.stopReason = turn.stopReason;
        if (turn.model) t.model = turn.model;
        for (const p of turn.turns.flatMap((x) => x.parts)) {
          const last = parts[parts.length - 1];
          if (last && p.kind === 'text' && last.kind === 'text') last.text += p.text;
          else parts.push({ ...p });
        }
      }
    }
    t.turns.push({ role: 'model', parts });
    return t;
  }
  throw new Error('Unrecognised stream format (expected OpenAI, Anthropic or Gemini events)');
}

/** Entry point: SSE text or JSON. */
export function inspect(src: string): Transcript {
  const s = src.trim();
  if (!s) throw new Error('Paste a request, response or stream');
  if (looksLikeSse(s)) return reassembleStream(s);
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch (e) {
    // NDJSON stream without data: prefixes
    if (s.split(/\r?\n/).filter((l) => l.trim()).length > 1) return reassembleStream(s);
    throw e;
  }
  if (
    Array.isArray(v) &&
    v.length &&
    v.every((e) => isObj(e) && (Array.isArray(e.candidates) || e.object === 'chat.completion.chunk'))
  )
    return mergeEvents(v);
  return inspectJson(v);
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
  anthropic: 'Anthropic Messages',
  gemini: 'Google Gemini',
  unknown: 'Unknown',
};

/** Plain-text transcript (for Copy and for tests). */
export function transcriptText(t: Transcript): string {
  const out: string[] = [];
  if (t.system) out.push(`## system\n${t.system}`);
  for (const turn of t.turns) {
    const body = turn.parts
      .map((p) =>
        p.kind === 'text'
          ? p.text
          : p.kind === 'tool_call'
            ? `→ call ${p.name ?? ''}${p.id ? ` (${p.id})` : ''}\n${p.text}`
            : p.kind === 'tool_result'
              ? `← result${p.name ? ` ${p.name}` : ''}${p.id ? ` (${p.id})` : ''}\n${p.text}`
              : `[${p.kind}] ${p.text}`,
      )
      .join('\n\n');
    out.push(`## ${turn.role}\n${body}`);
  }
  return out.join('\n\n');
}
