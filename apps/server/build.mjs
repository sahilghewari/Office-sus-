// Bundles the server (and the shared package) into a single ESM file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  packages: 'external',
  // @corp/shared is a workspace TS package: bundle it instead of externalising.
  plugins: [
    {
      name: 'bundle-shared',
      setup(b) {
        b.onResolve({ filter: /^@corp\/shared$/ }, () => ({ path: new URL('../../packages/shared/src/index.ts', import.meta.url).pathname }));
      },
    },
  ],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
console.log('server built → dist/index.js');
