import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxaWithData } from "../lib/jxa.js";
import { wrapHandler } from "../lib/wrap-handler.js";
import type { OmniFocusCompletedTask } from "../types.js";

function formatCompletedTaskSummary(tasks: OmniFocusCompletedTask[]): string {
  return tasks
    .map((t) => {
      const parts = [`- ${t.name}`];
      parts.push(`  ID: ${t.id}`);

      if (t.project) parts.push(`  Project: ${t.project}`);
      if (t.flagged) parts.push(`  Flagged: yes`);
      if (t.dueDate) parts.push(`  Due: ${t.dueDate}`);
      parts.push(`  Completed: ${t.completionDate}`);

      if (t.tags.length) parts.push(`  Tags: ${t.tags.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n");
}

export const schema = {
  since: z
    .string()
    .describe(
      "Return tasks completed on or after this date. ISO 8601 format (e.g. '2026-02-13').",
    ),
  project: z
    .string()
    .optional()
    .describe("Filter by project name (case-insensitive exact match)"),
  tag: z
    .string()
    .optional()
    .describe("Filter by tag name (case-insensitive partial match)"),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

const JXA_SCRIPT = `
  function run() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const allTasks = doc.flattenedTasks;

    const ids = allTasks.id();
    const names = allTasks.name();
    const flaggedArr = allTasks.flagged();
    const dueDates = allTasks.dueDate();
    const completionDates = allTasks.completionDate();
    const projectNames = allTasks.containingProject.name();
    const tagArrays = allTasks.tags.name();

    const sinceDate = new Date(__DATA__.since);
    const projFilter = __DATA__.project ? __DATA__.project.toLowerCase() : null;
    const tagFilter = __DATA__.tag ? __DATA__.tag.toLowerCase() : null;

    const results = [];
    for (let i = 0; i < ids.length; i++) {
      if (!completionDates[i] || completionDates[i] < sinceDate) continue;
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
        completionDate: completionDates[i].toISOString(),
        tags: tagArrays[i] || []
      });
    }
    return JSON.stringify(results);
  }
`;

export const handler = wrapHandler(
  async ({ since, project, tag }: HandlerArgs): Promise<CallToolResult> => {
    const parsedSince = new Date(since);
    if (isNaN(parsedSince.getTime())) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid date: "${since}". Use ISO 8601 format (e.g., '2026-02-13').`,
          },
        ],
      };
    }

    const data = {
      since: parsedSince.toISOString(),
      project: project ?? null,
      tag: tag ?? null,
    };
    const raw = await runJxaWithData(JXA_SCRIPT, data);
    const tasks = JSON.parse(raw) as OmniFocusCompletedTask[];

    const summary = formatCompletedTaskSummary(tasks);

    return {
      content: [
        {
          type: "text",
          text: summary || "No completed tasks found for this period.",
        },
      ],
    };
  },
);
