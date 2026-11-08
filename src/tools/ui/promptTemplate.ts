import { textTool } from './textTool';
import { fillTemplate, parseVars, templateVars, estimateTokens } from '../lib/ai';

export const render = textTool({
  prefix: 'ptpl',
  inputLabel: 'Template',
  outputLabel: 'Rendered prompt',
  placeholder: 'Write a prompt with {{variables}}...',
  fields: [
    {
      id: 'vars',
      label: 'Variables (key=value per line, or a JSON object)',
      rows: 5,
      placeholder: 'language=Python\ncode=print("hi")',
    },
  ],
  sample: {
    input:
      'You are a senior {{language}} reviewer.\n\nReview the code below for bugs and style issues. Reply in {{tone}} tone, at most {{max_points}} points.\n\n```{{language}}\n{{code}}\n```',
    fields: {
      vars: 'language=python\ntone=friendly\nmax_points=5\ncode=def add(a, b):\\n    return a - b',
    },
  },
  run: (tpl, v) => {
    const { text, missing } = fillTemplate(tpl, parseVars(v.vars ?? ''));
    if (missing.length) throw new Error(`Missing value for: ${missing.join(', ')}`);
    return text;
  },
  okMessage: (out, tpl) =>
    `${templateVars(tpl).length} variable(s) filled, ~${estimateTokens(out).toLocaleString()} tokens`,
});
