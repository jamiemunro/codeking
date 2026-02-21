import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Workflow, WorkflowStep } from "../lib/api";

export default function WorkflowManager() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stepsJSON, setStepsJSON] = useState("[]");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const data = await api.getWorkflows();
      setWorkflows(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      let steps: WorkflowStep[];
      try {
        steps = JSON.parse(stepsJSON);
      } catch {
        alert("Invalid JSON for steps");
        setCreating(false);
        return;
      }
      await api.createWorkflow({ name: name.trim(), description: description.trim(), steps });
      setName("");
      setDescription("");
      setStepsJSON("[]");
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
      await api.deleteWorkflow(id);
      load();
    } catch {
      // ignore
    }
  };

  const handleRun = async (id: number) => {
    try {
      await api.runWorkflow(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to run");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Workflows
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600"
          />
          <textarea
            value={stepsJSON}
            onChange={(e) => setStepsJSON(e.target.value)}
            placeholder='[{"type":"shell","command":"echo hello"}]'
            rows={3}
            className="w-full px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 font-mono"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-zinc-700 hover:border-blue-700 transition-colors disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      {workflows.length === 0 && !showCreate && (
        <p className="text-sm text-zinc-600">No workflows</p>
      )}

      <div className="space-y-2">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900"
          >
            <div>
              <p className="text-sm font-medium">{wf.name}</p>
              {wf.description && (
                <p className="text-xs text-zinc-500">{wf.description}</p>
              )}
              <p className="text-xs text-zinc-600">
                {Array.isArray(wf.steps) ? wf.steps.length : 0} step(s)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRun(wf.id)}
                className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-zinc-700 hover:border-emerald-800 transition-colors"
              >
                Run
              </button>
              <button
                onClick={() => handleDelete(wf.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-zinc-700 hover:border-red-800 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
