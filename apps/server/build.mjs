// Production build: bundles the server (+ `@lbq/shared` TS source + the generated Prisma
// client) into `dist/`. npm dependencies stay external and are installed in the image.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@lbq/'));

await build({
  entryPoints: {
    index: 'src/index.ts',
    instrument: 'src/instrument.ts', // Sentry, preloaded with `node --import`
    seed: 'prisma/seed.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Subpaths too (e.g. `@prisma/client/runtime/client`).
  external: external.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
});
