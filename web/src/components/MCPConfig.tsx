import { useState, useEffect, useCallback } from "react";
import { api, type MCPConfig as MCPConfigType, type MCPServerConfig } from "../lib/api";

interface MCPConfigProps {
  sessionId: string;
}

interface EditingServer {
  name: string;
  config: MCPServerConfig;
  isNew: boolean;
}

function ServerForm({
  server,
  onSave,
  onCancel,
}: {
  server: EditingServer;
  onSave: (name: string, config: MCPServerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [command, setCommand] = useState(server.config.command);
  const [args, setArgs] = useState(server.config.args?.join(" ") ?? "");
  const [envPairs, setEnvPairs] = useState<[string, string][]>(() => {
    const entries = Object.entries(server.config.env ?? {});
    return entries.length > 0 ? entries : [["", ""]];
  });

  const handleSubmit = () => {
    if (!name.trim() || !command.trim()) return;

    const env: Record<string, string> = {};
    for (const [k, v] of envPairs) {
      if (k.trim()) env[k.trim()] = v;
    }

    const config: MCPServerConfig = {
      type: "stdio",
      command: command.trim(),
    };
    if (args.trim()) config.args = args.trim().split(/\s+/);
    if (Object.keys(env).length > 0) config.env = env;

    onSave(name.trim(), config);
  };

  return (
    <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Server Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
          disabled={!server.isNew}
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Command
        </label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="node"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Arguments (space-separated)
        </label>
        <input
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="/path/to/server.js --flag"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Environment Variables
        </label>
        {envPairs.map(([k, v], i) => (
          <div key={i} className="flex gap-1 mb-1">
            <input
              value={k}
              onChange={(e) => {
                const next = [...envPairs];
                next[i] = [e.target.value, v];
                setEnvPairs(next as [string, string][]);
              }}
              placeholder="KEY"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
            />
            <input
              value={v}
              onChange={(e) => {
                const next = [...envPairs];
                next[i] = [k, e.target.value];
                setEnvPairs(next as [string, string][]);
              }}
              placeholder="value"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={() => setEnvPairs(envPairs.filter((_, j) => j !== i))}
              className="text-zinc-600 hover:text-zinc-300 px-1 text-xs"
              title="Remove"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          onClick={() => setEnvPairs([...envPairs, ["", ""]])}
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          + Add variable
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !command.trim()}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {server.isNew ? "Add" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MCPConfig({ sessionId }: MCPConfigProps) {
  const [config, setConfig] = useState<MCPConfigType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingServer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Env vars state
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [envPairs, setEnvPairs] = useState<[string, string][]>([["", ""]]);
  const [editingEnv, setEditingEnv] = useState(false);
  const [savingEnv, setSavingEnv] = useState(false);

  const loadConfig = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getMCPConfig(sessionId),
      api.getSessionEnv(sessionId),
    ])
      .then(([mcpConfig, env]) => {
        setConfig(mcpConfig);
        setEnvVars(env);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(
    async (newConfig: MCPConfigType) => {
      setSaving(true);
      try {
        const saved = await api.updateMCPConfig(sessionId, newConfig);
        setConfig(saved);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [sessionId],
  );

  const handleDelete = useCallback(
    (name: string) => {
      if (!config) return;
      const next = { ...config, mcpServers: { ...config.mcpServers } };
      delete next.mcpServers[name];
      saveConfig(next);
    },
    [config, saveConfig],
  );

  const handleSaveServer = useCallback(
    (name: string, serverConfig: MCPServerConfig) => {
      if (!config) return;
      const next = {
        ...config,
        mcpServers: { ...config.mcpServers, [name]: serverConfig },
      };
      saveConfig(next);
      setEditing(null);
    },
    [config, saveConfig],
  );

  const handleStartEditEnv = useCallback(() => {
    const entries = Object.entries(envVars);
    setEnvPairs(entries.length > 0 ? entries as [string, string][] : [["", ""]]);
    setEditingEnv(true);
  }, [envVars]);

  const handleSaveEnv = useCallback(async () => {
    setSavingEnv(true);
    const newEnv: Record<string, string> = {};
    for (const [k, v] of envPairs) {
      if (k.trim()) newEnv[k.trim()] = v;
    }
    try {
      const saved = await api.updateSessionEnv(sessionId, newEnv);
      setEnvVars(saved);
      setEditingEnv(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingEnv(false);
    }
  }, [sessionId, envPairs]);

  const servers = config ? Object.entries(config.mcpServers) : [];

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-medium text-zinc-400">Session Config</span>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-zinc-600">Saving...</span>
          )}
          <button
            onClick={loadConfig}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Refresh config"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-zinc-600">Loading...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-red-400">{error}</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {servers.length === 0 && !editing && (
            <p className="text-xs text-zinc-600 py-2">
              No MCP servers configured. Claude Code&apos;s built-in notepad
              server is added automatically on session creation.
            </p>
          )}

          {/* Server list */}
          {servers.map(([name, serverConfig]) => {
            const isBuiltin = name === "forge-notepad";
            return (
              <div
                key={name}
                className="border border-zinc-800 rounded-lg p-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {name}
                    </span>
                    {isBuiltin && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                        built-in
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        setEditing({ name, config: serverConfig, isNew: false })
                      }
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 transition-colors"
                    >
                      Edit
                    </button>
                    {!isBuiltin && (
                      <button
                        onClick={() => handleDelete(name)}
                        className="text-[10px] text-red-500/60 hover:text-red-400 px-1.5 py-0.5 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500 font-mono truncate">
                  {serverConfig.command}
                  {serverConfig.args ? ` ${serverConfig.args.join(" ")}` : ""}
                </div>
                {serverConfig.env &&
                  Object.keys(serverConfig.env).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.keys(serverConfig.env).map((key) => (
                        <span
                          key={key}
                          className="text-[9px] px-1.5 py-0.5 bg-zinc-900 text-zinc-500 rounded font-mono"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            );
          })}

          {/* Edit/Add form */}
          {editing && (
            <ServerForm
              server={editing}
              onSave={handleSaveServer}
              onCancel={() => setEditing(null)}
            />
          )}

          {/* Add button */}
          {!editing && (
            <button
              onClick={() =>
                setEditing({
                  name: "",
                  config: { command: "", type: "stdio" },
                  isNew: true,
                })
              }
              className="w-full border border-dashed border-zinc-700 hover:border-zinc-500 rounded-lg py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + Add MCP Server
            </button>
          )}

          {/* Env Vars Section */}
          <div className="pt-3 mt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-400">
                Environment Variables
              </span>
              {!editingEnv && (
                <button
                  onClick={handleStartEditEnv}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {!editingEnv ? (
              Object.keys(envVars).length === 0 ? (
                <p className="text-xs text-zinc-600 py-1">
                  No env vars set. These are passed to the session PTY on next
                  restart.
                </p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(envVars).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center gap-2 text-[10px] font-mono"
                    >
                      <span className="text-zinc-300">{k}</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-zinc-500 truncate">{v}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-1">
                {envPairs.map(([k, v], i) => (
                  <div key={i} className="flex gap-1">
                    <input
                      value={k}
                      onChange={(e) => {
                        const next = [...envPairs] as [string, string][];
                        next[i] = [e.target.value, v];
                        setEnvPairs(next);
                      }}
                      placeholder="KEY"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
                    />
                    <input
                      value={v}
                      onChange={(e) => {
                        const next = [...envPairs] as [string, string][];
                        next[i] = [k, e.target.value];
                        setEnvPairs(next);
                      }}
                      placeholder="value"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
                    />
                    <button
                      onClick={() =>
                        setEnvPairs(envPairs.filter((_, j) => j !== i))
                      }
                      className="text-zinc-600 hover:text-zinc-300 px-1 text-xs"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setEnvPairs([...envPairs, ["", ""]])
                  }
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  + Add variable
                </button>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveEnv}
                    disabled={savingEnv}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {savingEnv ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingEnv(false)}
                    className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
