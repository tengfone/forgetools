export type ToolCategory = 'Formatters' | 'Encoders' | 'Converters' | 'Analyzers' | 'Generators' | 'Text Tools';

export interface Tool {
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  icon: string;
  language?: string;
  useCustomUI?: boolean;
  hasMode?: boolean;
  encodeText?: string;
  decodeText?: string;
  autoRun?: boolean;
  customOutput?: boolean;
  placeholder?: string;
  sampleData?: string;
  format?: (input: string) => string | Promise<string>;
  render?: (container: HTMLElement) => void;
}

export interface ToolsRegistry {
  [key: string]: Tool;
}

declare global {
  interface Window {
    tools?: ToolsRegistry;
    monaco?: typeof import('monaco-editor');
    diffEditor?: import('monaco-editor').editor.IStandaloneDiffEditor;
    monacoPath?: string;
  }
}

