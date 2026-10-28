export type ToolCategory = 'Inspect & Decode' | 'Format' | 'Convert' | 'Text & Utilities' | 'Generate' | 'Compare';

export interface Tool {
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  icon: string;
  /** Search aliases for the palette and sidebar filter (e.g. "b64", "epoch"). */
  keywords?: string[];
  language?: string;
  useCustomUI?: boolean;
  hasMode?: boolean;
  encodeText?: string;
  decodeText?: string;
  autoRun?: boolean;
  customOutput?: boolean;
  placeholder?: string;
  /** Element id of the custom UI's primary input; receives text handed over from the welcome paste box. */
  primaryInput?: string;
  sampleData?: string;
  /** Editor tools with alternate modes (e.g. Format | Minify); first is the default. */
  modes?: { id: string; label: string }[];
  format?: (input: string, indent?: number, mode?: string) => string | Promise<string>;
  /** Lazily loaded custom UI module (code-split per tool). */
  load?: () => Promise<{ render: (container: HTMLElement) => void }>;
}

export interface ToolsRegistry {
  [key: string]: Tool;
}

declare global {
  interface Window {
    tools?: ToolsRegistry;
    monaco?: typeof import('monaco-editor');
    monacoPath?: string;
  }
}

