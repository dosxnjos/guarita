// Empacota worker/index.ts como dist/_worker.js (modo avançado do Pages).
import { build } from 'esbuild';

await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'dist/_worker.js',
  logLevel: 'warning',
});
console.log('dist/_worker.js pronto');
