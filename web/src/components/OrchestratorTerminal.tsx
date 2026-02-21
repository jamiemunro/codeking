import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { OrchestratorSession } from "../lib/api";
import Terminal from "./Terminal";

export default function OrchestratorTerminal() {
  const [session, setSession] = useState<OrchestratorSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const startOrchestrator = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.createOrchestrator();
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start orchestrator");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startOrchestrator();
  }, [startOrchestrator]);

  const handleStop = async () => {
    try {
      await api.stopOrchestrator();
      setSession(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop");
    }
  };

  const handleRestart = async () => {
    try {
      await api.stopOrchestrator();
    } catch {
      // may already be stopped
    }
    setSession(null);
    await startOrchestrator();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        Starting orchestrator...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={startOrchestrator}
          className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-zinc-700 hover:border-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-zinc-400 font-medium">
            Orchestrator
          </span>
          <span className="text-xs text-zinc-600">{session.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="text-xs text-zinc-400 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            Restart
          </button>
          <button
            onClick={handleStop}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-zinc-700 hover:border-red-800 transition-colors"
          >
            Stop
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Terminal
          sessionId={session.id}
          wsPath={`/ws/session/${session.id}`}
        />
      </div>
    </div>
  );
}
