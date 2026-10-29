// Runs regex matching off the main thread so catastrophic backtracking can be killed.
interface Req { seq: number; pattern: string; flags: string; text: string; max: number }
interface Match { index: number; groups: (string | null)[] }

self.onmessage = (e: MessageEvent<Req>): void => {
    const { seq, pattern, flags, text, max } = e.data;
    try {
        const regex = new RegExp(pattern, flags);
        const matches: Match[] = [];
        let capped = false;
        const push = (m: RegExpExecArray): void => { matches.push({ index: m.index, groups: Array.from(m, g => g ?? null) }); };
        if (!regex.global) {
            const m = regex.exec(text);
            if (m) push(m);
        } else {
            let m: RegExpExecArray | null;
            while ((m = regex.exec(text)) !== null) {
                if (matches.length >= max) { capped = true; break; }
                push(m);
                if (m[0].length === 0) regex.lastIndex++;
            }
        }
        self.postMessage({ seq, matches, capped });
    } catch (err) {
        self.postMessage({ seq, error: err instanceof Error ? err.message : String(err) });
    }
};
