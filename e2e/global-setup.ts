import { spawn, type ChildProcess } from 'node:child_process';
import { E2E_BASE_URL, E2E_PORT } from './constants';

const HEALTH_URL = `${E2E_BASE_URL}/health`;
const READY_TIMEOUT_MS = 30_000;

async function waitForHealth(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `The game server exited early (code ${server.exitCode}). Is port ${E2E_PORT} already in use?`,
      );
    }
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The game server did not answer ${HEALTH_URL} in time.`);
}

function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    server.once('exit', () => resolve());
    server.kill();
    setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 5_000);
  });
}

/**
 * Serves the built game on the test port as a child of Playwright's process,
 * so the returning teardown can stop it and free the port. The server is
 * started through tsx, not imported: its question bank is JSON and must go
 * through the bundler rather than Node's strict ESM JSON rules.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/main.ts', '--serve'],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(E2E_PORT) },
      stdio: 'ignore',
      windowsHide: true,
    },
  );

  try {
    await waitForHealth(server);
  } catch (error) {
    await stopServer(server);
    throw error;
  }

  return async () => {
    await stopServer(server);
  };
}
