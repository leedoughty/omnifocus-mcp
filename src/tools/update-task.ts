import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxaWithData } from "../lib/jxa.js";
import { wrapHandler } from "../lib/wrap-handler.js";
import type { OmniFocusUpdateResult, OmniFocusUpdateError } from "../types.js";

export const schema = {
  task_id: z.string().describe("OmniFocus task ID (returned by get_tasks)"),
  name: z.string().optional().describe("New name for the task"),
  due_date: z
    .string()
    .nullable()
    .optional()
    .describe("New due date in ISO 8601 format, or null to clear the due date"),
  defer_date: z
    .string()
    .nullable()
    .optional()
    .describe(
      "New defer (start) date in ISO 8601 format, or null to clear the defer date",
    ),
  flagged: z.boolean().optional().describe("Set flagged status"),
  note: z
    .string()
    .nullable()
    .optional()
    .describe("New note text, or null to clear the note"),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "Replace all tags with this list. Non-existent tags are created automatically.",
    ),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

export const handler = wrapHandler(
  async ({
    task_id,
    name,
    due_date,
    defer_date,
    flagged,
    note,
    tags,
  }: HandlerArgs): Promise<CallToolResult> => {
    const hasUpdate =
      name !== undefined ||
      due_date !== undefined ||
      defer_date !== undefined ||
      flagged !== undefined ||
      note !== undefined ||
      tags !== undefined;

    if (!hasUpdate) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No properties to update. Provide at least one of: name, due_date, defer_date, flagged, note, tags.",
          },
        ],
      };
    }

    if (due_date !== undefined && due_date !== null) {
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

    if (defer_date !== undefined && defer_date !== null) {
      const parsed = new Date(defer_date);
      if (isNaN(parsed.getTime())) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid defer date: "${defer_date}". Use ISO 8601 format (e.g., '2026-03-15').`,
            },
          ],
        };
      }
    }

    const data = {
      taskId: task_id,
      name: name ?? null,
      dueDate:
        due_date === undefined
          ? undefined
          : due_date === null
            ? null
            : new Date(due_date).toISOString(),
      deferDate:
        defer_date === undefined
          ? undefined
          : defer_date === null
            ? null
            : new Date(defer_date).toISOString(),
      flagged: flagged ?? null,
      note: note === undefined ? undefined : note,
      tags: tags ?? null,
    };

    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const task = doc.flattenedTasks.byId(__DATA__.taskId);

        let taskName;
        try { taskName = task.name(); } catch(e) {
          return JSON.stringify({error: 'not_found'});
        }

        if (task.completed()) {
          return JSON.stringify({error: 'not_found'});
        }

        if (__DATA__.name !== null) {
          task.name.set(__DATA__.name);
        }

        if (__DATA__.dueDate !== undefined) {
          task.dueDate.set(__DATA__.dueDate !== null ? new Date(__DATA__.dueDate) : null);
        }

        if (__DATA__.deferDate !== undefined) {
          task.deferDate.set(__DATA__.deferDate !== null ? new Date(__DATA__.deferDate) : null);
        }

        if (__DATA__.flagged !== null) {
          task.flagged.set(__DATA__.flagged);
        }

        if (__DATA__.note !== undefined) {
          task.note.set(__DATA__.note !== null ? __DATA__.note : '');
        }

        if (__DATA__.tags !== null) {
          // Remove existing tags
          const currentTags = task.tags();
          for (let i = currentTags.length - 1; i >= 0; i--) {
            app.remove(currentTags[i], {from: task.tags});
          }

          // Add new tags
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
        }

        let dueDate = null;
        try { const d = task.dueDate(); if (d) dueDate = d.toISOString(); } catch(e) {}
        let deferDate = null;
        try { const d = task.deferDate(); if (d) deferDate = d.toISOString(); } catch(e) {}
        let noteText = '';
        try { noteText = task.note() || ''; } catch(e) {}
        let tagNames = [];
        try { tagNames = task.tags().map(tag => tag.name()); } catch(e) {}
        let projName = null;
        try { projName = task.containingProject().name(); } catch(e) {}

        return JSON.stringify({
          updated: true,
          id: task.id(),
          name: task.name(),
          project: projName,
          flagged: task.flagged(),
          dueDate: dueDate,
          deferDate: deferDate,
          note: noteText,
          tags: tagNames
        });
      }
    `;

    const raw = await runJxaWithData(jxa, data);
    const result = JSON.parse(raw) as
      | OmniFocusUpdateResult
      | OmniFocusUpdateError;

    if ("error" in result) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `No incomplete task found with ID "${task_id}".`,
          },
        ],
      };
    }

    const parts: string[] = [`Updated: "${result.name}"`];
    parts.push(`ID: ${result.id}`);
    if (result.project) parts.push(`Project: ${result.project}`);
    if (result.flagged) parts.push("Flagged: yes");
    if (result.dueDate) parts.push(`Due: ${result.dueDate}`);
    if (result.deferDate) parts.push(`Defer: ${result.deferDate}`);
    if (result.note) parts.push(`Note: ${result.note}`);
    if (result.tags.length) parts.push(`Tags: ${result.tags.join(", ")}`);

    return {
      content: [{ type: "text", text: parts.join("\n") }],
    };
  },
);
