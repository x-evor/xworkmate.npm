import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.readyState = MockWebSocket.CONNECTING;
      this._listeners = {};
    }

    on(event, callback) {
      this._listeners[event] = callback;
      return this;
    }

    once(event, callback) {
      this._listeners[event] = callback;
      return this;
    }

    addEventListener(event, callback) {
      this._listeners[event] = callback;
    }

    send(data) {
      this._sentData = data;
    }

    close(code, reason) {
      this.readyState = MockWebSocket.CLOSED;
      if (this._listeners.close) {
        this._listeners.close(code, reason ?? "");
      }
    }

    removeAllListeners() {
      this._listeners = {};
    }
  }

  return { MockWebSocket };
});

// Mock ws module - must use factory function for vi.mock
vi.mock("ws", () => {
  return {
    WebSocket: MockWebSocket,
  };
});

// Mock identity module
vi.mock("./identity.js", () => ({
  loadOrCreateIdentity: () => ({
    deviceId: "test-device-id",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
  }),
  buildSignedDevice: (_identity, opts) => ({
    id: "test-device-id",
    publicKey: "test-key",
    signature: "test-signature",
    signedAt: Date.now(),
    nonce: opts.nonce,
  }),
}));

import { GatewayClient } from "./gateway-client.js";

function openClientSocket(client) {
  client.ws.readyState = MockWebSocket.OPEN;
  client.ws._listeners.open?.();
}

