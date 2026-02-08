export interface OmniFocusTask {
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
