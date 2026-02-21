import { useEffect, useState } from "react";
import { api, CodekingOfflineError } from "../lib/api";
import OrchestratorTerminal from "../components/OrchestratorTerminal";
import SessionsOverview from "../components/SessionsOverview";
import WorkflowManager from "../components/WorkflowManager";
import TriggerManager from "../components/TriggerManager";

interface CLIStatus {
  name: string;
  installed: boolean;
  authed: boolean;
  path?: string;
}

interface Health {
  status: string;
  clis: CLIStatus[];
  git: boolean;
}

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [triggersOpen, setTriggersOpen] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e) => {
        if (e instanceof CodekingOfflineError) {
          setOffline(true);
        }
      });
  }, []);

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto">
      {/* Orchestrator Terminal — full width */}
      <div className="h-[50vh] min-h-[300px] border-b border-zinc-800">
        <OrchestratorTerminal />
      </div>

      {/* Two-column row: Sessions + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 sm:p-6">
        {/* Left: Sessions Overview */}
        <SessionsOverview />

        {/* Right: System Status */}
        <div>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            System Status
          </h3>
          {offline && (
            <p className="text-sm text-zinc-500">Unavailable while offline</p>
          )}
          {health && (
            <div className="space-y-2">
              <StatusCard
                label="Git"
                ok={health.git}
                detail={health.git ? "Installed" : "Not found"}
              />
              {health.clis.map((cli) => (
                <StatusCard
                  key={cli.name}
                  label={cli.name}
                  ok={cli.installed}
                  detail={!cli.installed ? "Not installed" : cli.path || "Installed"}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workflows — collapsible */}
      <div className="border-t border-zinc-800 px-4 sm:px-6 py-4">
        <button
          onClick={() => setWorkflowsOpen(!workflowsOpen)}
          className="flex items-center gap-2 text-sm font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition-colors w-full"
        >
          <span className={`transition-transform ${workflowsOpen ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          Workflows
        </button>
        {workflowsOpen && (
          <div className="mt-3">
            <WorkflowManager />
          </div>
        )}
      </div>

      {/* Triggers — collapsible */}
      <div className="border-t border-zinc-800 px-4 sm:px-6 py-4">
        <button
          onClick={() => setTriggersOpen(!triggersOpen)}
          className="flex items-center gap-2 text-sm font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition-colors w-full"
        >
          <span className={`transition-transform ${triggersOpen ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          Triggers
        </button>
        {triggersOpen && (
          <div className="mt-3">
            <TriggerManager />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900">
      <div>
        <p className="text-sm font-medium capitalize">{label}</p>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
      <div
        className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
      />
    </div>
  );
}