describe("GatewayClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("initializes with single gateway URL", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      expect(client.getCandidateUrls()).toEqual(["ws://localhost:18789"]);
      expect(client.getCurrentUrl()).toBe("ws://localhost:18789");
    });

    it("initializes with multiple gateway URLs", () => {
      const urls = ["ws://gateway1.local:18789", "ws://gateway2.local:18789", "ws://gateway3.local:18789"];
      const client = new GatewayClient({ url: urls });
      expect(client.getCandidateUrls()).toEqual(urls);
      expect(client.getCurrentUrl()).toBe(urls[0]);
    });
  });

  describe("start", () => {
    it("creates WebSocket connection with correct URL", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.start();

      const ws = client.ws;
      expect(ws.url).toBe("ws://localhost:18789");
      expect(ws.options).toEqual({ maxPayload: 25 * 1024 * 1024 });
      expect(ws._listeners.open).toBeDefined();
      expect(ws._listeners.message).toBeDefined();
      expect(ws._listeners.close).toBeDefined();
      expect(ws._listeners.error).toBeDefined();
    });

    it("does not start when stopped", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.stop();
      client.start();

      expect(client.ws).toBeNull();
    });

    it("uses first URL when multiple candidates provided", () => {
      const urls = ["ws://gateway1.local:18789", "ws://gateway2.local:18789"];
      const client = new GatewayClient({ url: urls });
      client.start();

      expect(client.ws.url).toBe(urls[0]);
    });
  });

  describe("auto-discovery with connect.challenge", () => {
    it("waits for connect.challenge before sending connect", () => {
      const onConnected = vi.fn();
      const client = new GatewayClient({
        url: "ws://localhost:18789",
        onConnected,
      });

      client.start();

      // Simulate WebSocket open
      openClientSocket(client);

      // Verify connect not sent yet
      expect(client.ws._sentData).toBeUndefined();

      // Simulate connect.challenge event
      if (client.ws._listeners.message) {
        const challengeMsg = JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "test-nonce-123" },
        });
        client.ws._listeners.message(challengeMsg);
      }

      // Verify connect was sent with nonce
      expect(client.ws._sentData).toBeDefined();
      const sentData = JSON.parse(client.ws._sentData);
      expect(sentData.type).toBe("req");
      expect(sentData.method).toBe("connect");
      expect(sentData.params.device.nonce).toBe("test-nonce-123");
    });

    it("sends connect without nonce after 1s timeout", () => {
      vi.useFakeTimers();
      const client = new GatewayClient({ url: "ws://localhost:18789" });

      client.start();

      // Simulate WebSocket open
      openClientSocket(client);

      // Advance time to trigger timeout
      vi.advanceTimersByTime(1000);

      // Verify connect was sent
      expect(client.ws._sentData).toBeDefined();
      const sentData = JSON.parse(client.ws._sentData);
      expect(sentData.params.device.nonce).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe("multi-gateway fallback", () => {
    it("tracks connection attempts per URL", () => {
      const urls = ["ws://gateway1.local:18789", "ws://gateway2.local:18789"];
      const client = new GatewayClient({ url: urls });

      client.start();
      expect(client.getCurrentUrl()).toBe(urls[0]);

      // Simulate close (first attempt)
      if (client.ws._listeners.close) {
        client.ws._listeners.close(1000, "Connection failed");
      }

      vi.useFakeTimers();
      vi.advanceTimersByTime(1000); // First reconnect

      // Second attempt on same URL
      expect(client.ws.url).toBe(urls[0]);

      vi.useRealTimers();
    });

    it("switches to next candidate after 3 failures", () => {
      const urls = ["ws://gateway1.local:18789", "ws://gateway2.local:18789", "ws://gateway3.local:18789"];
      const client = new GatewayClient({ url: urls });
      const onGatewaySwitch = vi.fn();

      client.opts.onGatewaySwitch = onGatewaySwitch;
      client.start();

      const closeCallback = client.ws._listeners.close;

      vi.useFakeTimers();

      // Fail 3 times to trigger switch
      for (let i = 0; i < 3; i++) {
        closeCallback(1000, "Connection failed");
        vi.advanceTimersByTime(1000 * (i + 1));
      }

      // Should switch to next URL
      expect(onGatewaySwitch).toHaveBeenCalledWith(urls[1]);
      expect(client.getCurrentUrl()).toBe(urls[1]);

      vi.useRealTimers();
    });
  });

  describe("candidate URL management", () => {
    it("adds new candidate URL", () => {
      const client = new GatewayClient({ url: ["ws://localhost:18789"] });
      const newUrl = "ws://new-gateway.local:18789";

      client.addCandidateUrl(newUrl);

      expect(client.getCandidateUrls()).toContain(newUrl);
    });

    it("does not add duplicate candidate URL", () => {
      const client = new GatewayClient({ url: ["ws://localhost:18789"] });

      client.addCandidateUrl("ws://localhost:18789");

      const count = client.getCandidateUrls().filter((u) => u === "ws://localhost:18789").length;
      expect(count).toBe(1);
    });

    it("removes candidate URL", () => {
      const urls = ["ws://g1.local:18789", "ws://g2.local:18789", "ws://g3.local:18789"];
      const client = new GatewayClient({ url: urls });

      const removed = client.removeCandidateUrl(urls[1]);

      expect(removed).toBe(true);
      expect(client.getCandidateUrls()).toEqual([urls[0], urls[2]]);
    });

    it("returns false when removing non-existent URL", () => {
      const client = new GatewayClient({ url: ["ws://localhost:18789"] });

      const removed = client.removeCandidateUrl("ws://nonexistent.local:18789");

      expect(removed).toBe(false);
    });

    it("sets preferred URL by moving to front", () => {
      const urls = ["ws://g1.local:18789", "ws://g2.local:18789", "ws://g3.local:18789"];
      const client = new GatewayClient({ url: urls });

      client.setPreferredUrl(urls[2]);

      expect(client.getCandidateUrls()[0]).toBe(urls[2]);
    });

    it("adds new URL when setting preferred", () => {
      const client = new GatewayClient({ url: ["ws://localhost:18789"] });
      const newUrl = "ws://preferred.local:18789";

      client.setPreferredUrl(newUrl);

      expect(client.getCandidateUrls()[0]).toBe(newUrl);
      expect(client.getCandidateUrls()).toContain(newUrl);
    });
  });

  describe("stop", () => {
    it("stops reconnection attempts", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.start();
      const closeCallback = client.ws._listeners.close;
      client.stop();

      vi.useFakeTimers();
      closeCallback(1000, "Connection failed");
      vi.advanceTimersByTime(5000);

      // Should not reconnect
      expect(client.ws).toBeNull();

      vi.useRealTimers();
    });

    it("closes WebSocket connection", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.start();
      client.stop();

      expect(client.ws).toBeNull();
    });
  });

  describe("tick mechanism", () => {
    it("receives tick events and updates lastTick timestamp", () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.start();

      if (client.ws._listeners.message) {
        const tickMsg = JSON.stringify({
          type: "event",
          event: "tick",
        });
        client.ws._listeners.message(tickMsg);
      }

      expect(client.lastTick).toBeGreaterThan(0);
    });
  });

  describe("request/response handling", () => {
    it("sends request and waits for response", async () => {
      const client = new GatewayClient({ url: "ws://localhost:18789" });
      client.start();
      client.ws.readyState = MockWebSocket.OPEN;

      const requestPromise = client.request("test.method", { param: "value" });

      // Verify request was sent
      expect(client.ws._sentData).toBeDefined();
      const sentData = JSON.parse(client.ws._sentData);
      expect(sentData.type).toBe("req");
      expect(sentData.method).toBe("test.method");
      expect(sentData.params).toEqual({ param: "value" });

      // Simulate response
      const requestId = sentData.id;
      if (client.ws._listeners.message) {
        const responseMsg = JSON.stringify({
          type: "res",
          id: requestId,
          ok: true,
          payload: { result: "success" },
        });
        client.ws._listeners.message(responseMsg);
      }

      const result = await requestPromise;
      expect(result).toEqual({ result: "success" });
    });

    it("handles incoming requests", () => {
      const onRequest = vi.fn();
      const client = new GatewayClient({ url: "ws://localhost:18789", onRequest });
      client.start();
      client.ws.readyState = MockWebSocket.OPEN;

      if (client.ws._listeners.message) {
        const requestMsg = JSON.stringify({
          type: "req",
          id: "test-request-id",
          method: "incoming.method",
          params: { foo: "bar" },
        });
        client.ws._listeners.message(requestMsg);
      }

      expect(onRequest).toHaveBeenCalledWith("incoming.method", { foo: "bar" });
    });
  });
});
