# xworkmate

`xworkmate` is a small npm CLI that wraps `openclaw qr` and prints a branded pairing flow for XWorkmate.

It does not run a relay service, install a background daemon, or replace OpenClaw's pairing protocol. It only helps generate:

- an ASCII QR code
- a setup code
- the next approval commands

## Install

```bash
npm install -g xworkmate
```

`xworkmate` expects a working `openclaw` CLI to already exist on the host. It resolves `openclaw` in this order:

1. `OPENCLAW_BIN`
2. local `openclaw/cli-entry` when available
3. `openclaw` from `PATH`

## Usage

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

## Approval

After the mobile device scans the QR, approve the pairing from an authorized OpenClaw operator device:

```bash
openclaw devices list
openclaw devices approve <requestId>
```

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```
