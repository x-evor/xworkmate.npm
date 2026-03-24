import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const VERSION = "2026.3.24";

export function printHelp(stdout = process.stdout) {
  stdout.write(
    [
      "xworkmate",
      "",
      "Usage:",
      "  xworkmate pair [options]",
      "",
      "Options:",
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
      case "--remote":
        options.remote = true;
        break;
      case "--setup-code-only":
        options.setupCodeOnly = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--no-ascii":
        options.ascii = false;
        break;
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

export async function runPairCommand(
  argv,
  {
    stdout = process.stdout,
    spawn = spawnSync,
    qrGenerate,
    invocation,
  } = {},
) {
  const options = parsePairArgs(argv);
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

  if (command !== "pair") {
    stderr.write(`Unknown command: ${command}\n`);
    printHelp(stderr);
    return 1;
  }

  try {
    await runPairCommand(rest, { stdout });
    return 0;
  } catch (error) {
    stderr.write(`xworkmate pair failed: ${error.message}\n`);
    return 1;
  }
}
