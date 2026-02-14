import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runJxaWithData } from "../lib/jxa.js";
import type {
  OmniFocusCreateProjectResult,
  OmniFocusCreateProjectError,
} from "../types.js";

export const schema = {
  project_name: z.string().min(1).describe("Name of the project to create"),
  type: z
    .enum(["parallel", "sequential"])
    .optional()
    .describe(
      "Whether tasks can be completed in any order (parallel) or must be done in sequence (sequential). Defaults to parallel.",
    ),
  folder: z
    .string()
    .optional()
    .describe(
      "Exact name of an existing folder to add the project to. If omitted, project is added at the top level.",
    ),
};

type HandlerArgs = { [K in keyof typeof schema]: z.infer<(typeof schema)[K]> };

export async function handler({
  project_name,
  type,
  folder,
}: HandlerArgs): Promise<CallToolResult> {
  try {
    const data = {
      projectName: project_name,
      sequential: (type ?? "parallel") === "sequential",
      folder: folder ?? null,
    };

    const jxa = `
      function run() {
        const app = Application('OmniFocus');
        const doc = app.defaultDocument();

        const proj = app.Project({
          name: __DATA__.projectName,
          sequential: __DATA__.sequential
        });

        if (__DATA__.folder !== null) {
          const folders = doc.flattenedFolders.whose({name: __DATA__.folder})();
          if (folders.length === 0) {
            return JSON.stringify({error: 'folder_not_found', folderName: __DATA__.folder});
          }
          folders[0].projects.push(proj);
        } else {
          doc.projects.push(proj);
        }

        let folderName = null;
        try { folderName = proj.folder().name(); } catch(e) {}

        return JSON.stringify({
          created: true,
          id: proj.id(),
          name: proj.name(),
          type: proj.sequential() ? 'sequential' : 'parallel',
          folder: folderName
        });
      }
    `;

    const raw = await runJxaWithData(jxa, data);
    const result = JSON.parse(raw) as
      | OmniFocusCreateProjectResult
      | OmniFocusCreateProjectError;

    if ("error" in result) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Folder "${result.folderName}" not found in OmniFocus.`,
          },
        ],
      };
    }

    const parts: string[] = [`Created project: "${result.name}"`];
    parts.push(`ID: ${result.id}`);
    parts.push(`Type: ${result.type}`);
    if (result.folder) parts.push(`Folder: ${result.folder}`);

    return {
      content: [{ type: "text", text: parts.join("\n") }],
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
