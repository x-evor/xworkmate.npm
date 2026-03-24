import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  readConfig,
  writeConfig,
  updateConfig,
  configExists,
  getGatewayUrl,
  setGatewayUrl,
  getGatewayBind,
  setGatewayBind,
  getGatewayCandidates,
  addGatewayCandidate,
  removeGatewayCandidate,
  getPublicUrl,
  setPublicUrl,
  getDisplayName,
  getDeviceId,
  getToken,
  setToken,
  getPassword,
  setPassword,
  isAutoDiscoveryEnabled,
  setAutoDiscovery,
  getPreferredGateway,
  setPreferredGateway,
  getDiscoveryTimeout,
  setDiscoveryTimeout,
  getAllGatewayUrls,
  clearAuth,
  resetConfig,
} from "./config.js";

// Mock fs module
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock os module
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

describe("config module", () => {
  const mockConfig = {
    version: 1,
    gatewayUrl: "ws://gateway.local:18789",
    gatewayBind: "lan",
    gatewayCandidates: ["ws://backup.local:18789"],
    publicUrl: "https://public.example.com",
    deviceId: "test-device-id",
    displayName: "Test Device",
    token: "test-token",
    password: "test-password",
    autoDiscovery: true,
    preferredGateway: "ws://preferred.local:18789",
    discoveryTimeout: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readConfig", () => {
    it("returns default config when file does not exist", () => {
      existsSync.mockReturnValue(false);

      const config = readConfig();

      expect(config).toMatchObject({
        version: 1,
        gatewayUrl: null,
        gatewayBind: null,
        gatewayCandidates: [],
        publicUrl: null,
        deviceId: null,
        displayName: null,
        token: null,
        password: null,
        autoDiscovery: true,
        preferredGateway: null,
        discoveryTimeout: 3000,
      });
    });

    it("returns stored config when file exists", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const config = readConfig();

      expect(config).toEqual(mockConfig);
    });

    it("applies defaults to partial config", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        gatewayUrl: "ws://custom.local:18789",
      }));

      const config = readConfig();

      expect(config.gatewayUrl).toBe("ws://custom.local:18789");
      expect(config.gatewayBind).toBe(null);
      expect(config.autoDiscovery).toBe(true);
      expect(config.discoveryTimeout).toBe(3000);
    });

    it("returns defaults on parse error", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue("invalid json");

      const config = readConfig();

      expect(config).toMatchObject({
        version: 1,
        gatewayUrl: null,
      });
    });
  });

  describe("writeConfig", () => {
    it("creates directory and writes config", () => {
      writeConfig(mockConfig);

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData).toEqual({
        version: 1,
        ...mockConfig,
      });
    });

    it("sets restrictive file permissions", () => {
      writeConfig(mockConfig);

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { mode: 0o600 }
      );
    });
  });

  describe("updateConfig", () => {
    it("updates specific keys without overwriting others", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      updateConfig({ gatewayUrl: "ws://new-gateway.local:18789" });

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayUrl).toBe("ws://new-gateway.local:18789");
      expect(writtenData.gatewayBind).toBe("lan");
      expect(writtenData.deviceId).toBe("test-device-id");
    });
  });

  describe("configExists", () => {
    it("returns true when config file exists", () => {
      existsSync.mockReturnValue(true);
      expect(configExists()).toBe(true);
    });

    it("returns false when config file does not exist", () => {
      existsSync.mockReturnValue(false);
      expect(configExists()).toBe(false);
    });
  });

  describe("gateway URL functions", () => {
    it("gets gateway URL", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getGatewayUrl()).toBe("ws://gateway.local:18789");
    });

    it("sets gateway URL", () => {
      existsSync.mockReturnValue(false);

      setGatewayUrl("ws://new-gateway.local:18789");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayUrl).toBe("ws://new-gateway.local:18789");
    });

    it("returns null when no gateway URL configured", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({ gatewayUrl: null }));

      expect(getGatewayUrl()).toBeNull();
    });
  });

  describe("gateway bind functions", () => {
    it("gets gateway bind setting", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getGatewayBind()).toBe("lan");
    });

    it("sets gateway bind setting", () => {
      existsSync.mockReturnValue(false);

      setGatewayBind("loopback");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayBind).toBe("loopback");
    });
  });

  describe("gateway candidates functions", () => {
    it("gets gateway candidates", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getGatewayCandidates()).toEqual(["ws://backup.local:18789"]);
    });

    it("adds gateway candidate", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      addGatewayCandidate("ws://new-candidate.local:18789");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayCandidates).toContain("ws://new-candidate.local:18789");
    });

    it("does not add duplicate gateway candidate", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      // The config already has ["ws://backup.local:18789"]
      addGatewayCandidate("ws://backup.local:18789");

      // Should not call writeFileSync because URL already exists
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it("removes gateway candidate", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const removed = removeGatewayCandidate("ws://backup.local:18789");

      expect(removed).toBe(true);
      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayCandidates).not.toContain("ws://backup.local:18789");
    });

    it("returns false when removing non-existent candidate", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const removed = removeGatewayCandidate("ws://nonexistent.local:18789");

      expect(removed).toBe(false);
    });
  });

  describe("public URL functions", () => {
    it("gets public URL", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getPublicUrl()).toBe("https://public.example.com");
    });

    it("sets public URL", () => {
      existsSync.mockReturnValue(false);

      setPublicUrl("https://new-public.example.com");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.publicUrl).toBe("https://new-public.example.com");
    });
  });

  describe("display name and device ID", () => {
    it("gets display name", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getDisplayName()).toBe("Test Device");
    });

    it("gets device ID", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getDeviceId()).toBe("test-device-id");
    });
  });

  describe("auth token and password", () => {
    it("gets token", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getToken()).toBe("test-token");
    });

    it("sets token", () => {
      existsSync.mockReturnValue(false);

      setToken("new-token");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.token).toBe("new-token");
    });

    it("gets password", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getPassword()).toBe("test-password");
    });

    it("sets password", () => {
      existsSync.mockReturnValue(false);

      setPassword("new-password");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.password).toBe("new-password");
    });
  });

  describe("clearAuth", () => {
    it("clears token and password", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      clearAuth();

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.token).toBeNull();
      expect(writtenData.password).toBeNull();
    });
  });

  describe("auto-discovery", () => {
    it("returns true when auto-discovery is enabled (default)", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({ autoDiscovery: true }));

      expect(isAutoDiscoveryEnabled()).toBe(true);
    });

    it("returns true when auto-discovery not explicitly set", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({}));

      expect(isAutoDiscoveryEnabled()).toBe(true);
    });

    it("returns false when auto-discovery is disabled", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({ autoDiscovery: false }));

      expect(isAutoDiscoveryEnabled()).toBe(false);
    });

    it("sets auto-discovery", () => {
      existsSync.mockReturnValue(false);

      setAutoDiscovery(false);

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.autoDiscovery).toBe(false);
    });
  });

  describe("preferred gateway", () => {
    it("gets preferred gateway", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getPreferredGateway()).toBe("ws://preferred.local:18789");
    });

    it("sets preferred gateway", () => {
      existsSync.mockReturnValue(false);

      setPreferredGateway("ws://new-preferred.local:18789");

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.preferredGateway).toBe("ws://new-preferred.local:18789");
    });
  });

  describe("discovery timeout", () => {
    it("gets discovery timeout", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      expect(getDiscoveryTimeout()).toBe(5000);
    });

    it("returns default timeout when not set", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({}));

      expect(getDiscoveryTimeout()).toBe(3000);
    });

    it("sets discovery timeout", () => {
      existsSync.mockReturnValue(false);

      setDiscoveryTimeout(10000);

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.discoveryTimeout).toBe(10000);
    });
  });

  describe("getAllGatewayUrls", () => {
    it("returns all gateway URLs (primary + candidates)", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const urls = getAllGatewayUrls();

      expect(urls).toContain("ws://gateway.local:18789");
      expect(urls).toContain("ws://backup.local:18789");
    });

    it("deduplicates URLs", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        gatewayUrl: "ws://same.local:18789",
        gatewayCandidates: ["ws://same.local:18789", "ws://other.local:18789"],
      }));

      const urls = getAllGatewayUrls();

      expect(urls).toEqual(["ws://same.local:18789", "ws://other.local:18789"]);
    });
  });

  describe("resetConfig", () => {
    it("resets to defaults but keeps pairing info", () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      resetConfig();

      const writtenData = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(writtenData.gatewayUrl).toBe("ws://gateway.local:18789");
      expect(writtenData.deviceId).toBe("test-device-id");
      expect(writtenData.displayName).toBe("Test Device");
      expect(writtenData.gatewayBind).toBeNull();
      expect(writtenData.gatewayCandidates).toEqual([]);
      expect(writtenData.token).toBeNull();
      expect(writtenData.password).toBeNull();
    });
  });
});