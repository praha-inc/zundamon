import { standard } from '@praha/oxlint-config-standard';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [
    standard(),
  ],
  ignorePatterns: [
    'worker-configuration.d.ts',
  ],
});
