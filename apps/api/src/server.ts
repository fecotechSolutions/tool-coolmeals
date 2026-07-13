import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getEnv } from "./env";

const env = getEnv();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
