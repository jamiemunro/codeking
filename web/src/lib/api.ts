const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Health
  health: () => request<any>("/api/health"),

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
  getGitHubRepos: () => request<any[]>("/api/github/repos"),

  // Repos
  getRepos: () => request<any[]>("/api/repos"),
  addRepo: (githubUrl: string) =>
    request<any>("/api/repos", {
      method: "POST",
      body: JSON.stringify({ github_url: githubUrl }),
    }),
  deleteRepo: (id: number) =>
    request<void>(`/api/repos/${id}`, { method: "DELETE" }),
  syncRepo: (id: number) =>
    request<any>(`/api/repos/${id}/sync`, { method: "POST" }),
  getRepoBranches: (id: number) =>
    request<string[]>(`/api/repos/${id}/branches`),

  // Sessions
  getSessions: () => request<any[]>("/api/sessions"),
  createSession: (repoId: number, branch: string, cliType: string) =>
    request<any>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ repo_id: repoId, branch, cli_type: cliType }),
    }),
  deleteSession: (id: string) =>
    request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
};
