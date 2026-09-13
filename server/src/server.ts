// Khởi động server: listen PORT + graceful shutdown
import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });

  // Tắt gọn khi nhận SIGINT/SIGTERM
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Không khởi động được server:', err);
  process.exit(1);
});
