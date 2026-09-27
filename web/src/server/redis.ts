import { createClient } from "redis";
import { serverConfig } from "./config";

function connect() {
  return createClient({ url: serverConfig.redisUrl })
    .on("error", (err) => console.error("Redis error", err))
    .connect();
}

const store = globalThis as unknown as { __redis?: ReturnType<typeof connect> };

/** One shared connection per server process (survives hot reloads in dev). */
export function redis(): ReturnType<typeof connect> {
  if (!store.__redis) store.__redis = connect();
  return store.__redis;
}
