import { createGameServer } from './app';

const server = await createGameServer();

const shutdown = async (sig: string) => {
  console.log(`[corp-sus] ${sig} received, shutting down…`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => console.error('[corp-sus] unhandled rejection', e));
