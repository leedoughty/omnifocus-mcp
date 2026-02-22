import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxa } from "../lib/jxa.js";
import { wrapHandler } from "../lib/wrap-handler.js";

export const schema = {};

export const handler = wrapHandler(async (): Promise<CallToolResult> => {
  const jxa = `
    function run() {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const tags = doc.flattenedTags();
      return JSON.stringify(tags.map(t => t.name()));
    }
  `;

  const raw = await runJxa(jxa);
  const tags = JSON.parse(raw) as string[];

  const summary = tags.map((t) => `- ${t}`).join("\n");

  return {
    content: [{ type: "text", text: summary || "No tags found." }],
  };
});
