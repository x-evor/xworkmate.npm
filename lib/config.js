import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const XWORKMATE_DIR = join(homedir(), ".xworkmate");
const CONFIG_PATH = join(XWORKMATE_DIR, "config.json");

/**
 * Check if config file exists
 * @returns {boolean}
 */
export function configExists() {
  return existsSync(CONFIG_PATH);
}

/**
 * Read config file
 * @returns {Object|null} Config object or null if not found
 */
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write config file
 * @param {Object} config - Config object to write
 */
export function writeConfig(config) {
  mkdirSync(XWORKMATE_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ version: 1, ...config }, null, 2) + "\n", { mode: 0o600 });
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
 * Get device display name from config
 * @returns {string|null} Display name or null if not found
 */
export function getDisplayName() {
  const config = readConfig();
  return config?.displayName || null;
}