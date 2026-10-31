// JSON parsing with a labelled error message.

export function parseJsonLabeled(s: string, label: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${(e as Error).message})`);
  }
}
