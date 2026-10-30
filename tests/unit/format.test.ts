import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  beautifyCss,
  beautifyJs,
  minifyCss,
  minifyJs,
  formatGraphql,
  minifyGraphql,
  lintDockerfile,
  dockerRunToCompose,
  composeToDockerRun,
} from '../../src/renderer/src/tools/lib/format';

describe('CSS / JS', () => {
  it('beautifies and minifies CSS', () => {
    expect(beautifyCss('a{color:red;margin:0}')).toBe('a {\n  color: red;\n  margin: 0\n}');
    expect(minifyCss('/* c */\na  >  b {\n  color : red ;\n  content: "a  b";\n}\n/*! keep */')).toBe(
      'a>b{color:red;content:"a  b"}/*! keep */',
    );
    expect(minifyCss('.a .b { margin: 0 auto; }')).toBe('.a .b{margin:0 auto}');
  });
  it('beautifies and minifies JS', async () => {
    expect(beautifyJs('function f(a){return a+1}')).toContain('function f(a) {\n  return a + 1\n}');
    const m = await minifyJs(
      'function add(first, second) { // c\n  return first + second;\n}\nconsole.log(add(1, 2));',
    );
    expect(m).not.toContain('//');
    expect(m.length).toBeLessThan(60);
    await expect(minifyJs('function (')).rejects.toThrow();
  });
});

describe('GraphQL', () => {
  it('formats and minifies', () => {
    const f = formatGraphql('query Q($id: ID!){user(id:$id){name friends(first:2){name}}}');
    expect(f).toContain('query Q($id: ID!) {\n  user(id: $id) {\n    name');
    expect(minifyGraphql(f)).toBe('query Q($id:ID!){user(id:$id){name friends(first:2){name}}}');
    expect(() => formatGraphql('query {')).toThrow(/Invalid GraphQL/);
  });
});

describe('Dockerfile lint', () => {
  it('flags common problems', () => {
    const issues = lintDockerfile(
      'FROM ubuntu\nMAINTAINER me\nRUN apt-get update\nRUN apt-get install curl\nADD app.js /app/\nENV API_KEY=abc\nWORKDIR app\nCMD node app.js',
    );
    const rules = issues.map((i) => i.rule);
    for (const r of ['DL3006', 'DL4000', 'DL3059-apt', 'DL3014', 'DL3020', 'SEC-SECRET', 'DL3000', 'DL3025', 'DL3002'])
      expect(rules).toContain(r);
  });
  it('a clean Dockerfile has no warnings', () => {
    const issues = lintDockerfile(
      'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nUSER node\nHEALTHCHECK CMD wget -q localhost\nCMD ["node", "index.js"]',
    );
    expect(issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(lintDockerfile('')[0]!.level).toBe('error');
  });
});

describe('docker run <-> compose', () => {
  it('converts a run command', () => {
    const y = dockerRunToCompose(
      'docker run -d --name web -p 8080:80 -e A=1 -v data:/data --restart unless-stopped nginx:1.25 nginx -g "daemon off;"',
    );
    const doc = yaml.load(y) as { services: Record<string, Record<string, unknown>>; volumes: object };
    const svc = doc.services.web!;
    expect(svc.image).toBe('nginx:1.25');
    expect(svc.ports).toEqual(['8080:80']);
    expect(svc.environment).toEqual({ A: '1' });
    expect(svc.restart).toBe('unless-stopped');
    expect(svc.command).toEqual(['nginx', '-g', 'daemon off;']);
    expect(doc.volumes).toHaveProperty('data');
    expect(() => dockerRunToCompose('ls -la')).toThrow();
  });
  it('converts compose back', () => {
    const run = composeToDockerRun(
      'services:\n  web:\n    image: nginx\n    ports: ["8080:80"]\n    environment:\n      A: 1\n',
    );
    expect(run).toContain('docker run -d');
    expect(run).toContain('--name web');
    expect(run).toContain('-p 8080:80');
    expect(run).toContain('-e A=1');
    expect(run.trim().endsWith('nginx')).toBe(true);
    expect(() => composeToDockerRun('foo: 1')).toThrow(/services/);
  });
});
