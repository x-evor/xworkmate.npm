# xworkmate

`xworkmate` is an npm CLI for pairing with OpenClaw gateways. It supports two modes:

1. **OpenClaw QR mode** - Wraps `openclaw qr` for simple QR code generation
2. **Relay mode** - Direct WebSocket connection to gateway with background service support

## Install

```bash
npm install -g xworkmate
```

`xworkmate` expects a working `openclaw` CLI to already exist on the host. It resolves `openclaw` in this order:

1. `OPENCLAW_BIN`
2. local `openclaw/cli-entry` when available
3. `openclaw` from `PATH`

## Usage

### OpenClaw QR Mode

Generate a QR code and setup code:

```bash
xworkmate pair
```

Only print the setup code:

```bash
xworkmate pair --setup-code-only
```

Emit JSON:

```bash
xworkmate pair --json
```

Remote gateway mode:

```bash
xworkmate pair --remote
```

### Relay Mode

Connect directly to a gateway via WebSocket:

```bash
xworkmate pair --server ws://localhost:18789
```

With background service installation:

```bash
xworkmate pair --server ws://localhost:18789 --install-service
```

Run the relay daemon manually:

```bash
xworkmate relay-daemon
```

### Options

- `--server <url>` - Connect to gateway directly (relay mode)
- `--install-service` - Install background service (requires `--server`)
- `--remote` - Remote gateway mode (OpenClaw QR mode)
- `--url <url>` - Custom gateway URL (OpenClaw QR mode)
- `--public-url <url>` - Custom public URL (OpenClaw QR mode)
- `--token <token>` - Auth token
- `--password <password>` - Auth password
- `--setup-code-only` - Only print setup code, no QR
- `--json` - Emit JSON output
- `--no-ascii` - Disable ASCII QR code

## Approval

After the mobile device scans the QR, approve the pairing from an authorized OpenClaw operator device:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

## Background Service

The relay mode can install a background service that maintains a persistent connection to the gateway:

- **macOS**: launchd agent at `~/Library/LaunchAgents/com.xworkmate.relay.plist`
- **Linux**: systemd user service at `~/.config/systemd/user/xworkmate-relay.service`
- **Windows**: Scheduled task named `XWorkmateRelay`

Logs are written to `~/.xworkmate/relay.log`.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```