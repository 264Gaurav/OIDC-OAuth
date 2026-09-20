import { createApp } from "./app.js";
import { env } from "../config/env.js";

const serverPromise = createApp().then((app) => app.listen(env.PORT, () => {
  console.log(`Auth service listening on :${env.PORT}`);
}));

function shutdown(signal: string) {
  console.log(`${signal} received`);

  void serverPromise.then((server) => server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  }));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));