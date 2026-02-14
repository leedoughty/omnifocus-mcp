import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxaWithData } from "../lib/jxa.js";
import { wrapHandler } from "../lib/wrap-handler.js";
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

export const handler = wrapHandler(async ({
  task_name,
  project,
  note,
  due_date,
  tags,
  flagged,
}: HandlerArgs): Promise<CallToolResult> => {
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

    const data = {
      taskName: task_name,
      project: project ?? null,
      note: note ?? null,
      dueDate: due_date ? new Date(due_date).toISOString() : null,
      tags: tags ?? [],
      flagged: flagged ?? null,
    };

    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();

        const props = { name: __DATA__.taskName };
        if (__DATA__.note !== null) props.note = __DATA__.note;
        if (__DATA__.dueDate !== null) props.dueDate = new Date(__DATA__.dueDate);
        if (__DATA__.flagged !== null) props.flagged = __DATA__.flagged;

        const task = app.Task(props);

        if (__DATA__.project !== null) {
          const projects = doc.flattenedProjects.whose({name: __DATA__.project})();
          if (projects.length === 0) {
            return JSON.stringify({error: 'project_not_found', projectName: __DATA__.project});
          }
          projects[0].tasks.push(task);
        } else {
          doc.inboxTasks.push(task);
        }

        __DATA__.tags.forEach(function(tagName) {
          const existing = doc.flattenedTags.whose({name: tagName})();
          let tagObj;
          if (existing.length > 0) {
            tagObj = existing[0];
          } else {
            const newTag = app.Tag({name: tagName});
            doc.tags.push(newTag);
            tagObj = doc.flattenedTags.whose({name: tagName})()[0];
          }
          app.add(tagObj, {to: task.tags});
        });

        let dueDate = null;
        try { const d = task.dueDate(); if (d) dueDate = d.toISOString(); } catch(e) {}
        let tagNames = [];
        try { tagNames = task.tags().map(tag => tag.name()); } catch(e) {}
        let projName = null;
        try { projName = task.containingProject().name(); } catch(e) {}

        return JSON.stringify({
          created: true,
          id: task.id(),
          name: task.name(),
          project: projName,
          flagged: task.flagged(),
          dueDate: dueDate,
          tags: tagNames
        });
      }
    `;

    const raw = await runJxaWithData(jxa, data);
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
    parts.push(`ID: ${result.id}`);
    if (result.project) parts.push(`Project: ${result.project}`);
    else parts.push("Project: Inbox");
    if (result.flagged) parts.push("Flagged: yes");
    if (result.dueDate) parts.push(`Due: ${result.dueDate}`);
    if (result.tags.length) parts.push(`Tags: ${result.tags.join(", ")}`);

  return {
    content: [{ type: "text", text: parts.join("\n") }],
  };
});
