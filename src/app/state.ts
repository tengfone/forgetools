import type { Tool, ToolDispose } from '../types/tools';
import tools from '../tools';

/** The few pieces of shell state shared between app/* modules. */
export const state: {
  /** Tool currently open (null on Home). */
  currentTool: Tool | null;
  /** Bumped on every tool switch; guards async tool loads against rendering over a newer one. */
  renderToken: number;
  /** Cleanup returned by the open custom UI's render(). */
  disposeTool: ToolDispose | null;
} = { currentTool: null, renderToken: 0, disposeTool: null };

export const toolById = (id: string | undefined): Tool | undefined => (id ? tools[id] : undefined);
export const allTools = (): Tool[] => Object.values(tools);

/** Run and forget the open tool's dispose hook. */
export function disposeCurrentTool(): void {
  const d = state.disposeTool;
  state.disposeTool = null;
  d?.();
}

/** Selected mode per editor tool (memory only). */
const toolModes = new Map<string, string>();
export const currentMode = (t: Tool): string | undefined =>
  t.modes?.length ? (toolModes.get(t.id) ?? t.modes[0]?.id) : undefined;
export const setMode = (toolId: string, mode: string): void => {
  toolModes.set(toolId, mode);
};

/**
 * Navigation entry points, wired by app.ts. Modules call through these instead of importing
 * app.ts, which keeps the module graph acyclic.
 */
export const nav = {
  openTool: (_id: string): void => {},
  goHome: (): void => {},
  openPalette: (): void => {},
  openSettings: (_opener?: HTMLElement | null): void => {},
  openAbout: (_opener?: HTMLElement | null): void => {},
};
