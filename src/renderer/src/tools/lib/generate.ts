// Generators: fake data, cron builder, .gitignore templates, cheat sheets.

// ── Seeded RNG so "Sample" output is reproducible in tests ─────────────────

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const cryptoRand = (): number => globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;

// ── Fake data ──────────────────────────────────────────────────────────────

const FIRST = 'James Mary Robert Patricia John Jennifer Michael Linda David Elizabeth William Barbara Richard Susan Joseph Jessica Thomas Sarah Charles Karen Wei Mei Hiroshi Yuki Aarav Priya Mohammed Fatima Lucas Sofia Mateo Isabella Liam Emma Noah Olivia Arjun Ananya Chen Li Kenji Sakura Omar Aisha Diego Valentina Ethan Chloe'.split(' ');
const LAST = 'Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Tan Wang Zhang Nguyen Kim Park Patel Sharma Khan Ali Silva Santos Rossi Muller Schmidt Dubois Novak Kowalski Ivanov Tanaka Suzuki Sato Cohen Okafor Mensah'.split(' ');
const STREETS = 'Main Oak Pine Maple Cedar Elm Washington Lake Hill Park Sunset River Spring Church Highland Forest Meadow Bay Orchard Victoria'.split(' ');
const STREET_TYPES = ['St', 'Ave', 'Rd', 'Blvd', 'Ln', 'Dr', 'Way', 'Ct'];
const CITIES: Array<[string, string, string]> = [['Springfield', 'IL', 'US'], ['Portland', 'OR', 'US'], ['Austin', 'TX', 'US'], ['Denver', 'CO', 'US'], ['Seattle', 'WA', 'US'], ['Boston', 'MA', 'US'], ['Toronto', 'ON', 'CA'], ['Vancouver', 'BC', 'CA'], ['London', '', 'GB'], ['Manchester', '', 'GB'], ['Berlin', '', 'DE'], ['Munich', '', 'DE'], ['Paris', '', 'FR'], ['Lyon', '', 'FR'], ['Sydney', 'NSW', 'AU'], ['Melbourne', 'VIC', 'AU'], ['Singapore', '', 'SG'], ['Tokyo', '', 'JP'], ['Osaka', '', 'JP'], ['Amsterdam', '', 'NL']];
const COMPANIES = 'Acme Globex Initech Umbrella Hooli Stark Wayne Wonka Cyberdyne Soylent Vandelay Tyrell Aperture Massive Dynamic Pied Piper Gringotts Oscorp Monarch Contoso Fabrikam Northwind'.split(' ');
const COMPANY_SUFFIX = ['Inc', 'LLC', 'Ltd', 'Corp', 'Group', 'Labs', 'Systems', 'Technologies'];
const DOMAINS = ['example.com', 'example.org', 'example.net', 'test.dev', 'mail.test'];
const JOBS = 'Software Engineer,Product Manager,Data Scientist,DevOps Engineer,Designer,QA Engineer,Engineering Manager,Support Specialist,Sales Executive,Marketing Lead,Security Analyst,Technical Writer'.split(',');
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat'.split(' ');

export const FAKE_FIELDS = ['id', 'uuid', 'firstName', 'lastName', 'fullName', 'email', 'username', 'phone', 'company', 'jobTitle',
    'street', 'city', 'state', 'zip', 'country', 'birthdate', 'createdAt', 'age', 'price', 'boolean', 'ipv4', 'url', 'color', 'sentence'] as const;
export type FakeField = typeof FAKE_FIELDS[number];

