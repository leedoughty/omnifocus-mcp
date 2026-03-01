import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxaWithData } from "../lib/jxa.js";
import { wrapHandler } from "../lib/wrap-handler.js";
import type { OmniFocusTask } from "../types.js";

function formatTaskSummary(tasks: OmniFocusTask[]): string {
  return tasks
    .map((t) => {
      const parts = [`- ${t.name}`];
      parts.push(`  ID: ${t.id}`);
      if (t.project) parts.push(`  Project: ${t.project}`);
      if (t.flagged) parts.push(`  Flagged: yes`);
      if (t.dueDate) parts.push(`  Due: ${t.dueDate}`);
      if (t.deferDate) parts.push(`  Defer: ${t.deferDate}`);
      if (t.note) {
        const preview =
          t.note.length > 100 ? t.note.slice(0, 100) + "…" : t.note;
        parts.push(`  Note: ${preview}`);
      }
      if (t.tags.length) parts.push(`  Tags: ${t.tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n");
}

export const schema = {
  project: z
    .string()
    .optional()
    .describe("Filter by project name (case-insensitive exact match)"),
  tag: z
    .string()
    .optional()
    .describe("Filter by tag name (case-insensitive partial match)"),
  flagged_only: z.boolean().optional().describe("Only return flagged tasks"),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

const JXA_SCRIPT = `
  function run() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const allTasks = doc.flattenedTasks;

    const ids = allTasks.id();
    const names = allTasks.name();
    const completedArr = allTasks.completed();
    const droppedArr = allTasks.dropped();
    const flaggedArr = allTasks.flagged();
    const dueDates = allTasks.dueDate();
    const deferDates = allTasks.deferDate();
    const notes = allTasks.note();
    const projectNames = allTasks.containingProject.name();
    const tagArrays = allTasks.tags.name();

    const projFilter = __DATA__.project ? __DATA__.project.toLowerCase() : null;
    const tagFilter = __DATA__.tag ? __DATA__.tag.toLowerCase() : null;
    const flaggedOnly = __DATA__.flagged_only;

    const results = [];
    for (let i = 0; i < ids.length; i++) {
      if (completedArr[i] || droppedArr[i]) continue;
      if (flaggedOnly && !flaggedArr[i]) continue;
      const proj = projectNames[i] || null;
      if (projFilter && (!proj || proj.toLowerCase() !== projFilter)) continue;
      if (tagFilter) {
        const tags = tagArrays[i] || [];
        if (!tags.some(t => t.toLowerCase().indexOf(tagFilter) !== -1)) continue;
      }
      results.push({
        id: ids[i],
        name: names[i],
        project: proj,
        flagged: flaggedArr[i],
        dueDate: dueDates[i] ? dueDates[i].toISOString() : null,
        deferDate: deferDates[i] ? deferDates[i].toISOString() : null,
        note: notes[i] || '',
        tags: tagArrays[i] || []
      });
    }
    return JSON.stringify(results);
  }
`;

export const handler = wrapHandler(
  async ({
    project,
    tag,
    flagged_only,
  }: HandlerArgs): Promise<CallToolResult> => {
    const data = {
      project: project ?? null,
      tag: tag ?? null,
      flagged_only: flagged_only ?? false,
    };
    const raw = await runJxaWithData(JXA_SCRIPT, data);
    const tasks = JSON.parse(raw) as OmniFocusTask[];

    const summary = formatTaskSummary(tasks);

    return {
      content: [{ type: "text", text: summary || "No matching tasks found." }],
    };
  },
);
