#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const OSASCRIPT_TIMEOUT_MS = 30_000;

const { version } = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf-8"),
);

/**
 * Execute a JXA (JavaScript for Automation) script via osascript.
 * @param {string} script - JXA source code to evaluate
 * @returns {Promise<string>} Trimmed stdout from osascript
 */
function runJxa(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: OSASCRIPT_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`OmniFocus query failed: ${stderr || error.message}`),
          );
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

function formatTaskSummary(tasks) {
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

const server = new McpServer({
  name: "omnifocus-mcp",
  version,
});

server.tool(
  "omnifocus_get_tasks",
  "Get incomplete tasks from OmniFocus. Returns task name, project, flagged status, due date, and tags.",
  {
    project: z
      .string()
      .optional()
      .describe("Filter by project name (case-insensitive partial match)"),
    tag: z
      .string()
      .optional()
      .describe("Filter by tag name (case-insensitive partial match)"),
    flagged_only: z.boolean().optional().describe("Only return flagged tasks"),
  },
  async ({ project, tag, flagged_only }) => {
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
      let tasks = JSON.parse(raw);

      if (flagged_only) {
        tasks = tasks.filter((t) => t.flagged);
      }

      if (project) {
        const p = project.toLowerCase();
        tasks = tasks.filter(
          (t) => t.project && t.project.toLowerCase().includes(p),
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
        content: [{ type: "text", text: error.message }],
      };
    }
  },
);

server.tool(
  "omnifocus_get_projects",
  "Get active projects from OmniFocus with their task counts.",
  {},
  async () => {
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
  },
);

server.tool(
  "omnifocus_complete_task",
  "Mark a task as complete in OmniFocus. Requires exact task name and project name to avoid accidental completions. Refuses to act if multiple tasks match.",
  {
    task_name: z.string().describe("Exact name of the task to complete"),
    project: z.string().describe("Exact name of the project the task belongs to"),
  },
  async ({ task_name, project }) => {
    try {
      const escapedName = task_name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const escapedProject = project.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

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

      const tags = result.tags.length ? ` [${result.tags.join(", ")}]` : "";
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
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