export function fakeRecords(count: number, fields: FakeField[], seed?: number): Array<Record<string, string | number | boolean>> {
    const r = seed === undefined ? cryptoRand : mulberry32(seed);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
    const int = (lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
    const hex = (n: number): string => Array.from({ length: n }, () => int(0, 15).toString(16)).join('');
    const rows: Array<Record<string, string | number | boolean>> = [];
    for (let i = 0; i < count; i++) {
        const first = pick(FIRST), last = pick(LAST), [city, state, country] = pick(CITIES);
        const user = `${first}.${last}${int(1, 99)}`.toLowerCase();
        const row: Record<string, string | number | boolean> = {};
        for (const f of fields) {
            switch (f) {
                case 'id': row.id = i + 1; break;
                case 'uuid': row.uuid = `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[int(0, 3)]}${hex(3)}-${hex(12)}`; break;
                case 'firstName': row.firstName = first; break;
                case 'lastName': row.lastName = last; break;
                case 'fullName': row.fullName = `${first} ${last}`; break;
                case 'email': row.email = `${user}@${pick(DOMAINS)}`; break;
                case 'username': row.username = user.replace('.', '_'); break;
                case 'phone': row.phone = `+1-555-${String(int(100, 999))}-${String(int(1000, 9999))}`; break;
                case 'company': row.company = `${pick(COMPANIES)} ${pick(COMPANY_SUFFIX)}`; break;
                case 'jobTitle': row.jobTitle = pick(JOBS); break;
                case 'street': row.street = `${int(1, 9999)} ${pick(STREETS)} ${pick(STREET_TYPES)}`; break;
                case 'city': row.city = city; break;
                case 'state': row.state = state; break;
                case 'zip': row.zip = String(int(10000, 99999)); break;
                case 'country': row.country = country; break;
                case 'birthdate': row.birthdate = new Date(Date.UTC(int(1950, 2005), int(0, 11), int(1, 28))).toISOString().slice(0, 10); break;
                case 'createdAt': row.createdAt = new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 5 * 365 * 86400000)).toISOString(); break;
                case 'age': row.age = int(18, 80); break;
                case 'price': row.price = Math.round(r() * 100000) / 100; break;
                case 'boolean': row.boolean = r() < 0.5; break;
                case 'ipv4': row.ipv4 = `${int(1, 223)}.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`; break;
                case 'url': row.url = `https://${pick(DOMAINS)}/${pick(WORDS)}/${int(1, 999)}`; break;
                case 'color': row.color = '#' + hex(6); break;
                case 'sentence': { const w = Array.from({ length: int(5, 12) }, () => pick(WORDS)).join(' '); row.sentence = w[0]!.toUpperCase() + w.slice(1) + '.'; break; }
            }
        }
        rows.push(row);
    }
    return rows;
}

export type FakeFormat = 'json' | 'csv' | 'sql' | 'ndjson';

export function formatFake(rows: Array<Record<string, string | number | boolean>>, format: FakeFormat, table = 'users'): string {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]!);
    if (format === 'json') return JSON.stringify(rows, null, 2);
    if (format === 'ndjson') return rows.map(r => JSON.stringify(r)).join('\n');
    if (format === 'csv') {
        const cell = (v: unknown): string => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
    }
    const sqlv = (v: unknown): string => (typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`);
    const tbl = /^\w+$/.test(table) ? table : `"${table.replace(/"/g, '""')}"`;
    return `INSERT INTO ${tbl} (${cols.join(', ')}) VALUES\n${rows.map(r => `  (${cols.map(c => sqlv(r[c])).join(', ')})`).join(',\n')};`;
}

// ── Cron builder ───────────────────────────────────────────────────────────

export type CronFreq = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval-minutes' | 'interval-hours';

export interface CronSpec { freq: CronFreq; minute?: number; hour?: number; weekdays?: number[]; dayOfMonth?: number; month?: number; every?: number }

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function rangeList(nums: number[]): string {
    const s = [...new Set(nums)].sort((a, b) => a - b);
    const out: string[] = [];
    for (let i = 0; i < s.length;) {
        let j = i;
        while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++;
        out.push(j - i >= 2 ? `${s[i]}-${s[j]}` : s.slice(i, j + 1).join(','));
        i = j + 1;
    }
    return out.join(',');
}

export interface CronResult { expression: string; description: string; error?: string; note?: string }
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function buildCron(spec: CronSpec): CronResult {
    const m = clamp(spec.minute ?? 0, 0, 59), h = clamp(spec.hour ?? 0, 0, 23);
    const at = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    switch (spec.freq) {
        case 'minute': return { expression: '* * * * *', description: 'Every minute' };
        case 'interval-minutes': { const e = clamp(spec.every ?? 5, 1, 59); return { expression: `*/${e} * * * *`, description: `Every ${e} minute${e > 1 ? 's' : ''}`, ...(60 % e ? { note: `restarts at :00 each hour, so the last gap is ${60 % e} min` } : {}) }; }
        case 'interval-hours': { const e = clamp(spec.every ?? 2, 1, 23); return { expression: `${m} */${e} * * *`, description: `At minute ${m}, every ${e} hour${e > 1 ? 's' : ''}`, ...(24 % e ? { note: `restarts at midnight, so the last gap is ${24 % e} h` } : {}) }; }
        case 'hourly': return { expression: `${m} * * * *`, description: `Every hour at minute ${m}` };
        case 'daily': return { expression: `${m} ${h} * * *`, description: `Every day at ${at}` };
        case 'weekly': {
            const days = spec.weekdays?.length ? spec.weekdays.map(d => clamp(d, 0, 6)) : [1];
            const desc = rangeList(days) === '1-5' ? 'weekdays' : days.length === 7 ? 'every day' : days.map(d => DOW[d]).join(', ');
            return { expression: `${m} ${h} * * ${rangeList(days)}`, description: `At ${at} on ${desc}` };
        }
        case 'monthly': { const d = clamp(spec.dayOfMonth ?? 1, 1, 31); return { expression: `${m} ${h} ${d} * *`, description: `At ${at} on day ${d} of every month`, ...(d >= 29 ? { note: 'skipped in shorter months' } : {}) }; }
        case 'yearly': {
            const d = clamp(spec.dayOfMonth ?? 1, 1, 31), mo = clamp(spec.month ?? 1, 1, 12);
            const base = { expression: `${m} ${h} ${d} ${mo} *`, description: `At ${at} on ${MON[mo - 1]} ${d}` };
            if (d > MONTH_DAYS[mo - 1]!) return { ...base, error: `${MON[mo - 1]} has no day ${d}` };
            return mo === 2 && d === 29 ? { ...base, note: 'leap years only' } : base;
        }
    }
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.floor(Number.isFinite(n) ? n : lo)));

