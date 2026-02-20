import { useEffect, useRef, useCallback, useState } from "react";
import type { IDisposable } from "@xterm/xterm";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  visible?: boolean;
}

const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;

// ANSI escape sequences for special keys
const KEY_SEQUENCES: Record<string, string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  enter: "\r",
  tab: "\t",
  "shift-tab": "\x1b[Z",
  escape: "\x1b",
  "ctrl-c": "\x03",
  backspace: "\x7f",
};

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isTouch;
}

interface VirtualKeybarProps {
  onKey: (seq: string) => void;
}

function VirtualKeybar({ onKey }: VirtualKeybarProps) {
  const [showExtra, setShowExtra] = useState(false);

  const btn = (label: string, key: string, className?: string) => (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onKey(KEY_SEQUENCES[key]);
      }}
      className={`flex items-center justify-center rounded-md bg-zinc-800 border border-zinc-700
        active:bg-zinc-600 text-sm font-medium select-none touch-manipulation ${className || "h-10 min-w-[2.75rem] px-2"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-shrink-0 bg-zinc-900 border-t border-zinc-800 px-2 py-1.5 safe-area-pb">
      <div className="overflow-x-auto pb-0.5">
        <div className="flex items-center gap-1.5 min-w-max">
          {/* Arrow keys */}
          {btn("←", "left")}
          {btn("↓", "down")}
          {btn("↑", "up")}
          {btn("→", "right")}

          <div className="w-px h-6 bg-zinc-700 mx-0.5" />

          {/* Common keys */}
          {btn("Enter", "enter", "h-10 px-3")}
          {btn("Tab", "tab", "h-10 px-3")}
          {btn("⇧Tab", "shift-tab", "h-10 px-3")}

          <div className="flex-1" />

          {/* Toggle extra keys */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              setShowExtra((current) => !current);
            }}
            className={`flex items-center justify-center rounded-md border text-sm font-medium
              select-none touch-manipulation h-10 px-2 ${
                showExtra
                  ? "bg-zinc-600 border-zinc-500"
                  : "bg-zinc-800 border-zinc-700 active:bg-zinc-600"
              }`}
          >
            ···
          </button>
        </div>
      </div>

      {showExtra && (
        <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto">
          {btn("Esc", "escape")}
          {btn("^C", "ctrl-c")}
          {btn("⌫", "backspace")}
        </div>
      )}
    </div>
  );
}

export default function Terminal({ sessionId, visible = true }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectDelay = useRef(RECONNECT_DELAY);
  const disposed = useRef(false);
  const onDataDisposable = useRef<IDisposable | null>(null);
  const isTouch = useIsTouchDevice();
  const [connState, setConnState] = useState<
    "connecting" | "connected" | "reconnecting" | "ended"
  >("connecting");
  const [attempts, setAttempts] = useState(0);

  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data));
    }
  }, []);

  const connect = useCallback(
    (term: XTerm) => {
      if (disposed.current) return;

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${location.host}/ws/session/${sessionId}`,
      );
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay.current = RECONNECT_DELAY;
        setConnState("connected");
        setAttempts(0);
        ws.send(
          JSON.stringify({
            type: "resize",
            data: { rows: term.rows, cols: term.cols },
          }),
        );
      };

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          try {
            term.write(new Uint8Array(e.data));
          } catch (err) {
            console.error("terminal write error:", err);
          }
        }
      };

      ws.onclose = (e) => {
        if (disposed.current) return;
        if (e.code === 1000) {
          setConnState("ended");
          return;
        }
        setConnState("reconnecting");
        setAttempts((prev) => prev + 1);
        reconnectTimer.current = setTimeout(() => {
          try {
            term.clear();
          } catch (err) {
            console.error("terminal clear error:", err);
          }
          connect(term);
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            MAX_RECONNECT_DELAY,
          );
        }, reconnectDelay.current);
      };

      ws.onerror = (ev) => {
        console.error("ws error for session", sessionId, ev);
      };

      // Dispose previous onData listener to prevent accumulation on reconnect
      onDataDisposable.current?.dispose();
      onDataDisposable.current = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });
    },
    [sessionId],
  );

  const manualReconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    reconnectDelay.current = RECONNECT_DELAY;
    setAttempts(0);
    setConnState("connecting");
    const term = termRef.current;
    if (term) {
      try {
        term.clear();
      } catch {
        /* ignore */
      }
      connect(term);
    }
  }, [connect]);

  useEffect(() => {
    if (!containerRef.current) return;
    disposed.current = false;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 10,
      lineHeight: 1.5,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#0a0a0f",
        foreground: "#e4e4e7",
        cursor: "#60a5fa",
        cursorAccent: "#0a0a0f",
        selectionBackground: "#3f3f46",
        selectionForeground: "#fafafa",
        black: "#27272a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#fafafa",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // Resize handling
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    // xterm.js v6 uses a custom scrollbar that doesn't handle wheel events,
    // so we bridge wheel events to the terminal's scroll API.
    const container = containerRef.current;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const lineHeight = Math.ceil(term.options.fontSize! * 1.2);
      let lines: number;
      if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        lines =
          Math.sign(e.deltaY) *
          Math.max(1, Math.round(Math.abs(e.deltaY) / lineHeight));
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        lines = Math.round(e.deltaY);
      } else {
        lines = Math.sign(e.deltaY) * term.rows;
      }
      term.scrollLines(lines);
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    term.onResize(({ rows, cols }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", data: { rows, cols } }));
      }
    });

    connect(term);

    return () => {
      disposed.current = true;
      clearTimeout(reconnectTimer.current);
      container.removeEventListener("wheel", onWheel);
      onDataDisposable.current?.dispose();
      observer.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  }, [sessionId, connect]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (visible && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [visible]);

  return (
    <div
      className="h-full flex flex-col relative"
      style={{ display: visible ? "flex" : "none" }}
    >
      <div ref={containerRef} className="flex-1 min-h-0 p-2" />
      {connState !== "connected" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="text-center">
            {connState === "connecting" && (
              <div className="text-zinc-400 text-sm">Connecting...</div>
            )}
            {connState === "reconnecting" && (
              <>
                <div className="text-amber-400 text-sm mb-1">
                  Reconnecting
                  {attempts > 1 ? ` (attempt ${attempts})` : ""}...
                </div>
                {attempts >= 3 && (
                  <p className="text-zinc-500 text-xs mb-3">
                    Server may be restarting
                  </p>
                )}
                <button
                  onClick={manualReconnect}
                  className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-zinc-700 hover:border-blue-700 transition-colors"
                >
                  Retry now
                </button>
              </>
            )}
            {connState === "ended" && (
              <>
                <div className="text-zinc-400 text-sm mb-3">
                  Session ended
                </div>
                <button
                  onClick={manualReconnect}
                  className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-zinc-700 hover:border-blue-700 transition-colors"
                >
                  Reconnect
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {isTouch && <VirtualKeybar onKey={sendInput} />}
    </div>
  );
}
