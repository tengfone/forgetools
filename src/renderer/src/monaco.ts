// Monaco, bundled as ESM by Vite. Imported only via dynamic import() from the editors module so
// the editor lands in its own chunk and loads the first time an editor-based tool opens.
//
// Only the editor core (editor.api + the standard editor features) plus the tokenizers the tools
// use are pulled in:
//   xml, sql, html, javascript (tools/index.ts `language:`), css + typescript (html/js embeds),
//   json (tokenizer lives in the JSON language feature, not the basic language definitions).
// Each definition registers a lazy loader, so a tokenizer chunk is only fetched when used.
// Editor features: a curated subset of features/register.all.js. ForgeTools' editors are plain
// input/output panes with no language services, so IntelliSense-style contributions (suggest,
// hover, code actions/lens, inlay hints, inline completions, rename, references, diff editor,
// quick access, sticky scroll, GPU...) are left out. This keeps the chunk near its 0.45 size
// (register.all adds ~1 MB in 0.57).
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/caretOperations/browser/transpose.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/features/codicon/register.js';
import 'monaco-editor/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/editor/contrib/dnd/browser/dnd.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/fontZoom/browser/fontZoom.js';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError.js';
import 'monaco-editor/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/editor/contrib/lineSelection/browser/lineSelection.js';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/editor/contrib/links/browser/links.js';
import 'monaco-editor/editor/contrib/longLinesHelper/browser/longLinesHelper.js';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js';
import 'monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js';
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization.js';
import 'monaco-editor/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js';
import 'monaco-editor/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/editor/contrib/wordPartOperations/browser/wordPartOperations.js';
import 'monaco-editor/languages/definitions/xml/register.js';
import 'monaco-editor/languages/definitions/sql/register.js';
import 'monaco-editor/languages/definitions/html/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/css/register.js';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register.js';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

// JSON: keep only main-thread tokenization. Every other mode feature (diagnostics, completion,
// hover, formatting, folding...) needs the large json worker, which is not shipped. ForgeTools
// parses/formats itself and reports errors via the status bar + markers.
jsonDefaults.setModeConfiguration({ tokens: true });
jsonDefaults.setDiagnosticsOptions({ validate: false });

// The editor core's own worker (diff computation, link detection, unicode highlighting) is the
// real one, bundled by Vite as a same-origin module worker (CSP worker-src 'self').
// No language-service workers are shipped, so any other label gets the same editor worker.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export { monaco };
export type Monaco = typeof monaco;
