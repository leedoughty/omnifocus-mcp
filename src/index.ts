#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";

import * as getTasks from "./tools/get-tasks.js";
import * as getProjects from "./tools/get-projects.js";
import * as completeTask from "./tools/complete-task.js";
import * as addTask from "./tools/add-task.js";
import * as updateTask from "./tools/update-task.js";
import * as createProject from "./tools/create-project.js";
import * as getCompletedTasks from "./tools/get-completed-tasks.js";

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

const server = new McpServer({
  name: "omnifocus-mcp",
  version,
});

server.tool(
  "omnifocus_get_tasks",
  "Get incomplete tasks from OmniFocus. Returns task ID, name, project, flagged status, due date, and tags.",
  getTasks.schema,
  getTasks.handler,
);

server.tool(
  "omnifocus_get_completed_tasks",
  "Get completed tasks from OmniFocus for a given time period. Returns task ID, name, project, flagged status, due date, completion date, and tags. Requires a 'since' date to bound the query.",
  getCompletedTasks.schema,
  getCompletedTasks.handler,
);

server.tool(
  "omnifocus_get_projects",
  "Get active projects from OmniFocus with their task counts.",
  getProjects.schema,
  getProjects.handler,
);

server.tool(
  "omnifocus_complete_task",
  "Mark a task as complete in OmniFocus. Accepts a task_id (preferred) or exact task_name + project. Refuses to act if multiple tasks match.",
  completeTask.schema,
  completeTask.handler,
);

server.tool(
  "omnifocus_add_task",
  "Add a new task to OmniFocus. Creates the task in a specified project or in the Inbox if no project is given. Optionally sets due date, tags, flagged status, and a note.",
  addTask.schema,
  addTask.handler,
);

server.tool(
  "omnifocus_update_task",
  "Update an existing task in OmniFocus by ID. Can change name, due date, flagged status, note, and tags.",
  updateTask.schema,
  updateTask.handler,
);

server.tool(
  "omnifocus_create_project",
  "Create a new project in OmniFocus. Optionally set the project type (parallel or sequential) and assign it to an existing folder.",
  createProject.schema,
  createProject.handler,
);

const transport = new StdioServerTransport();
await server.connect(transport);
