import { textTool } from './textTool';
import { beautifyCss, beautifyJs, minifyCss, minifyJs } from '../lib/format';

export const render = textTool({
  prefix: 'cjs',
  inputLabel: 'Code',
  outputLabel: 'Result',
  options: [
    {
      id: 'lang',
      label: 'Language',
      choices: [
        ['css', 'CSS / SCSS'],
        ['js', 'JavaScript'],
      ],
    },
    {
      id: 'mode',
      label: 'Mode',
      choices: [
        ['pretty', 'Beautify'],
        ['min', 'Minify'],
      ],
    },
  ],
  sample: {
    input: '.btn{color:#fff;background:#0af}\n.btn:hover{background:#08c;transform:translateY(-1px)}',
    options: { lang: 'css', mode: 'pretty' },
  },
  run: (s, v) =>
    v.lang === 'css'
      ? v.mode === 'min'
        ? minifyCss(s)
        : beautifyCss(s)
      : v.mode === 'min'
        ? minifyJs(s)
        : beautifyJs(s),
  okMessage: (o, i) => `${i.length} → ${o.length} chars`,
});
