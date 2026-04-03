import { build } from 'esbuild';

build({
  stdin: {
    contents: `
      import { PageController } from '@page-agent/page-controller';
      window.PageAgent = { PageController };
    `,
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true,
  format: 'iife',
  outfile: 'public/page-agent.bundle.js'
}).catch(() => process.exit(1));
