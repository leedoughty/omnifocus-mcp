import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxa, escapeJxa } from "../lib/jxa.js";
import type { OmniFocusAddResult, OmniFocusAddError } from "../types.js";

export const schema = {
  task_name: z.string().min(1).describe("Name of the task to create"),
  project: z
    .string()
    .optional()
    .describe(
      "Exact name of the project to add the task to. If omitted, task goes to Inbox.",
    ),
  note: z.string().optional().describe("Note or description text for the task"),
  due_date: z
    .string()
    .optional()
    .describe(
      "Due date in ISO 8601 format (e.g. '2026-03-15' or '2026-03-15T17:00:00')",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "List of tag names to apply. Tags that do not exist in OmniFocus will be created.",
    ),
  flagged: z.boolean().optional().describe("Whether to flag the task"),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

export async function handler({
  task_name,
  project,
  note,
  due_date,
  tags,
  flagged,
}: HandlerArgs): Promise<CallToolResult> {
  try {
    if (due_date !== undefined) {
      const parsed = new Date(due_date);
      if (isNaN(parsed.getTime())) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid due date: "${due_date}". Use ISO 8601 format (e.g., '2026-03-15').`,
            },
          ],
        };
      }
    }

    const propsLines: string[] = [`name: '${escapeJxa(task_name)}'`];
    if (note !== undefined) {
      propsLines.push(`note: '${escapeJxa(note)}'`);
    }
    if (due_date !== undefined) {
      propsLines.push(
        `dueDate: new Date('${escapeJxa(new Date(due_date).toISOString())}')`,
      );
    }
    if (flagged !== undefined) {
      propsLines.push(`flagged: ${String(flagged)}`);
    }

    const projectBlock = project
      ? `
        const projects = doc.flattenedProjects.whose({name: '${escapeJxa(project)}'})();
        if (projects.length === 0) {
          return JSON.stringify({error: 'project_not_found', projectName: '${escapeJxa(project)}'});
        }
        projects[0].tasks.push(task);
      `
      : `
        doc.inboxTasks.push(task);
      `;

    let tagsBlock = "";
    if (tags && tags.length > 0) {
      const tagLookups = tags
        .map((t) => {
          const escaped = escapeJxa(t);
          return `
          (() => {
            const existing = doc.flattenedTags.whose({name: '${escaped}'})();
            if (existing.length > 0) return existing[0];
            const newTag = app.Tag({name: '${escaped}'});
            doc.tags.push(newTag);
            return doc.flattenedTags.whose({name: '${escaped}'})()[0];
          })()`;
        })
        .join(",");

      tagsBlock = `
        const resolvedTags = [${tagLookups}];
        resolvedTags.forEach(tag => app.add(tag, {to: task.tags}));
      `;
    }

    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();

        const task = app.Task({
          ${propsLines.join(",\n          ")}
        });

        ${projectBlock}

        ${tagsBlock}

        let dueDate = null;
        try { const d = task.dueDate(); if (d) dueDate = d.toISOString(); } catch(e) {}
        let tagNames = [];
        try { tagNames = task.tags().map(tag => tag.name()); } catch(e) {}
        let projName = null;
        try { projName = task.containingProject().name(); } catch(e) {}

        return JSON.stringify({
          created: true,
          name: task.name(),
          project: projName,
          flagged: task.flagged(),
          dueDate: dueDate,
          tags: tagNames
        });
      }
    `;

    const raw = await runJxa(jxa);
    const result = JSON.parse(raw) as OmniFocusAddResult | OmniFocusAddError;

    if ("error" in result) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Project "${result.projectName}" not found in OmniFocus.`,
          },
        ],
      };
    }

    const parts: string[] = [`Created: "${result.name}"`];
    if (result.project) parts.push(`Project: ${result.project}`);
    else parts.push("Project: Inbox");
    if (result.flagged) parts.push("Flagged: yes");
    if (result.dueDate) parts.push(`Due: ${result.dueDate}`);
    if (result.tags.length) parts.push(`Tags: ${result.tags.join(", ")}`);

    return {
      content: [{ type: "text", text: parts.join("\n") }],
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
