import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxa, escapeJxa } from "../lib/jxa.js";
import type { OmniFocusCompleteResult, OmniFocusCompleteError } from "../types.js";

export const schema = {
  task_id: z
    .string()
    .optional()
    .describe(
      "OmniFocus task ID (returned by get_tasks). Preferred over name+project.",
    ),
  task_name: z
    .string()
    .optional()
    .describe("Exact name of the task to complete"),
  project: z
    .string()
    .optional()
    .describe("Exact name of the project the task belongs to"),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

export async function handler({
  task_id,
  task_name,
  project,
}: HandlerArgs): Promise<CallToolResult> {
  try {
    if (!task_id && (!task_name || !project)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Provide either task_id, or both task_name and project.",
          },
        ],
      };
    }

    let jxa: string;

    if (task_id) {
      const escapedId = escapeJxa(task_id);
      jxa = `
        function run() {
          const app = Application('OmniFocus');
          const doc = app.defaultDocument();
          const task = doc.flattenedTasks.byId('${escapedId}');

          let taskName;
          try { taskName = task.name(); } catch(e) {
            return JSON.stringify({error: 'no_match'});
          }

          if (task.completed()) {
            return JSON.stringify({error: 'no_match'});
          }

          app.markComplete(task);

          let projName = null;
          try { projName = task.containingProject().name(); } catch(e) {}
          let tagNames = [];
          try { tagNames = task.tags().map(tag => tag.name()); } catch(e) {}

          return JSON.stringify({
            completed: true,
            id: task.id(),
            name: taskName,
            project: projName,
            tags: tagNames
          });
        }
      `;
    } else {
      const escapedName = escapeJxa(task_name!);
      const escapedProject = escapeJxa(project!);
      jxa = `
        function run() {
          const app = Application('OmniFocus');
          const doc = app.defaultDocument();
          const tasks = doc.flattenedTasks.whose({completed: false})();

          const matches = tasks.filter(t => {
            if (t.name() !== '${escapedName}') return false;
            let projName = null;
            try { projName = t.containingProject().name(); } catch(e) {}
            return projName === '${escapedProject}';
          });

          if (matches.length === 0) {
            return JSON.stringify({error: 'no_match'});
          }
          if (matches.length > 1) {
            return JSON.stringify({error: 'multiple_matches', count: matches.length});
          }

          const task = matches[0];
          app.markComplete(task);

          let tagNames = [];
          try { tagNames = task.tags().map(tag => tag.name()); } catch(e) {}

          return JSON.stringify({
            completed: true,
            id: task.id(),
            name: task.name(),
            project: '${escapedProject}',
            tags: tagNames
          });
        }
      `;
    }

    const raw = await runJxa(jxa);
    const result = JSON.parse(raw) as OmniFocusCompleteResult | OmniFocusCompleteError;

    if ("error" in result) {
      if (result.error === "no_match") {
        const target = task_id
          ? `task with ID "${task_id}"`
          : `"${task_name}" in project "${project}"`;
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No incomplete task found matching ${target}.`,
            },
          ],
        };
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Found ${result.count} tasks matching "${task_name}" in project "${project}". Cannot complete — ambiguous match.`,
          },
        ],
      };
    }

    const tags = result.tags.length
      ? ` [${result.tags.join(", ")}]`
      : "";
    return {
      content: [
        {
          type: "text",
          text: `Completed: "${result.name}" in ${result.project}${tags}`,
        },
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
