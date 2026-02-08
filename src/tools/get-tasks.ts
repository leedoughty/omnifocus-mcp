import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxa } from "../lib/jxa.js";
import type { OmniFocusTask } from "../types.js";

function formatTaskSummary(tasks: OmniFocusTask[]): string {
  return tasks
    .map((t) => {
      const parts = [`- ${t.name}`];
      if (t.project) parts.push(`  Project: ${t.project}`);
      if (t.flagged) parts.push(`  Flagged: yes`);
      if (t.dueDate) parts.push(`  Due: ${t.dueDate}`);
      if (t.tags.length) parts.push(`  Tags: ${t.tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n");
}

export const schema = {
  project: z
    .string()
    .optional()
    .describe("Filter by project name (case-insensitive partial match)"),
  tag: z
    .string()
    .optional()
    .describe("Filter by tag name (case-insensitive partial match)"),
  flagged_only: z.boolean().optional().describe("Only return flagged tasks"),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

export async function handler({
  project,
  tag,
  flagged_only,
}: HandlerArgs): Promise<CallToolResult> {
  try {
    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const tasks = doc.flattenedTasks.whose({completed: false})();

        const result = tasks.map(t => {
          let projName = null;
          try { projName = t.containingProject().name(); } catch(e) {}
          let dueDate = null;
          try { const d = t.dueDate(); if (d) dueDate = d.toISOString(); } catch(e) {}
          let tagNames = [];
          try { tagNames = t.tags().map(tag => tag.name()); } catch(e) {}

          return {
            name: t.name(),
            project: projName,
            flagged: t.flagged(),
            dueDate: dueDate,
            tags: tagNames
          };
        });

        return JSON.stringify(result);
      }
    `;

    const raw = await runJxa(jxa);
    let tasks = JSON.parse(raw) as OmniFocusTask[];

    if (flagged_only) {
      tasks = tasks.filter((t) => t.flagged);
    }

    if (project) {
      const p = project.toLowerCase();
      tasks = tasks.filter(
        (t) => t.project != null && t.project.toLowerCase().includes(p),
      );
    }

    if (tag) {
      const tg = tag.toLowerCase();
      tasks = tasks.filter((t) =>
        t.tags.some((name) => name.toLowerCase().includes(tg)),
      );
    }

    const summary = formatTaskSummary(tasks);

    return {
      content: [
        { type: "text", text: summary || "No matching tasks found." },
      ],
    };
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
}
