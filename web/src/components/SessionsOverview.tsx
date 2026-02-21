import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { SessionSummary } from "../lib/api";

export default function SessionsOverview() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.getOrchestratorSessions();
        if (!cancelled) setSessions(data);
      } catch {
        // ignore
      }
    }
    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const running = sessions.filter((s) => s.status === "running");
  const stopped = sessions.filter((s) => s.status !== "running");

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
        Sessions ({running.length} running)
      </h3>
      {sessions.length === 0 && (
        <p className="text-sm text-zinc-600">No sessions</p>
      )}
      <div className="space-y-2">
        {running.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
        {stopped.slice(0, 5).map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionSummary }) {
  const isRunning = session.status === "running";
  return (
    <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500" : "bg-zinc-600"}`}
          />
          <span className="text-sm font-medium">
            {session.repo_name}/{session.branch}
          </span>
        </div>
        <span className="text-xs text-zinc-500">{session.id}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 capitalize">{session.cli_type}</span>
        {session.snippet && (
          <span className="text-xs text-zinc-600 truncate max-w-[200px]" title={session.snippet}>
            {session.snippet}
          </span>
        )}
      </div>
    </div>
  );
}
