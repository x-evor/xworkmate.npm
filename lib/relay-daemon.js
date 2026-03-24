import { GatewayClient } from "./gateway-client.js";
import { getAllGatewayUrls, getPassword, getToken } from "./config.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { createWriteStream } from "node:fs";

const LOG_PATH = join(homedir(), ".xworkmate", "relay.log");
const VERSION = "2026.3.27";

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  if (global.__logStream) {
    global.__logStream.write(line);
  }
}

async function runRelayDaemon() {
  // Setup logging
  global.__logStream = createWriteStream(LOG_PATH, { flags: "a" });

  log("XWorkmate Relay Daemon starting...");
  log(`Version: ${VERSION}`);
  log(`Platform: ${process.platform}`);
  log(`Node: ${process.version}`);

  const gatewayUrls = getAllGatewayUrls();
  if (gatewayUrls.length === 0) {
    log("ERROR: No gateway URL configured. Run 'xworkmate pair --server <url>' first.");
    process.exit(1);
  }
  const gatewayToken = getToken();
  const gatewayPassword = getPassword();

  log(`Gateway URL: ${gatewayUrls[0]}`);
  if (gatewayUrls.length > 1) {
    log(`Gateway candidates: ${gatewayUrls.length}`);
  }

  let client = null;

  function createClient() {
    client = new GatewayClient({
      url: gatewayUrls.length === 1 ? gatewayUrls[0] : gatewayUrls,
      token: gatewayToken ?? undefined,
      password: gatewayPassword ?? undefined,
      onConnected: () => {
        log("Gateway connected.");
      },
      onDisconnected: (reason) => {
        log(`Gateway disconnected: ${reason}`);
      },
      onGatewaySwitch: (url) => {
        log(`Switching gateway candidate: ${url}`);
      },
      onEvent: (event, payload) => {
        log(`Event: ${event}`);
      },
      onError: (err) => {
        log(`Error: ${err.message}`);
      },
      onRequest: (method, params) => {
        log(`Request: ${method}`);
      },
      version: VERSION,
    });

    client.start();
  }

  createClient();

  // Handle graceful shutdown
  const shutdown = () => {
    log("Shutting down...");
    if (client) {
      client.stop();
    }
    if (global.__logStream) {
      global.__logStream.end();
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Keep running
  log("Relay daemon running. Press Ctrl+C to stop.");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith("relay-daemon.js")) {
  runRelayDaemon().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { runRelayDaemon };
