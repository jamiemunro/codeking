import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, CodekingOfflineError } from "../lib/api";
import Terminal from "../components/Terminal";
import TerminalPreview from "../components/TerminalPreview";
import NewSessionModal from "../components/NewSessionModal";
import { useIdleMonitor } from "../components/IdleMonitorContext";

interface SessionInfo {
  id: string;
  repo_id: number;
  branch: string;
  cli_type: string;
  status: string;
  created_at: string;
  repo_owner: string;
  repo_name: string;
}

export default function Sessions() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const activeTab = sessionId ?? null;
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tabs" | "grid">("tabs");
  const [showModal, setShowModal] = useState(false);
  const { idleSessions } = useIdleMonitor();

  const openTab = useCallback(
    (id: string) => {
      setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
      navigate(`/sessions/${id}`);
    },
    [navigate],
  );

  const pollDelayRef = useRef(5_000);

  const load = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
      pollDelayRef.current = 5_000;
    } catch (e) {
      if (e instanceof CodekingOfflineError) {
        pollDelayRef.current = 30_000;
      } else {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function schedule() {
      timeout = setTimeout(async () => {
        await load();
        if (!cancelled) schedule();
      }, pollDelayRef.current);
    }

    load().then(() => {
      if (!cancelled) schedule();
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [load]);

  useEffect(() => {
    if (!activeTab) {
      setOpenTabs((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setOpenTabs((prev) =>
      prev.includes(activeTab) ? prev : [...prev, activeTab],
    );
  }, [activeTab]);

  const handleCreated = (session: SessionInfo) => {
    load();
    openTab(session.id);
  };

  const closeTab = (id: string) => {
    const remaining = openTabs.filter((t) => t !== id);
    setOpenTabs(remaining);
    if (activeTab === id) {
      navigate(
        remaining.length > 0
          ? `/sessions/${remaining[remaining.length - 1]}`
          : "/sessions",
      );
    }
  };

  const handleDelete = async (id: string) => {
    const session = sessions.find((s) => s.id === id);
    const target = session
      ? `${session.repo_owner}/${session.repo_name} (${session.branch})`
      : id;
    const deleteLocal = window.confirm(
      `Also delete the local branch/worktree for ${target}?\n\nOK = delete locally\nCancel = keep local files and branch`,
    );

    await api.deleteSession(id, deleteLocal);
    closeTab(id);
    load();
  };

  const runningSessions = sessions.filter((s) => s.status === "running");
  const stoppedSessions = sessions.filter((s) => s.status !== "running");

  // Tab/Grid workspace view
  if (activeTab) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header bar */}
        <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/90 px-1.5 py-1 overflow-x-auto backdrop-blur">
          <button
            onClick={() => {
              setOpenTabs([]);
              navigate("/sessions");
            }}
            className="shrink-0 rounded text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/60 px-3 py-2 transition-colors"
          >
            &larr;
          </button>

          {/* Tabs - only shown in tab mode */}
          {viewMode === "tabs" &&
            openTabs.map((id) => {
              const session = sessions.find((s) => s.id === id);
              const isActive = activeTab === id;
              const isIdle = idleSessions.has(id);
              return (
                <div
                  key={id}
                  className={`flex items-center gap-1 shrink-0 max-w-[18rem] md:max-w-none border-r border-zinc-800 ${
                    isActive
                      ? "bg-zinc-950"
                      : "bg-zinc-900/50 hover:bg-zinc-800/50"
                  }`}
                >
                  <button
                    onClick={() => navigate(`/sessions/${id}`)}
                    className={`flex items-center gap-1.5 min-w-0 px-3 py-2.5 text-sm md:text-xs transition-colors ${
                      isActive ? "text-white" : "text-zinc-400"
                    }`}
                  >
                    {isIdle && !isActive && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                    <span className="truncate">
                      {session
                        ? `${session.repo_name}/${session.branch} (${session.cli_type})`
                        : id}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(id);
                    }}
                    className="shrink-0 text-zinc-600 hover:text-zinc-300 px-2 py-2 text-base md:text-sm"
                  >
                    &times;
                  </button>
                </div>
              );
            })}

          {/* Grid mode label */}
          {viewMode === "grid" && (
            <span className="text-xs text-zinc-400 px-2">
              {openTabs.length} session{openTabs.length !== 1 ? "s" : ""}
            </span>
          )}

          <div className="flex-1" />

          {/* View mode toggle */}
          {openTabs.length > 1 && (
            <button
              onClick={() =>
                setViewMode((v) => (v === "tabs" ? "grid" : "tabs"))
              }
              className="shrink-0 text-zinc-400 hover:text-white px-2 py-1.5 rounded hover:bg-zinc-800/60 transition-colors"
              title={viewMode === "tabs" ? "Grid view" : "Tab view"}
            >
              {viewMode === "tabs" ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          )}

          {viewMode === "tabs" && activeTab && (
            <button
              onClick={() => handleDelete(activeTab)}
              className="shrink-0 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 mr-1 rounded border border-zinc-700 hover:border-red-800 transition-colors"
            >
              Stop
            </button>
          )}
        </div>

        {/* Tab mode: single active terminal */}
        {viewMode === "tabs" && (
          <div className="flex-1 relative">
            {openTabs.map((id) => (
              <div
                key={id}
                className="absolute inset-0 p-3"
                style={{ display: activeTab === id ? "block" : "none" }}
              >
                <Terminal sessionId={id} visible={activeTab === id} />
              </div>
            ))}
          </div>
        )}

        {/* Grid mode: all terminals visible */}
        {viewMode === "grid" && (
          <div
            className="flex-1 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 p-2 overflow-hidden"
            style={{ gridAutoRows: "minmax(0, 1fr)" }}
          >
            {openTabs.map((id) => {
              const session = sessions.find((s) => s.id === id);
              const isIdle = idleSessions.has(id);
              return (
                <div
                  key={id}
                  className="flex flex-col min-h-0 border border-zinc-800 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {isIdle && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                      )}
                      <button
                        onClick={() => {
                          setViewMode("tabs");
                          navigate(`/sessions/${id}`);
                        }}
                        className="text-xs text-zinc-300 hover:text-white truncate"
                        title="Focus in tab view"
                      >
                        {session
                          ? `${session.repo_name}/${session.branch}`
                          : id}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => handleDelete(id)}
                        className="text-zinc-600 hover:text-red-400 text-xs px-1 transition-colors"
                        title="Stop session"
                      >
                        Stop
                      </button>
                      <button
                        onClick={() => closeTab(id)}
                        className="text-zinc-600 hover:text-zinc-300 text-sm px-1"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Terminal sessionId={id} visible />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Session list view
  return (
    <div className="w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Sessions</h2>
          <p className="text-sm sm:text-base text-zinc-400">
            Active and past coding sessions.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
        >
          New Session
        </button>
      </div>

      {runningSessions.length > 0 && (
        <div className="mb-6 sm:mb-8">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Running
          </h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {runningSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                idle={idleSessions.has(s.id)}
                onOpen={() => openTab(s.id)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {stoppedSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Stopped
          </h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {stoppedSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No sessions yet. Add a repo and create a session to start coding.
        </p>
      )}

      <NewSessionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const cliBadgeColors: Record<string, string> = {
  claude: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  codex: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  gemini: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function SessionCard({
  session,
  idle,
  onOpen,
  onDelete,
}: {
  session: SessionInfo;
  idle?: boolean;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  const running = session.status === "running";
  const badgeColor =
    cliBadgeColors[session.cli_type.toLowerCase()] ??
    "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
  return (
    <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900" data-session-id={session.id}>
      <div className="flex items-start gap-3 justify-between mb-2">
        <div>
          <p className="font-medium text-sm break-all">
            {session.repo_owner}/{session.repo_name}
          </p>
          <p className="text-xs text-zinc-500 break-all">
            {session.branch}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badgeColor}`}
          >
            {session.cli_type}
          </span>
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              !running
                ? "bg-zinc-600"
                : idle
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
            }`}
          />
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 mb-2">
        {running ? "Running for " : "Created "}{timeAgo(session.created_at)}
      </p>
      {running && (
        <div
          className="mt-2 cursor-pointer rounded overflow-hidden border border-zinc-800"
          onClick={onOpen}
        >
          <TerminalPreview sessionId={session.id} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {running && onOpen && (
          <button
            onClick={onOpen}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors"
          >
            Open Terminal
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded border border-zinc-700 hover:border-red-800 transition-colors"
        >
          {running ? "Stop" : "Remove"}
        </button>
      </div>
    </div>
  );
}
