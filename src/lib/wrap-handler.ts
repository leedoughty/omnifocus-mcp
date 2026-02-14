import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function wrapHandler<T>(
  fn: (args: T) => Promise<CallToolResult>,
): (args: T) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await fn(args);
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  };
}
