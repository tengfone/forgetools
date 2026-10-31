import { textTool, dir } from './textTool';
import { dockerRunToCompose, composeToDockerRun } from '../lib/format';

export const render = textTool({
  prefix: 'dc',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [{ id: 'dir', label: 'Direction', choices: dir('docker run → compose', 'compose → docker run') }],
  sample: {
    input:
      'docker run -d --name web -p 8080:80 -e NGINX_HOST=example.com -v ./html:/usr/share/nginx/html:ro --restart unless-stopped nginx:1.27',
    options: { dir: 'a' },
  },
  run: (s, v) => (v.dir === 'a' ? dockerRunToCompose(s) : composeToDockerRun(s)),
});
