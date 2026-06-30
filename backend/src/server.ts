import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";

async function bootstrap() {
  await pool.query("SELECT 1");

  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`CRM API running on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Startup failed", error);
  process.exit(1);
});
