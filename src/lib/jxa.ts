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

/**
 * Execute a JXA script with data passed safely via JSON.stringify.
 * Data is available inside the script as `__DATA__`.
 */
export function runJxaWithData(
  script: string,
  data: Record<string, unknown>,
): Promise<string> {
  const dataDecl = `const __DATA__ = ${JSON.stringify(data)};`;
  return runJxa(`${dataDecl}\n${script}`);
}
