import { describe, expect, it, vi } from "vitest";
import {
  buildPairingQrPayload,
  buildOpenClawQrArgs,
  formatHumanPairOutput,
  parsePairArgs,
  runPairCommand,
} from "./index.js";

describe("parsePairArgs", () => {
  it("parses pair flags", () => {
    expect(
      parsePairArgs([
        "--remote",
        "--url",
        "wss://remote.example.com",
        "--no-ascii",
      ]),
    ).toEqual({
      server: undefined,
      installService: false,
      remote: true,
      url: "wss://remote.example.com",
      publicUrl: undefined,
      token: undefined,
      password: undefined,
      setupCodeOnly: false,
      json: false,
      ascii: false,
    });
  });

  it("rejects conflicting output flags", () => {
    expect(() => parsePairArgs(["--json", "--setup-code-only"])).toThrow(
      "Use either --setup-code-only or --json, not both.",
    );
  });
});

describe("buildOpenClawQrArgs", () => {
  it("uses json mode by default", () => {
    expect(
      buildOpenClawQrArgs({
        remote: false,
        url: undefined,
        publicUrl: undefined,
        token: undefined,
        password: undefined,
        setupCodeOnly: false,
        json: false,
        ascii: true,
      }),
    ).toEqual(["qr", "--json"]);
  });

  it("uses setup-code-only when requested", () => {
    expect(
      buildOpenClawQrArgs({
        remote: true,
        url: undefined,
        publicUrl: undefined,
        token: "tok",
        password: undefined,
        setupCodeOnly: true,
        json: false,
        ascii: true,
      }),
    ).toEqual(["qr", "--setup-code-only", "--remote", "--token", "tok"]);
  });
});

describe("runPairCommand", () => {
  it("prints setup code only when requested", async () => {
    const stdout = { write: vi.fn() };
    const spawn = vi.fn(() => ({
      error: undefined,
      status: 0,
      stdout: "SETUP-CODE\n",
      stderr: "",
    }));

    await runPairCommand(["--setup-code-only"], {
      stdout,
      spawn,
      invocation: { command: "openclaw", argsPrefix: [] },
    });

    expect(spawn).toHaveBeenCalledWith(
      "openclaw",
      ["qr", "--setup-code-only"],
      { encoding: "utf8" },
    );
    expect(stdout.write).toHaveBeenCalledWith("SETUP-CODE\n");
  });

  it("renders branded human output by default", async () => {
    const stdout = { write: vi.fn() };
    let qrInput = "";
    const spawn = vi.fn(() => ({
      error: undefined,
      status: 0,
      stdout: JSON.stringify({
        setupCode: "SETUP-CODE",
        gatewayUrl: "ws://gateway.local:18789",
        auth: "token",
        urlSource: "config",
      }),
      stderr: "",
    }));
    const qrGenerate = vi.fn((input, _opts, cb) => {
      qrInput = input;
      cb("ASCII-QR");
    });

    await runPairCommand([], {
      stdout,
      spawn,
      qrGenerate,
      invocation: { command: "openclaw", argsPrefix: [] },
    });

    const rendered = stdout.write.mock.calls.map((call) => call[0]).join("");
    expect(rendered).toContain("XWorkmate Pair");
    expect(rendered).toContain("ASCII-QR");
    expect(rendered).toContain("Setup code: SETUP-CODE");
    expect(rendered).toContain("openclaw devices approve <requestId>");
    expect(JSON.parse(qrInput)).toEqual({
      version: 1,
      kind: "xworkmate.setup",
      setupCode: "SETUP-CODE",
      gatewayUrl: "ws://gateway.local:18789",
      auth: "token",
      urlSource: "config",
      sourceCommand: "openclaw qr --json",
    });
  });

  it("returns json contract in json mode", async () => {
    const stdout = { write: vi.fn() };
    const spawn = vi.fn(() => ({
      error: undefined,
      status: 0,
      stdout: JSON.stringify({
        setupCode: "SETUP-CODE",
        gatewayUrl: "wss://remote.example.com:443",
        auth: "token",
        urlSource: "remote",
      }),
      stderr: "",
    }));

    await runPairCommand(["--json"], {
      stdout,
      spawn,
      invocation: { command: "openclaw", argsPrefix: [] },
    });

    const rendered = stdout.write.mock.calls.map((call) => call[0]).join("");
    const parsed = JSON.parse(rendered);
    expect(parsed).toEqual({
      setupCode: "SETUP-CODE",
      gatewayUrl: "wss://remote.example.com:443",
      auth: "token",
      urlSource: "remote",
      sourceCommand: "openclaw qr --json",
    });
  });
});

describe("buildPairingQrPayload", () => {
  it("builds a JSON envelope for mobile scan compatibility", () => {
    expect(
      JSON.parse(
        buildPairingQrPayload({
          setupCode: "SETUP-CODE",
          gatewayUrl: "wss://gateway.example.com",
          auth: "token",
          urlSource: "config",
          sourceCommand: "xworkmate pair",
        }),
      ),
    ).toEqual({
      version: 1,
      kind: "xworkmate.setup",
      setupCode: "SETUP-CODE",
      gatewayUrl: "wss://gateway.example.com",
      auth: "token",
      urlSource: "config",
      sourceCommand: "xworkmate pair",
    });
  });
});

describe("formatHumanPairOutput", () => {
  it("produces branded output", () => {
    expect(
      formatHumanPairOutput(
        {
          setupCode: "SETUP-CODE",
          gatewayUrl: "ws://gateway.local:18789",
          auth: "token",
          urlSource: "config",
        },
        "ASCII-QR",
      ),
    ).toContain("Scan this QR with XWorkmate.");
  });

  it("handles empty ASCII QR", () => {
    const output = formatHumanPairOutput(
      {
        setupCode: "SETUP-CODE",
        gatewayUrl: "ws://gateway.local:18789",
        auth: "token",
        urlSource: "config",
      },
      "",
    );
    expect(output).toContain("Setup code: SETUP-CODE");
    expect(output).not.toContain("ASCII-QR");
  });
});
