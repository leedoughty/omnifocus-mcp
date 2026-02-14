export interface OmniFocusTask {
  id: string;
  name: string;
  project: string | null;
  flagged: boolean;
  dueDate: string | null;
  tags: string[];
}

export interface OmniFocusProject {
  name: string;
  taskCount: number;
}

export interface OmniFocusCompleteResult {
  completed: true;
  id: string;
  name: string;
  project: string;
  tags: string[];
}

export interface OmniFocusCompleteError {
  error: "no_match" | "multiple_matches";
  count?: number;
}

export interface OmniFocusAddResult {
  created: true;
  id: string;
  name: string;
  project: string | null;
  flagged: boolean;
  dueDate: string | null;
  tags: string[];
}

export interface OmniFocusAddError {
  error: "project_not_found";
  projectName: string;
}

export interface OmniFocusUpdateResult {
  updated: true;
  id: string;
  name: string;
  project: string | null;
  flagged: boolean;
  dueDate: string | null;
  tags: string[];
}

export interface OmniFocusUpdateError {
  error: "not_found";
}

export interface OmniFocusCreateProjectResult {
  created: true;
  id: string;
  name: string;
  type: string;
  folder: string | null;
}

export interface OmniFocusCreateProjectError {
  error: "folder_not_found";
  folderName: string;
}
