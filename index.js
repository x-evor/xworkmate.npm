import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { GatewayClient } from "./lib/gateway-client.js";
import { writeConfig, getDisplayName } from "./lib/config.js";
import { loadOrCreateIdentity } from "./lib/identity.js";
import { installService } from "./lib/service-manager.js";
import { runRelayDaemon } from "./lib/relay-daemon.js";

const VERSION = "2026.3.27";

export function printHelp(stdout = process.stdout) {
  stdout.write(
    [
      "xworkmate",
      "",
      "Usage:",
      "  xworkmate pair [options]",
      "  xworkmate relay-daemon",
      "",
      "Options:",
      "  --server <url>           Connect to gateway directly (relay mode)",
      "  --install-service        Install background service (with --server)",
      "  --remote",
      "  --url <url>",
      "  --public-url <url>",
      "  --token <token>",
      "  --password <password>",
      "  --setup-code-only",
      "  --json",
      "  --no-ascii",
      "  -h, --help",
      "  -v, --version",
      "",
    ].join("\n"),
  );
}

export function parsePairArgs(argv) {
  const options = {
    server: undefined,
    installService: false,
    remote: false,
    url: undefined,
    publicUrl: undefined,
    token: undefined,
    password: undefined,
    setupCodeOnly: false,
    json: false,
    ascii: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    switch (current) {
      case "--server":
      case "--install-service":
      case "--remote":
      case "--setup-code-only":
      case "--json":
      case "--no-ascii": {
        const key = current.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) =>
          ch.toUpperCase(),
        );
        if (current === "--server" || current === "--install-service") {
          if (current === "--server") {
            const next = argv[index + 1];
            if (!next || next.startsWith("-")) {
              throw new Error(`Missing value for ${current}`);
            }
            options[key] = next;
            index += 1;
          } else {
            options[key] = true;
          }
        } else if (current === "--no-ascii") {
          options.ascii = false;
        } else {
          options[key] = true;
        }
        break;
      }
      case "--url":
      case "--public-url":
      case "--token":
      case "--password": {
        const next = argv[index + 1];
        if (!next || next.startsWith("-")) {
          throw new Error(`Missing value for ${current}`);
        }
        const key = current.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) =>
          ch.toUpperCase(),
        );
        options[key] = next;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown option: ${current}`);
    }
  }

  if (options.setupCodeOnly && options.json) {
    throw new Error("Use either --setup-code-only or --json, not both.");
  }

  if (options.installService && !options.server) {
    throw new Error("--install-service requires --server flag.");
  }

  return options;
}

export function buildOpenClawQrArgs(options) {
  if (options.setupCodeOnly) {
    const args = ["qr", "--setup-code-only"];
    if (options.remote) args.push("--remote");
    if (options.url) args.push("--url", options.url);
    if (options.publicUrl) args.push("--public-url", options.publicUrl);
    if (options.token) args.push("--token", options.token);
    if (options.password) args.push("--password", options.password);
    return args;
  }

  const args = ["qr", "--json"];
  if (options.remote) args.push("--remote");
  if (options.url) args.push("--url", options.url);
  if (options.publicUrl) args.push("--public-url", options.publicUrl);
  if (options.token) args.push("--token", options.token);
  if (options.password) args.push("--password", options.password);
  return args;
}

export function resolveOpenClawInvocation() {
  const envOverride = process.env.OPENCLAW_BIN?.trim();
  if (envOverride) {
    return { command: envOverride, argsPrefix: [] };
  }

  const require = createRequire(import.meta.url);
  try {
    const entry = require.resolve("openclaw/cli-entry");
    return { command: process.execPath, argsPrefix: [entry] };
  } catch {
    // Fall through to PATH lookup.
  }

  return { command: "openclaw", argsPrefix: [] };
}

export function runOpenClawCommand(
  openClawArgs,
  spawn = spawnSync,
  invocation = resolveOpenClawInvocation(),
) {
  const result = spawn(
    invocation.command,
    [...invocation.argsPrefix, ...openClawArgs],
    {
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw new Error(`Failed to start openclaw: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    const stdout = String(result.stdout ?? "").trim();
    const detail = stderr || stdout || `openclaw exited with status ${result.status}`;
    throw new Error(detail);
  }

  return String(result.stdout ?? "");
}

export async function loadQrGenerate() {
  const module = await import("qrcode-terminal");
  return module.default.generate;
}

export function renderAsciiQr(setupCode, qrGenerate) {
  return new Promise((resolvePromise) => {
    qrGenerate(setupCode, { small: true }, (output) => {
      resolvePromise(String(output ?? "").trim());
    });
  });
}

