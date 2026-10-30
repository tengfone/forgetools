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
  /** Never record this tool's input in the opt-in history (secrets, keys, passwords). */
  noHistory?: boolean;
  sampleData?: string;
  /** Editor tools with alternate modes (e.g. Format | Minify); first is the default. */
  modes?: { id: string; label: string }[];
  format?: (input: string, indent?: number, mode?: string) => string | Promise<string>;
  /**
   * Lazily loaded custom UI module (code-split per tool). `render` may return a dispose
   * function; the shell calls it when the tool is closed (switch, Home).
   */
  load?: () => Promise<{ render: (container: HTMLElement) => ToolDispose | void }>;
}

export type ToolDispose = () => void;

export interface ToolsRegistry {
  [key: string]: Tool;
}
