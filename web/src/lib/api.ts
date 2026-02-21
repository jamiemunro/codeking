const BASE = "";

export class CodekingOfflineError extends Error {
  constructor() {
    super("Codeking is offline");
    this.name = "CodekingOfflineError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new CodekingOfflineError();
  }
  if (res.status === 401) {
    window.location.href = "/auth/login";
    throw new Error("Unauthorized");
  }
  if (res.status === 502) {
    throw new CodekingOfflineError();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CodekingOfflineError();
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Health
  health: () => request<any>("/api/health"),

  // Gateway health (bypasses tunnel, always reachable when gateway is up)
  gatewayHealth: () =>
    request<{ status: string; gateway: boolean; connected: boolean }>(
      "/gateway/health",
    ),

  // Settings
  getSettings: () => request<any[]>("/api/settings"),
  getSetting: (key: string) => request<any>(`/api/settings/${key}`),
  putSetting: (key: string, value: string) =>
    request<any>(`/api/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  deleteSetting: (key: string) =>
    request<void>(`/api/settings/${key}`, { method: "DELETE" }),

  // GitHub repos
  getGitHubRepos: (query?: string, refresh?: boolean) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (refresh) params.set("refresh", "true");
    const qs = params.toString();
    return request<any[]>(`/api/github/repos${qs ? `?${qs}` : ""}`);
  },

  // Repos
  getRepos: () => request<any[]>("/api/repos"),
  addRepo: (githubUrl: string) =>
    request<any>("/api/repos", {
      method: "POST",
      body: JSON.stringify({ github_url: githubUrl }),
    }),
  addLocalRepo: (path: string) =>
    request<any>("/api/repos", {
      method: "POST",
      body: JSON.stringify({ local_path: path }),
    }),
  deleteRepo: (id: number) =>
    request<void>(`/api/repos/${id}`, { method: "DELETE" }),
  syncRepo: (id: number) =>
    request<any>(`/api/repos/${id}/sync`, { method: "POST" }),
  getRepoBranches: (id: number) =>
    request<string[]>(`/api/repos/${id}/branches`),

  // Sessions
  getSessions: () => request<any[]>("/api/sessions"),
  createSession: (
    repoId: number,
    sourceBranch: string,
    newBranch: string,
    cliType: string,
  ) =>
    request<any>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        repo_id: repoId,
        source_branch: sourceBranch,
        new_branch: newBranch,
        cli_type: cliType,
      }),
    }),
  deleteSession: (id: string, deleteLocal = true) =>
    request<void>(`/api/sessions/${id}?delete_local=${deleteLocal}`, {
      method: "DELETE",
    }),
  getSessionReplay: (id: string): Promise<ArrayBuffer> =>
    fetch(`/api/sessions/${id}/replay`).then((res) => {
      if (res.status === 401) {
        window.location.href = "/auth/login";
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Failed to fetch replay");
      return res.arrayBuffer();
    }),

  // Session Notes
  getSessionNotes: (sessionId: string) =>
    request<{ content: string; updated_at: string | null }>(
      `/api/sessions/${sessionId}/notes`,
    ),
  updateSessionNotes: (sessionId: string, content: string) =>
    request<{ content: string; updated_at: string }>(
      `/api/sessions/${sessionId}/notes`,
      {
        method: "PUT",
        body: JSON.stringify({ content }),
      },
    ),

  // File Upload
  uploadFile: async (
    sessionId: string,
    file: File,
    path?: string,
  ): Promise<{ filename: string; path: string; size: number }> => {
    const form = new FormData();
    form.append("file", file);
    if (path) form.append("path", path);
    const res = await fetch(`/api/sessions/${sessionId}/upload`, {
      method: "POST",
      body: form,
    });
    if (res.status === 401) {
      window.location.href = "/auth/login";
      throw new Error("Unauthorized");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },

  // File Browser
  getFileTree: (sessionId: string) =>
    request<FileNode[]>(`/api/sessions/${sessionId}/files/tree`),
  getFileList: (sessionId: string, path?: string) => {
    const qs = path ? `?path=${encodeURIComponent(path)}` : "";
    return request<FileEntry[]>(`/api/sessions/${sessionId}/files${qs}`);
  },
  getFileContent: (sessionId: string, path: string) =>
    request<{
      path: string;
      size: number;
      content: string;
      binary?: boolean;
      truncated?: boolean;
    }>(`/api/sessions/${sessionId}/files/read?path=${encodeURIComponent(path)}`),

  // MCP Config
  getMCPConfig: (sessionId: string) =>
    request<MCPConfig>(`/api/sessions/${sessionId}/mcp`),
  updateMCPConfig: (sessionId: string, config: MCPConfig) =>
    request<MCPConfig>(`/api/sessions/${sessionId}/mcp`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  // Session Env Vars
  getSessionEnv: (sessionId: string) =>
    request<Record<string, string>>(`/api/sessions/${sessionId}/env`),
  updateSessionEnv: (sessionId: string, env: Record<string, string>) =>
    request<Record<string, string>>(`/api/sessions/${sessionId}/env`, {
      method: "PUT",
      body: JSON.stringify(env),
    }),

  // Webhooks
  getWebhooks: () => request<Webhook[]>("/api/webhooks"),
  createWebhook: (data: Partial<Webhook>) =>
    request<Webhook>("/api/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWebhook: (id: number, data: Partial<Webhook>) =>
    request<Webhook>(`/api/webhooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWebhook: (id: number) =>
    request<void>(`/api/webhooks/${id}`, { method: "DELETE" }),
  testWebhook: (id: number) =>
    request<{ ok: boolean }>(`/api/webhooks/${id}/test`, { method: "POST" }),
};

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface Webhook {
  id: number;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface MCPServerConfig {
  type?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}
