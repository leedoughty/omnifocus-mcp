import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxa, escapeJxa } from "../lib/jxa.js";
import type { OmniFocusTask } from "../types.js";

function formatTaskSummary(tasks: OmniFocusTask[]): string {
  return tasks
    .map((t) => {
      const parts = [`- ${t.name} (id: ${t.id})`];
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

const MAP_TASK = `
  function mapTask(t) {
    let projName = null;
    try { projName = t.containingProject().name(); } catch(e) {}
    let dueDate = null;
    try { const d = t.dueDate(); if (d) dueDate = d.toISOString(); } catch(e) {}
    let tagNames = [];
    try { tagNames = t.tags().map(tag => tag.name()); } catch(e) {}

    return {
      id: t.id(),
      name: t.name(),
      project: projName,
      flagged: t.flagged(),
      dueDate: dueDate,
      tags: tagNames
    };
  }
`;

export async function handler({
  project,
  tag,
  flagged_only,
}: HandlerArgs): Promise<CallToolResult> {
  try {
    const whoseClause = flagged_only
      ? "{completed: false, flagged: true}"
      : "{completed: false}";

    let fetchBlock: string;
    let postFilter = "";

    if (project && tag) {
      const escapedProject = escapeJxa(project);
      const escapedTag = escapeJxa(tag);
      fetchBlock = `
        const projects = doc.flattenedProjects.whose({name: {_contains: '${escapedProject}'}})();
        let tasks = [];
        for (const p of projects) {
          tasks = tasks.concat(p.flattenedTasks.whose(${whoseClause})());
        }
      `;
      postFilter = `
        const tagFilter = '${escapedTag}'.toLowerCase();
        tasks = tasks.filter(t => {
          try {
            return t.tags().some(tag => tag.name().toLowerCase().indexOf(tagFilter) !== -1);
          } catch(e) { return false; }
        });
      `;
    } else if (project) {
      const escapedProject = escapeJxa(project);
      fetchBlock = `
        const projects = doc.flattenedProjects.whose({name: {_contains: '${escapedProject}'}})();
        let tasks = [];
        for (const p of projects) {
          tasks = tasks.concat(p.flattenedTasks.whose(${whoseClause})());
        }
      `;
    } else if (tag) {
      const escapedTag = escapeJxa(tag);
      fetchBlock = `
        const tags = doc.flattenedTags.whose({name: {_contains: '${escapedTag}'}})();
        let tasks = [];
        for (const tg of tags) {
          tasks = tasks.concat(tg.tasks.whose(${whoseClause})());
        }
      `;
    } else {
      fetchBlock = `
        let tasks = doc.flattenedTasks.whose(${whoseClause})();
      `;
    }

    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();

        ${fetchBlock}
        ${postFilter}

        ${MAP_TASK}

        return JSON.stringify(Array.from(tasks).map(mapTask));
      }
    `;

    const raw = await runJxa(jxa);
    const tasks = JSON.parse(raw) as OmniFocusTask[];

    const summary = formatTaskSummary(tasks);

    return {
      content: [{ type: "text", text: summary || "No matching tasks found." }],
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
