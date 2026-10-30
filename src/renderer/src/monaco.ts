// Monaco, bundled as ESM by Vite. Imported only via dynamic import() from app.ts so the editor
// lands in its own chunk and loads the first time an editor-based tool opens.
//
// Only the editor core (editor.api + editor.all contributions) plus the tokenizers the tools use
// are pulled in, matching the language set the old AMD copy shipped:
//   xml, sql, html, javascript (tools/index.ts `language:`), css + typescript (html/js embeds),
//   json (tokenizer lives in the JSON language contribution, not basic-languages).
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';

// JSON: keep only main-thread tokenization. Every other mode feature (diagnostics, completion,
// hover, formatting, folding...) needs the large json worker, which is not shipped. ForgeTools
// parses/formats itself and reports errors via the status bar + markers.
monaco.languages.json.jsonDefaults.setModeConfiguration({ tokens: true });
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });

// The editor core's own worker (diff computation, link detection, unicode highlighting) is the
// real one, bundled by Vite as a same-origin module worker (CSP worker-src 'self').
// No language-service workers are shipped, so any other label gets the same editor worker.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
};

export { monaco };
export type Monaco = typeof monaco;
