/**
 * index.ts — process entry point.
 *
 * Responsibilities kept here and nowhere else: reading configuration, binding
 * the port, printing the operator's first-run credentials, and shutting down
 * cleanly. Everything else lives in app.ts so it can be tested without a socket.
 */

import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { health } from './services/tmux.ts';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Configuration failures are the operator's to fix, so they go to stderr in
    // plain text rather than through the structured logger, which is not up yet.
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const app = await buildApp({ config });

  // Fail fast when tmux is missing. The bridge cannot do anything useful
  // without it, and discovering that on the first poll from a bicycle is worse
  // than discovering it at startup.
  const tmuxHealth = await health(config.TMUX_SOCKET ? { socket: config.TMUX_SOCKET } : {});
  if (!tmuxHealth.ok) {
    app.log.error({ error: tmuxHealth.error }, 'tmux is not available');
    process.exit(1);
  }
  app.log.info({ version: tmuxHealth.version }, 'tmux detected');

  // Generated credentials are shown exactly once, on stderr rather than through
  // the logger, so they are not captured by a log shipper and stored forever.
  if (config.generated.read) {
    process.stderr.write(
      [
        '',
        '='.repeat(72),
        '  A read token was generated because READ_TOKEN was not set.',
        '  Copy it into the Garmin app settings now; it is not stored anywhere.',
        '',
        `  READ_TOKEN=${config.generated.read}`,
        '='.repeat(72),
        '',
      ].join('\n'),
    );
  }
  if (config.sharedToken) {
    app.log.warn(
      'WRITE_TOKEN is unset: reads and writes share one credential. ' +
        'Set WRITE_TOKEN so a display-only device cannot type into the session.',
    );
  }
  if (config.HOST === '0.0.0.0') {
    app.log.warn(
      'Listening on 0.0.0.0. Ensure a TLS-terminating proxy or private network ' +
        'sits in front: Connect IQ requires HTTPS with a publicly trusted certificate.',
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(
      {
        session: config.TMUX_SESSION,
        allowedSessions: config.allowedSessions,
        socket: config.TMUX_SOCKET || '(default)',
        freeText: config.ALLOW_FREE_TEXT,
        destructive: config.ALLOW_DESTRUCTIVE,
      },
      'claude-edge bridge ready',
    );
  } catch (err) {
    app.log.error({ err }, 'failed to bind');
    process.exit(1);
  }
}

void main();
