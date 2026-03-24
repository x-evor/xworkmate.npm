import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const XWORKMATE_DIR = join(homedir(), ".xworkmate");
const CONFIG_PATH = join(XWORKMATE_DIR, "config.json");

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  version: 1,
  gatewayUrl: null,
  gatewayBind: null, // "loopback", "lan", or null for auto
  gatewayCandidates: [], // Array of alternative gateway URLs
  publicUrl: null, // Public URL for remote access
  deviceId: null,
  displayName: null,
  token: null, // Auth token for gateway
  password: null, // Auth password for gateway
  autoDiscovery: true, // Enable/disable auto-discovery
  preferredGateway: null, // Preferred gateway URL
  discoveryTimeout: 3000, // Timeout for gateway discovery in ms
};

/**
 * Check if config file exists
 * @returns {boolean}
 */
export function configExists() {
  return existsSync(CONFIG_PATH);
}

/**
 * Read config file
 * @returns {Object} Config object with defaults applied
 */
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const stored = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write config file
 * @param {Object} config - Config object to write
 */
export function writeConfig(config) {
  mkdirSync(XWORKMATE_DIR, { recursive: true });
  const merged = { ...DEFAULT_CONFIG, ...config };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Update specific config keys without overwriting others
 * @param {Object} updates - Config keys to update
 */
export function updateConfig(updates) {
  const current = readConfig();
  writeConfig({ ...current, ...updates });
}

/**
 * Get gateway URL from config
 * @returns {string|null} Gateway URL or null if not found
 */
export function getGatewayUrl() {
  const config = readConfig();
  return config?.gatewayUrl || null;
}

/**
 * Set gateway URL in config
 * @param {string} url - Gateway URL to set
 */
export function setGatewayUrl(url) {
  updateConfig({ gatewayUrl: url });
}

/**
 * Get gateway bind setting
 * @returns {string|null} Bind setting: "loopback", "lan", or null
 */
export function getGatewayBind() {
  const config = readConfig();
  return config?.gatewayBind || null;
}

/**
 * Set gateway bind setting
 * @param {string} bind - Bind setting: "loopback", "lan", or null
 */
export function setGatewayBind(bind) {
  updateConfig({ gatewayBind: bind });
}

/**
 * Get gateway candidate URLs
 * @returns {Array<string>} List of candidate gateway URLs
 */
export function getGatewayCandidates() {
  const config = readConfig();
  return config?.gatewayCandidates || [];
}

/**
 * Add a gateway candidate URL
 * @param {string} url - Gateway URL to add as candidate
 */
export function addGatewayCandidate(url) {
  const current = readConfig();
  const candidates = current.gatewayCandidates || [];
  if (!candidates.includes(url)) {
    updateConfig({ gatewayCandidates: [...candidates, url] });
  }
}

/**
 * Remove a gateway candidate URL
 * @param {string} url - Gateway URL to remove from candidates
 * @returns {boolean} True if removed, false if not found
 */
export function removeGatewayCandidate(url) {
  const current = readConfig();
  const candidates = current.gatewayCandidates || [];
  const index = candidates.indexOf(url);
  if (index > -1) {
    candidates.splice(index, 1);
    updateConfig({ gatewayCandidates: candidates });
    return true;
  }
  return false;
}

/**
 * Get public URL for remote access
 * @returns {string|null} Public URL or null if not configured
 */
export function getPublicUrl() {
  const config = readConfig();
  return config?.publicUrl || null;
}

/**
 * Set public URL for remote access
 * @param {string} url - Public URL to set
 */
export function setPublicUrl(url) {
  updateConfig({ publicUrl: url });
}

/**
 * Get device display name from config
 * @returns {string|null} Display name or null if not found
 */
export function getDisplayName() {
  const config = readConfig();
  return config?.displayName || null;
}

/**
 * Get device ID from config
 * @returns {string|null} Device ID or null if not configured
 */
export function getDeviceId() {
  const config = readConfig();
  return config?.deviceId || null;
}

/**
 * Get auth token from config
 * @returns {string|null} Auth token or null if not configured
 */
export function getToken() {
  const config = readConfig();
  return config?.token || null;
}

/**
 * Set auth token in config
 * @param {string} token - Auth token to set
 */
export function setToken(token) {
  updateConfig({ token });
}

/**
 * Get auth password from config
 * @returns {string|null} Auth password or null if not configured
 */
export function getPassword() {
  const config = readConfig();
  return config?.password || null;
}

/**
 * Set auth password in config
 * @param {string} password - Auth password to set
 */
export function setPassword(password) {
  updateConfig({ password });
}

/**
 * Check if auto-discovery is enabled
 * @returns {boolean} True if auto-discovery is enabled
 */
export function isAutoDiscoveryEnabled() {
  const config = readConfig();
  return config?.autoDiscovery !== false; // Default true
}

/**
 * Enable or disable auto-discovery
 * @param {boolean} enabled - Whether to enable auto-discovery
 */
export function setAutoDiscovery(enabled) {
  updateConfig({ autoDiscovery: enabled });
}

/**
 * Get preferred gateway URL
 * @returns {string|null} Preferred gateway URL or null if not configured
 */
export function getPreferredGateway() {
  const config = readConfig();
  return config?.preferredGateway || null;
}

/**
 * Set preferred gateway URL
 * @param {string} url - Preferred gateway URL
 */
export function setPreferredGateway(url) {
  updateConfig({ preferredGateway: url });
}

/**
 * Get discovery timeout
 * @returns {number} Discovery timeout in milliseconds
 */
export function getDiscoveryTimeout() {
  const config = readConfig();
  return config?.discoveryTimeout || 3000;
}

/**
 * Set discovery timeout
 * @param {number} timeout - Discovery timeout in milliseconds
 */
export function setDiscoveryTimeout(timeout) {
  updateConfig({ discoveryTimeout: timeout });
}

/**
 * Get all gateway URLs (primary + candidates)
 * @returns {Array<string>} List of all gateway URLs
 */
export function getAllGatewayUrls() {
  const config = readConfig();
  const urls = [];

  if (config?.gatewayUrl) {
    urls.push(config.gatewayUrl);
  }

  if (config?.gatewayCandidates && Array.isArray(config.gatewayCandidates)) {
    urls.push(...config.gatewayCandidates);
  }

  // Deduplicate
  return [...new Set(urls)];
}

/**
 * Clear auth credentials from config
 */
export function clearAuth() {
  updateConfig({ token: null, password: null });
}

/**
 * Reset config to defaults (except pairing info)
 */
export function resetConfig() {
  const current = readConfig();
  writeConfig({
    version: 1,
    gatewayUrl: current.gatewayUrl,
    deviceId: current.deviceId,
    displayName: current.displayName,
    // Clear the rest
    gatewayBind: null,
    gatewayCandidates: [],
    publicUrl: null,
    token: null,
    password: null,
    autoDiscovery: true,
    preferredGateway: null,
    discoveryTimeout: 3000,
  });
}