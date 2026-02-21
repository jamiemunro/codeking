import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Trigger } from "../lib/api";

export default function TriggerManager() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [eventPattern, setEventPattern] = useState("");
  const [action, setAction] = useState("send_input");
  const [configJSON, setConfigJSON] = useState("{}");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const data = await api.getTriggers();
      setTriggers(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!eventPattern.trim() || !action.trim()) return;
    setCreating(true);
    try {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configJSON);
      } catch {
        alert("Invalid JSON for config");
        setCreating(false);
        return;
      }
      await api.createTrigger({
        event_pattern: eventPattern.trim(),
        action: action.trim(),
        config,
        active: true,
      });
      setEventPattern("");
      setAction("send_input");
      setConfigJSON("{}");
      setShowCreate(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteTrigger(id);
      load();
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Triggers
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showCreate ? "Cancel" : "+ New"}
        </button>
      </div>

      {showCreate && (
        <div className="p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 mb-3 space-y-2">
          <input
            value={eventPattern}
            onChange={(e) => setEventPattern(e.target.value)}
            placeholder="Event pattern (e.g. session.stopped)"
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200"
          >
            <option value="send_input">Send Input</option>
            <option value="run_workflow">Run Workflow</option>
          </select>
          <textarea
            value={configJSON}
            onChange={(e) => setConfigJSON(e.target.value)}
            placeholder='{"session_id":"abc","data":"hello\\n"}'
            rows={2}
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 font-mono"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !eventPattern.trim()}
            className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-zinc-700 hover:border-blue-700 transition-colors disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      {triggers.length === 0 && !showCreate && (
        <p className="text-sm text-zinc-600">No triggers</p>
      )}

      <div className="space-y-2">
        {triggers.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900"
          >
            <div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${t.active ? "bg-emerald-500" : "bg-zinc-600"}`}
                />
                <p className="text-sm font-medium font-mono">{t.event_pattern}</p>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Action: {t.action}
              </p>
            </div>
            <button
              onClick={() => handleDelete(t.id)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-zinc-700 hover:border-red-800 transition-colors"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
