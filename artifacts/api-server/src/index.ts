import app from "./app";
import { logger } from "./lib/logger";
import { startRiskEngine } from "./lib/riskEngine";
import { getSiteDataAsync } from "./lib/siteData";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Pre-warm Excel site-data cache before starting risk engine
  getSiteDataAsync().then(() => {
    startRiskEngine();
  }).catch((e) => {
    logger.error({ err: e }, "Site data pre-warm failed — starting risk engine anyway");
    startRiskEngine();
  });
});
