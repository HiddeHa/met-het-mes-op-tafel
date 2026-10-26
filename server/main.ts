import { createOnlineServer } from './index';

const rawPort = Number(process.env.PORT);
const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 8787;
const serveStatic = process.argv.includes('--serve');

const server = await createOnlineServer({
  port,
  host: '0.0.0.0',
  serveStatic,
  rootDir: process.cwd(),
});

if (serveStatic) {
  console.log('[online] Productiebuild wordt geserveerd uit ./dist');
  console.log('[online] Deel de netwerk-URL of zet deze server online achter een Node-host.');
} else {
  console.log('[online] Klaar voor roomcodes. Laat de client via Vite verbinden.');
}

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
