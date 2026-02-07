import { z } from "zod";
import { runJxa, escapeJxa } from "../lib/jxa.js";

export const schema = {
  task_name: z.string().describe("Exact name of the task to complete"),
  project: z
    .string()
    .describe("Exact name of the project the task belongs to"),
};

export async function handler({ task_name, project }) {
  try {
    const escapedName = escapeJxa(task_name);
    const escapedProject = escapeJxa(project);

    const jxa = `
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
          name: task.name(),
          project: '${escapedProject}',
          tags: tagNames
        });
      }
    `;

    const raw = await runJxa(jxa);
    const result = JSON.parse(raw);

    if (result.error === "no_match") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `No incomplete task found matching "${task_name}" in project "${project}".`,
          },
        ],
      };
    }

    if (result.error === "multiple_matches") {
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
      content: [{ type: "text", text: error.message }],
    };
  }
}
