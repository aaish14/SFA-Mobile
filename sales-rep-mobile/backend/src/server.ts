import { app } from "./app.js";
import { env } from "./config/env.js";
app.listen(env.PORT, "127.0.0.1", () =>
  console.log(`SFA API listening on http://localhost:${env.PORT}`),
);
