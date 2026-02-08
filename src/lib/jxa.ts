import { execFile } from "node:child_process";

const OSASCRIPT_TIMEOUT_MS = 30_000;

/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 */
export function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: OSASCRIPT_TIMEOUT_MS },
      (error: Error | null, stdout: string, stderr: string) => {
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

export function escapeJxa(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
