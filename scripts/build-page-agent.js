const fs = require('fs');
const { build } = require('esbuild');

const OUTFILE = 'public/page-agent.bundle.js';

async function main() {
  await build({
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
    outfile: OUTFILE
  });

  let bundle = fs.readFileSync(OUTFILE, 'utf-8');

  // Keep PageAgent's index mapping, but disable the user-visible numbered overlays.
  bundle = bundle.replaceAll('doHighlightElements: true,', 'doHighlightElements: false,');
  bundle = bundle.replaceAll('debugMode: true,', 'debugMode: false,');

  fs.writeFileSync(OUTFILE, bundle, 'utf-8');
}

main().catch(() => process.exit(1));