export function formatHumanPairOutput(payload, asciiQr) {
  const lines = [
    "XWorkmate Pair",
    "Scan this QR with XWorkmate.",
    "",
  ];
  if (asciiQr) {
    lines.push(asciiQr, "");
  }
  lines.push(
    `Setup code: ${payload.setupCode}`,
    `Gateway: ${payload.gatewayUrl}`,
    `Auth: ${payload.auth}`,
    `Source: ${payload.urlSource}`,
    "",
    "Approve after scan with:",
    "  openclaw devices list",
    "  openclaw devices approve <requestId>",
    "",
  );
  return lines.join("\n");
}

// Relay mode - direct gateway connection
export async function runRelayModePair(options, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const gatewayUrl = options.server;
  const identity = loadOrCreateIdentity();

  stdout.write(`XWorkmate Relay Mode\n`);
  stdout.write(`Gateway: ${gatewayUrl}\n`);
  stdout.write(`Device ID: ${identity.deviceId}\n\n`);

  let client = null;
  let setupCode = null;
  let pairingComplete = false;

  const clientPromise = new Promise((resolve, reject) => {
    client = new GatewayClient({
      url: gatewayUrl,
      token: options.token,
      password: options.password,
      onConnected: () => {
        stdout.write("Connected to gateway.\n");

        // Request setup code
        client.request("pair.init", {})
          .then((result) => {
            setupCode = result.setupCode;
            stdout.write(`\nSetup code: ${setupCode}\n`);

            // Display QR code if not --setup-code-only
            if (!options.setupCodeOnly) {
              loadQrGenerate().then((qrGenerate) => {
                stdout.write("Scan this QR with XWorkmate:\n\n");
                qrGenerate(setupCode, { small: true }, (output) => {
                  stdout.write(output + "\n\n");
                });
              });
            }
          })
          .catch((err) => {
            stderr.write(`Failed to get setup code: ${err.message}\n`);
            reject(err);
          });
      },
      onDisconnected: (reason) => {
        if (!pairingComplete) {
          stdout.write(`Gateway disconnected: ${reason}\n`);
        }
      },
      onEvent: (event, payload) => {
        if (event === "pair.approved") {
          pairingComplete = true;
          stdout.write("\nPairing approved!\n");

          // Save config
          writeConfig({
            gatewayUrl,
            deviceId: identity.deviceId,
            displayName: getDisplayName() || "xworkmate",
          });

          if (options.installService) {
            stdout.write("\nInstalling background service...\n");
            try {
              const servicePath = installService();
              stdout.write(`Service installed: ${servicePath}\n`);
            } catch (err) {
              stderr.write(`Failed to install service: ${err.message}\n`);
            }
          }

          client.stop();
          resolve();
        }
      },
      onError: (err) => {
        stderr.write(`Error: ${err.message}\n`);
      },
      version: VERSION,
    });

    client.start();

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!pairingComplete) {
        stdout.write("\nPairing timed out. Please try again.\n");
        client.stop();
        reject(new Error("Pairing timeout"));
      }
    }, 5 * 60 * 1000);
  });

  await clientPromise;
}

export async function runPairCommand(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    spawn = spawnSync,
    qrGenerate,
    invocation,
  } = {},
) {
  const options = parsePairArgs(argv);

  // Relay mode with --server flag
  if (options.server) {
    return runRelayModePair(options, { stdout });
  }

  // Original openclaw qr mode
  const openClawArgs = buildOpenClawQrArgs(options);
  const output = runOpenClawCommand(openClawArgs, spawn, invocation).trim();

  if (options.setupCodeOnly) {
    stdout.write(`${output}\n`);
    return;
  }

  const parsed = JSON.parse(output);
  const payload = {
    setupCode: String(parsed.setupCode ?? ""),
    gatewayUrl: String(parsed.gatewayUrl ?? ""),
    auth: String(parsed.auth ?? ""),
    urlSource: String(parsed.urlSource ?? ""),
    sourceCommand: "openclaw qr --json",
  };

  if (options.json) {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  const resolvedQrGenerate =
    qrGenerate ?? (options.ascii ? await loadQrGenerate() : undefined);
  const asciiQr =
    options.ascii && resolvedQrGenerate
      ? await renderAsciiQr(payload.setupCode, resolvedQrGenerate)
      : "";
  stdout.write(`${formatHumanPairOutput(payload, asciiQr)}`);
}

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command, ...rest] = argv;

  if (!command || command === "-h" || command === "--help") {
    printHelp(stdout);
    return 0;
  }

  if (command === "-v" || command === "--version") {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (command === "relay-daemon") {
    try {
      await runRelayDaemon();
      return 0;
    } catch (error) {
      stderr.write(`Relay daemon error: ${error.message}\n`);
      return 1;
    }
  }

  if (command !== "pair") {
    stderr.write(`Unknown command: ${command}\n`);
    printHelp(stderr);
    return 1;
  }

  try {
    await runPairCommand(rest, { stdout, stderr });
    return 0;
  } catch (error) {
    stderr.write(`xworkmate ${command} failed: ${error.message}\n`);
    return 1;
  }
}