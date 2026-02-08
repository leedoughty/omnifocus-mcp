# omnifocus-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that gives AI assistants access to your [OmniFocus](https://www.omnigroup.com/omnifocus/) tasks and projects. Built with the official MCP SDK and macOS JavaScript for Automation (JXA).

## Features

- **Query tasks** - retrieve incomplete tasks with optional filtering by project, tag, or flagged status
- **List projects** - get all active projects with their incomplete task counts
- **Add tasks** - create tasks with optional project, due date, tags, notes, and flagged status
- **Complete tasks** - mark tasks as complete by ID (preferred) or exact name + project match, with safety checks
- **Case-insensitive partial matching** - flexible filtering that doesn't require exact names

## Prerequisites

- **macOS** - uses `osascript` to communicate with OmniFocus
- **OmniFocus 3 or 4** installed
- **Node.js 20+**

## Installation

```bash
git clone https://github.com/leedoughty/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

## Configuration

This server works with any MCP-compatible client. Below is an example for Claude Code (`~/.claude.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

On first use, macOS will prompt you to grant the terminal permission to control OmniFocus via System Settings > Privacy & Security > Automation.

## Tools

### `omnifocus_get_tasks`

Returns incomplete tasks from OmniFocus.

| Parameter      | Type               | Description                                             |
| -------------- | ------------------ | ------------------------------------------------------- |
| `project`      | string (optional)  | Filter by project name (case-insensitive partial match) |
| `tag`          | string (optional)  | Filter by tag name (case-insensitive partial match)     |
| `flagged_only` | boolean (optional) | Only return flagged tasks                               |

**Example output:**

```
- Review pull requests (id: abc123DEF)
  Project: Engineering
  Flagged: yes
  Due: 2026-03-15T17:00:00.000Z
  Tags: work, code-review
- Buy biscuits (id: xyz789GHI)
  Project: Errands
  Tags: personal
```

### `omnifocus_get_projects`

Returns all active projects with their incomplete task counts.

**Example output:**

```
- Engineering (12 tasks)
- Errands (3 tasks)
- Home Renovation (7 tasks)
```

### `omnifocus_complete_task`

Mark a task as complete in OmniFocus. Accepts a task ID (preferred) or exact task name + project. Refuses to act if multiple tasks match.

| Parameter   | Type              | Description                                                    |
| ----------- | ----------------- | -------------------------------------------------------------- |
| `task_id`   | string (optional) | OmniFocus task ID (returned by `get_tasks`). Preferred method. |
| `task_name` | string (optional) | Exact name of the task to complete                             |
| `project`   | string (optional) | Exact name of the project the task belongs to                  |

Provide either `task_id`, or both `task_name` and `project`.

**Safety behaviour:**

- No match found → returns error
- Multiple matches → returns error with count, completes nothing
- Exactly one match → completes the task and returns confirmation

### `omnifocus_add_task`

Add a new task to OmniFocus. If no project is specified, the task goes to the Inbox.

| Parameter   | Type               | Description                                                                |
| ----------- | ------------------ | -------------------------------------------------------------------------- |
| `task_name` | string             | Name of the task to create                                                 |
| `project`   | string (optional)  | Exact project name. If omitted, task goes to Inbox                         |
| `note`      | string (optional)  | Note or description text                                                   |
| `due_date`  | string (optional)  | Due date in ISO 8601 format (e.g., `2026-03-15` or `2026-03-15T17:00:00`) |
| `tags`      | string[] (optional)| Tag names to apply. Non-existent tags are created automatically            |
| `flagged`   | boolean (optional) | Whether to flag the task                                                   |

**Example output:**

```
Created: "Buy biscuits" (id: xyz789GHI)
Project: Errands
Due: 2026-03-20T00:00:00.000Z
Tags: personal
```

## License

[MIT](LICENSE)
