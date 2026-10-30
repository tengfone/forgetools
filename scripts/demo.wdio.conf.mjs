// WDIO config for scripts/record-demo.mjs: the e2e config, with only the demo "spec".
import { config as base } from '../wdio.conf.mjs';

export const config = {
  ...base,
  specs: ['./record-demo.mjs'],
  mochaOpts: { ...base.mochaOpts, timeout: 300000 },
};