// ── .gitignore ─────────────────────────────────────────────────────────────

export const GITIGNORE: Record<string, string[]> = {
    Node: ['node_modules/', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*', 'pnpm-debug.log*', '.npm/', '.pnpm-store/', '.yarn/cache', '.eslintcache', '*.tsbuildinfo', 'coverage/', '.nyc_output/'],
    Python: ['__pycache__/', '*.py[cod]', '*.so', '.Python', 'build/', 'dist/', '*.egg-info/', '.eggs/', '.venv/', 'venv/', 'env/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/', '.coverage', 'htmlcov/', '.tox/', '.ipynb_checkpoints/'],
    Go: ['*.exe', '*.exe~', '*.dll', '*.so', '*.dylib', '*.test', '*.out', 'go.work', 'go.work.sum', 'vendor/'],
    Rust: ['target/', '**/*.rs.bk', '*.pdb'],
    Java: ['*.class', '*.jar', '*.war', '*.ear', '*.log', 'hs_err_pid*', 'target/', 'build/', '.gradle/', 'out/'],
    DotNet: ['bin/', 'obj/', '*.user', '*.suo', '*.userprefs', '.vs/', '[Dd]ebug/', '[Rr]elease/', '*.nupkg', 'TestResults/', 'project.lock.json'],
    Unity: ['/[Ll]ibrary/', '/[Tt]emp/', '/[Oo]bj/', '/[Bb]uild/', '/[Bb]uilds/', '/[Ll]ogs/', '/[Uu]ser[Ss]ettings/', '/[Mm]emoryCaptures/', '*.csproj', '*.sln', '*.pidb', '*.booproj', '*.apk', '*.aab', 'crashlytics-build.properties'],
    Android: ['*.apk', '*.aab', '*.ap_', '.gradle/', 'build/', 'local.properties', 'captures/', '.externalNativeBuild/', '.cxx/', '*.jks', '*.keystore'],
    'C/C++': ['*.o', '*.obj', '*.a', '*.lib', '*.so', '*.dylib', '*.dll', '*.exe', '*.out', 'build/', 'cmake-build-*/', 'CMakeFiles/', 'CMakeCache.txt', 'compile_commands.json'],
    Terraform: ['.terraform/', '*.tfstate', '*.tfstate.*', 'crash.log', '*.tfvars', '*.tfvars.json', 'override.tf', 'override.tf.json', '.terraformrc', 'terraform.rc'],
    Next: ['.next/', 'out/', 'next-env.d.ts', '.vercel'],
    Vite: ['dist/', 'dist-ssr/', '*.local'],
    Env: ['.env', '.env.*', '!.env.example', '*.pem', '*.key'],
    macOS: ['.DS_Store', '.AppleDouble', '.LSOverride', '._*', '.Spotlight-V100', '.Trashes'],
    Windows: ['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/', '*.lnk'],
    Linux: ['*~', '.fuse_hidden*', '.directory', '.Trash-*', '.nfs*'],
    VSCode: ['.vscode/*', '!.vscode/settings.json', '!.vscode/tasks.json', '!.vscode/launch.json', '!.vscode/extensions.json', '*.code-workspace'],
    JetBrains: ['.idea/', '*.iml', '*.ipr', '*.iws'],
    Logs: ['logs/', '*.log'],
};

export function buildGitignore(names: string[]): string {
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const n of names) {
        const t = GITIGNORE[n];
        if (!t) throw new Error(`Unknown template "${n}"`);
        const lines = t.filter(l => !seen.has(l));
        lines.forEach(l => seen.add(l));
        if (lines.length) blocks.push(`# ${n}\n${lines.join('\n')}`);
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '');
}

// ── Cheat sheets ───────────────────────────────────────────────────────────

