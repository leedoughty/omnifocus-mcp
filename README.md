# omnifocus-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that gives AI assistants read-only access to your [OmniFocus](https://www.omnigroup.com/omnifocus/) tasks and projects. Built with the official MCP SDK and macOS JavaScript for Automation (JXA).

## Features

- **Query tasks** - retrieve incomplete tasks with optional filtering by project, tag, or flagged status
- **List projects** - get all active projects with their incomplete task counts
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
```

## Configuration

This server works with any MCP-compatible client. Below is an example for Claude Code (`~/.claude.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/index.js"]
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
- Review pull requests
  Project: Engineering
  Flagged: yes
  Due: 2026-03-15T17:00:00.000Z
  Tags: work, code-review
- Buy biscuits
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

## License

[MIT](LICENSE)
