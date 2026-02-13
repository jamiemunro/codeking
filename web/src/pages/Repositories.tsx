import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

interface LocalRepo {
  id: number;
  github_url: string;
  owner: string;
  name: string;
  clone_status: string;
  default_branch: string;
  last_synced: string | null;
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  clone_url: string;
  owner_login: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string;
}

export default function Repositories() {
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([]);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadLocal = useCallback(() => {
    api.getRepos().then(setLocalRepos).catch(console.error);
  }, []);

  useEffect(() => {
    loadLocal();
    const interval = setInterval(loadLocal, 3000);
    return () => clearInterval(interval);
  }, [loadLocal]);

  const loadGitHub = async () => {
    setLoading(true);
    setError("");
    try {
      const repos = await api.getGitHubRepos();
      setGhRepos(repos);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const addRepo = async (url: string) => {
    try {
      await api.addRepo(url);
      loadLocal();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeRepo = async (id: number) => {
    await api.deleteRepo(id);
    loadLocal();
  };

  const syncRepo = async (id: number) => {
    await api.syncRepo(id);
    loadLocal();
  };

  const localFullNames = new Set(localRepos.map((r) => `${r.owner}/${r.name}`));
  const filteredGh = ghRepos.filter(
    (r) =>
      !localFullNames.has(r.full_name) &&
      r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-1">Repositories</h2>
      <p className="text-zinc-400 mb-8">
        Add GitHub repos to start coding sessions.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-md text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Local repos */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
          Local Repositories
        </h3>
        {localRepos.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No repositories added yet. Browse GitHub repos below.
          </p>
        ) : (
          <div className="space-y-2">
            {localRepos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 rounded-lg border border-zinc-800 bg-zinc-900"
              >
                <div>
                  <p className="font-medium">
                    {repo.owner}/{repo.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {repo.clone_status === "ready"
                      ? `Ready — ${repo.default_branch}`
                      : repo.clone_status === "cloning"
                        ? "Cloning..."
                        : `Error`}
                    {repo.last_synced &&
                      ` — synced ${new Date(repo.last_synced).toLocaleString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot status={repo.clone_status} />
                  {repo.clone_status === "ready" && (
                    <button
                      onClick={() => syncRepo(repo.id)}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
                    >
                      Sync
                    </button>
                  )}
                  <button
                    onClick={() => removeRepo(repo.id)}
                    className="text-xs text-zinc-400 hover:text-red-400 px-2 py-1 rounded border border-zinc-700 hover:border-red-800 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GitHub repos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            GitHub Repositories
          </h3>
          <button
            onClick={loadGitHub}
            disabled={loading}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : ghRepos.length > 0 ? "Refresh" : "Load Repos"}
          </button>
        </div>

        {ghRepos.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter repos..."
            className="w-full mb-3 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}

        <div className="space-y-2 max-h-96 overflow-auto">
          {filteredGh.map((repo) => (
            <div
              key={repo.full_name}
              className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <div>
                <p className="text-sm font-medium">{repo.full_name}</p>
                {repo.description && (
                  <p className="text-xs text-zinc-500 truncate max-w-md">
                    {repo.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {repo.private && (
                  <span className="text-xs text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
                    private
                  </span>
                )}
                <button
                  onClick={() => addRepo(repo.html_url)}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ready"
      ? "bg-emerald-500"
      : status === "cloning"
        ? "bg-amber-500 animate-pulse"
        : "bg-red-500";
  return <div className={`w-2.5 h-2.5 rounded-full ${color}`} />;
}