export const CHEATSHEETS: Record<string, Array<[string, string]>> = {
    Regex: [['.', 'any char except newline'], ['\\d \\D', 'digit / non-digit'], ['\\w \\W', 'word char / non-word'], ['\\s \\S', 'whitespace / non-whitespace'], ['\\b', 'word boundary'], ['^ $', 'start / end of line'], ['[abc] [^abc]', 'char class / negated'], ['a* a+ a?', '0+, 1+, 0 or 1'], ['a{2,5}', '2 to 5 times'], ['a*? a+?', 'lazy quantifiers'], ['(x) (?:x)', 'capture / non-capture group'], ['(?<name>x)', 'named group'], ['\\1 \\k<name>', 'backreference'], ['x(?=y) x(?!y)', 'lookahead / negative'], ['(?<=y)x (?<!y)x', 'lookbehind / negative'], ['a|b', 'alternation'], ['flags g i m s u y', 'global, ignore case, multiline, dotAll, unicode, sticky']],
    Git: [['git switch -c feat', 'create and switch to branch'], ['git restore file', 'discard working-tree changes'], ['git restore --staged file', 'unstage'], ['git commit --amend --no-edit', 'add staged changes to last commit'], ['git rebase -i HEAD~3', 'squash/reorder last 3 commits'], ['git stash push -m msg', 'stash with a message'], ['git stash pop', 'apply and drop latest stash'], ['git reset --soft HEAD~1', 'undo last commit, keep changes staged'], ['git reflog', 'find lost commits'], ['git cherry-pick <sha>', 'apply a single commit'], ['git log --oneline --graph --all', 'compact history graph'], ['git bisect start/good/bad', 'binary-search a regression'], ['git push --force-with-lease', 'safer force push'], ['git clean -fdn', 'preview untracked file removal'], ['git blame -L 10,20 file', 'who changed lines 10-20']],
    Chmod: [['755 rwxr-xr-x', 'dirs, scripts: owner full, others read+exec'], ['644 rw-r--r--', 'regular files'], ['600 rw-------', 'private keys, secrets'], ['700 rwx------', 'private directories (~/.ssh)'], ['775 rwxrwxr-x', 'group-writable dirs'], ['4755', 'setuid'], ['2755', 'setgid'], ['1777', 'sticky (like /tmp)'], ['chmod u+x f', 'add owner execute'], ['chmod -R g-w d', 'remove group write recursively'], ['chmod a=r f', 'everyone read-only']],
    Crontab: [['* * * * *', 'min hour day-of-month month day-of-week'], ['*/5 * * * *', 'every 5 minutes'], ['0 * * * *', 'hourly'], ['0 0 * * *', 'daily at midnight'], ['0 9 * * 1-5', '09:00 on weekdays'], ['0 0 * * 0', 'weekly on Sunday'], ['0 0 1 * *', 'monthly on the 1st'], ['0 0 1 1 *', 'yearly on Jan 1'], ['@reboot', 'once at startup'], ['@daily @hourly @weekly', 'shorthand macros'], ['crontab -e / -l', 'edit / list your crontab']],
    Docker: [['docker ps -a', 'all containers'], ['docker logs -f --tail 100 c', 'follow logs'], ['docker exec -it c sh', 'shell into a container'], ['docker build -t name:tag .', 'build an image'], ['docker run --rm -it img', 'throwaway interactive container'], ['docker compose up -d --build', 'rebuild and start'], ['docker compose logs -f svc', 'follow a service'], ['docker system prune -af', 'remove unused everything'], ['docker image ls --filter dangling=true', 'untagged images'], ['docker inspect -f "{{.NetworkSettings.IPAddress}}" c', 'container IP'], ['docker cp c:/path ./', 'copy out of a container']],
    HTTP: [['GET', 'read; safe and idempotent'], ['POST', 'create / non-idempotent action'], ['PUT', 'replace; idempotent'], ['PATCH', 'partial update'], ['DELETE', 'remove; idempotent'], ['HEAD', 'GET without a body'], ['OPTIONS', 'CORS preflight / allowed methods'], ['Cache-Control: no-store', 'never cache'], ['Cache-Control: max-age=60', 'cache 60 s'], ['ETag / If-None-Match', 'conditional GET (304)'], ['Authorization: Bearer <t>', 'token auth'], ['Content-Type: application/json', 'JSON body']],
    SQL: [['SELECT ... GROUP BY ... HAVING', 'filter after aggregation'], ['LEFT JOIN', 'keep all rows from left'], ['COALESCE(a, b)', 'first non-null'], ['ROW_NUMBER() OVER (PARTITION BY x ORDER BY y)', 'rank within groups'], ['WITH cte AS (...)', 'common table expression'], ['EXPLAIN ANALYZE', 'show query plan with timings'], ['UPSERT: INSERT ... ON CONFLICT DO UPDATE', 'Postgres / SQLite'], ['CREATE INDEX CONCURRENTLY', 'Postgres, no table lock'], ['LIMIT n OFFSET m', 'pagination'], ['BEGIN; ... COMMIT;', 'transaction']],
};
