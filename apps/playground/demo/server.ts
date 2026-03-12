import { playgroundForAgent } from '@/playground-lib/launcher';
import { PuppeteerAgent } from '@/web/puppeteer';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

// Polyfill for __VERSION__
// @ts-ignore
global.__VERSION__ = '0.0.1';

dotenv.config({
  path: '../../.env',
});

async function main() {
  console.log('🚀 Starting Playground Demo Server...');

  // Launch Puppeteer browser directly
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    dumpio: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
    executablePath: '/Users/angus/.cache/puppeteer/chrome/mac_arm-135.0.7049.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', // Use explicit path
  });
  console.log('Browser launched');

  const puppeteerPage = await browser.newPage();
  console.log('New page created');

  // Navigate to the test page
  console.log('Navigating to test page...');
  await puppeteerPage.goto(
    'https://www.baidu.com', // Use baidu for testing speed
    { waitUntil: 'domcontentloaded' }
  );
  console.log('Page loaded');

  await puppeteerPage.setViewport({
    width: 1280,
    height: 768,
  });

  // Create the agent with the Puppeteer page
  const agent = new PuppeteerAgent(puppeteerPage, {
    cacheId: 'playground-demo-test',
  });

  // Launch playground server with CORS enabled for playground app
  const server = await playgroundForAgent(agent).launch({
    port: 5870, // Use different port from web-integration demo
    openBrowser: false, // Don't open browser automatically
    verbose: true,
    enableCors: true,
  });

  console.log(`✅ Playground Demo Server started on port ${server.port}`);
  console.log(`🔑 Server ID: ${server.server.id}`);
  console.log(
    '🌐 You can now start the playground app and it will connect to this server',
  );
  console.log('');
  console.log('To start the playground app:');
  console.log('  cd apps/playground && npm run dev');
  console.log('');
  console.log('To stop this demo server, press Ctrl+C');

  // Keep the process running
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down demo server...');
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌ Failed to start demo server:', err);
  process.exit(1);
});
