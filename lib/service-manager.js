import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";

const XWORKMATE_DIR = join(homedir(), ".xworkmate");

export function getPlatform() {
  const platform = process.platform;
  if (platform === "darwin") {
    return "macos";
  }
  if (platform === "win32") {
    return "windows";
  }
  return "linux";
}

// macOS (launchd)
function getLaunchAgentPath() {
  return join(homedir(), "Library", "LaunchAgents", "com.xworkmate.relay.plist");
}

function createLaunchAgentPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.xworkmate.relay</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${join(homedir(), ".nvm", "versions", "node", process.version.replace("v", ""), "bin", "xworkmate")}</string>
    <string>relay-daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(XWORKMATE_DIR, "relay.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(XWORKMATE_DIR, "relay.log")}</string>
</dict>
</plist>
`;
}

function installLaunchAgent() {
  const plistPath = getLaunchAgentPath();
  const plistContent = createLaunchAgentPlist();
  writeFileSync(plistPath, plistContent);

  // Try to determine the actual xworkmate path
  let xworkmatePath = "";
  try {
    xworkmatePath = execSync("which xworkmate", { encoding: "utf8" }).trim();
  } catch {
    // Try npm global path
    const npmPrefix = execSync("npm config get prefix", { encoding: "utf8" }).trim();
    xworkmatePath = join(npmPrefix, "bin", "xworkmate");
  }

  // Update plist with actual path
  const updatedPlist = plistContent.replace(
    /<string>.*xworkmate<\/string>/,
    `<string>${xworkmatePath}</string>`
  );
  writeFileSync(plistPath, updatedPlist);

  execSync(`launchctl load ${plistPath}`, { stdio: "inherit" });
  return plistPath;
}

function uninstallLaunchAgent() {
  const plistPath = getLaunchAgentPath();
  if (!existsSync(plistPath)) {
    return false;
  }
  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: "inherit" });
    unlinkSync(plistPath);
    return true;
  } catch {
    return false;
  }
}

// Linux (systemd)
function getSystemdServicePath() {
  return join(homedir(), ".config", "systemd", "user", "xworkmate-relay.service");
}

function createSystemdService() {
  let xworkmatePath = "";
  try {
    xworkmatePath = execSync("which xworkmate", { encoding: "utf8" }).trim();
  } catch {
    // Try npm global path
    const npmPrefix = execSync("npm config get prefix", { encoding: "utf8" }).trim();
    xworkmatePath = join(npmPrefix, "bin", "xworkmate");
  }

  return `[Unit]
Description=XWorkmate Relay Daemon
After=network.target

[Service]
Type=simple
ExecStart=${xworkmatePath} relay-daemon
Restart=always
RestartSec=5
StandardOutput=append:${join(XWORKMATE_DIR, "relay.log")}
StandardError=append:${join(XWORKMATE_DIR, "relay.log")}

[Install]
WantedBy=default.target
`;
}

function installSystemdService() {
  const servicePath = getSystemdServicePath();
  const serviceContent = createSystemdService();
  writeFileSync(servicePath, serviceContent);

  execSync("systemctl --user daemon-reload", { stdio: "inherit" });
  execSync("systemctl --user enable xworkmate-relay", { stdio: "inherit" });
  execSync("systemctl --user start xworkmate-relay", { stdio: "inherit" });

  return servicePath;
}

function uninstallSystemdService() {
  const servicePath = getSystemdServicePath();
  if (!existsSync(servicePath)) {
    return false;
  }
  try {
    execSync("systemctl --user stop xworkmate-relay", { stdio: "inherit" });
    execSync("systemctl --user disable xworkmate-relay", { stdio: "inherit" });
    unlinkSync(servicePath);
    execSync("systemctl --user daemon-reload", { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

// Windows (scheduled task)
function getWindowsTaskName() {
  return "XWorkmateRelay";
}

function installWindowsTask() {
  let xworkmatePath = "";
  try {
    xworkmatePath = execSync("where xworkmate", { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    // Try npm global path
    const npmPrefix = execSync("npm prefix -g", { encoding: "utf8" }).trim();
    xworkmatePath = join(npmPrefix, "xworkmate.cmd");
  }

  const taskName = getWindowsTaskName();
  const logPath = join(XWORKMATE_DIR, "relay.log");
  const command = `${xworkmatePath} relay-daemon`;

  execSync(
    `schtasks /create /tn "${taskName}" /tr "${command}" /sc onlogon /rl highest /f`,
    { stdio: "inherit" }
  );

  return taskName;
}

function uninstallWindowsTask() {
  const taskName = getWindowsTaskName();
  try {
    execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

// Public API
export function installService() {
  const platform = getPlatform();
  switch (platform) {
    case "macos":
      return installLaunchAgent();
    case "linux":
      return installSystemdService();
    case "windows":
      return installWindowsTask();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function uninstallService() {
  const platform = getPlatform();
  switch (platform) {
    case "macos":
      return uninstallLaunchAgent();
    case "linux":
      return uninstallSystemdService();
    case "windows":
      return uninstallWindowsTask();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function getServiceStatus() {
  const platform = getPlatform();
  try {
    switch (platform) {
      case "macos": {
        const output = execSync("launchctl list | grep com.xworkmate.relay", { encoding: "utf8" });
        return output.trim() ? "running" : "stopped";
      }
      case "linux": {
        const output = execSync("systemctl --user is-active xworkmate-relay", { encoding: "utf8" });
        return output.trim() || "unknown";
      }
      case "windows": {
        const output = execSync(`schtasks /query /tn "${getWindowsTaskName()}"`, { encoding: "utf8" });
        return output.includes("Ready") ? "running" : "stopped";
      }
      default:
        return "unknown";
    }
  } catch {
    return "not_installed";
  }
}