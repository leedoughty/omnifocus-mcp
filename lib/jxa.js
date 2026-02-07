import { execFile } from "node:child_process";

const OSASCRIPT_TIMEOUT_MS = 30_000;

/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 * @param {string} script - JXA source code to evaluate
 * @returns {Promise<string>} Trimmed stdout from osascript
 */
export function runJxa(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: OSASCRIPT_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`OmniFocus query failed: ${stderr || error.message}`),
          );
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

export function escapeJxa(str) {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
