import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { loadOrCreateIdentity, buildSignedDevice } from "./identity.js";

const PROTOCOL_VERSION = 3;

export class GatewayClient {
  opts;
  ws = null;
  pending = new Map();
  backoffMs = 1000;
  stopped = false;
  connectNonce = null;
  connectSent = false;
  storedDeviceToken = null;
  connectTimer = null;
  tickTimer = null;
  lastTick = 0;
  tickIntervalMs = 30_000;
  identity;

  constructor(opts) {
    this.opts = opts;
    this.identity = loadOrCreateIdentity();
  }

  start() {
    if (this.stopped) {
      return;
    }
    this.ws = new WebSocket(this.opts.url, { maxPayload: 25 * 1024 * 1024 });
    this.ws.on("open", () => {
      this.connectNonce = null;
      this.connectSent = false;
      // Fallback: send connect after 1s if challenge hasn't arrived
      this.connectTimer = setTimeout(() => this.sendConnect(), 1000);
    });
    this.ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString();
      this.handleMessage(raw);
    });
    this.ws.on("close", (code, reason) => {
      const reasonText = reason.toString() || `code ${code}`;
      this.teardown();
      this.opts.onDisconnected?.(reasonText);
      this.scheduleReconnect();
    });
    this.ws.on("error", (err) => {
      this.opts.onError?.(err);
    });
  }

  stop() {
    this.stopped = true;
    this.teardown();
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  send(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }
    const frame = { type: "req", id: randomUUID(), method, params };
    this.ws.send(JSON.stringify(frame));
  }

  async request(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }
    const id = randomUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  sendConnect() {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const role = "operator";
    const scopes = ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.pairing"];
    const clientId = "openclaw-macos";
    const clientMode = "cli";
    const signedAtMs = Date.now();
    const nonce = this.connectNonce ?? undefined;
    const authToken = this.storedDeviceToken ?? this.opts.token;

    const device = buildSignedDevice(this.identity, {
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs,
      token: authToken ?? undefined,
      nonce,
    });

    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      role,
      scopes,
      caps: ["tool-events"],
      client: {
        id: clientId,
        displayName: "XWorkmate",
        version: this.opts.version || "1.0.0",
        platform: process.platform,
        mode: clientMode,
      },
      device,
      auth: authToken || this.opts.password
        ? { token: authToken, password: this.opts.password }
        : undefined,
    };

    this.request("connect", params)
      .then((helloOk) => {
        const deviceToken = helloOk?.auth?.deviceToken;
        if (typeof deviceToken === "string") {
          this.storedDeviceToken = deviceToken;
        }
        if (typeof helloOk?.policy?.tickIntervalMs === "number") {
          this.tickIntervalMs = helloOk.policy.tickIntervalMs;
        }
        this.backoffMs = 1000;
        this.lastTick = Date.now();
        this.startTickWatch();
        this.opts.onConnected?.();
      })
      .catch((err) => {
        this.opts.onError?.(err);
        this.storedDeviceToken = null;
        this.ws?.close(1008, "connect failed");
      });
  }

  handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed?.type !== "string") {
      return;
    }

    if (parsed.type === "event") {
      const evt = parsed;
      if (evt.event === "connect.challenge") {
        const nonce = evt.payload?.nonce;
        if (typeof nonce === "string") {
          this.connectNonce = nonce;
          this.sendConnect();
        }
        return;
      }

      if (evt.event === "tick") {
        this.lastTick = Date.now();
        return;
      }

      this.opts.onEvent?.(evt.event, evt.payload ?? null);
      return;
    }

    if (parsed.type === "res") {
      const res = parsed;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "gateway error"));
      }
      return;
    }

    // Handle incoming req frames from OpenClaw
    if (parsed.type === "req") {
      const id = parsed.id;
      // Ack immediately
      if (id && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "res", id, ok: true }));
      }
      this.opts.onRequest?.(parsed.method, parsed.params);
    }
  }

  startTickWatch() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    const interval = Math.max(this.tickIntervalMs, 1000);
    this.tickTimer = setInterval(() => {
      if (this.stopped || !this.lastTick) {
        return;
      }
      if (Date.now() - this.lastTick > this.tickIntervalMs * 2) {
        this.ws?.close(4000, "tick timeout");
      }
    }, interval);
  }

  scheduleReconnect() {
    if (this.stopped) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    setTimeout(() => this.start(), delay).unref();
  }

  teardown() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  flushPending(err) {
    for (const p of this.pending.values()) {
      p.reject(err);
    }
    this.pending.clear();
  }
}