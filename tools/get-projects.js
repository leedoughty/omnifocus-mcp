import { runJxa } from "../lib/jxa.js";

export const schema = {};

export async function handler() {
  try {
    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();
        const projects = doc.flattenedProjects();

        const result = projects
          .filter(p => {
            try { return p.status() === 'active status'; } catch(e) { return false; }
          })
          .map(p => ({
            name: p.name(),
            taskCount: p.flattenedTasks.whose({completed: false})().length
          }));

        return JSON.stringify(result);
      }
    `;

    const raw = await runJxa(jxa);
    const projects = JSON.parse(raw);

    const summary = projects
      .map((p) => `- ${p.name} (${p.taskCount} tasks)`)
      .join("\n");

    return {
      content: [
        { type: "text", text: summary || "No active projects found." },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }
}
