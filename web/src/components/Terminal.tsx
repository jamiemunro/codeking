import { useEffect, useRef, useCallback } from "react";
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

export default function Terminal({ sessionId, visible = true }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(RECONNECT_DELAY);
  const disposed = useRef(false);

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
        ws.send(
          JSON.stringify({
            type: "resize",
            data: { rows: term.rows, cols: term.cols },
          }),
        );
      };

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data));
        }
      };

      ws.onclose = (e) => {
        if (disposed.current) return;
        if (e.code === 1000) {
          term.write("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
          return;
        }
        // Reconnect
        term.write("\r\n\x1b[33m[Reconnecting...]\x1b[0m\r\n");
        reconnectTimer.current = setTimeout(() => {
          // Clear terminal before replay to avoid duplication
          term.clear();
          connect(term);
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            MAX_RECONNECT_DELAY,
          );
        }, reconnectDelay.current);
      };

      ws.onerror = () => {};

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });
    },
    [sessionId],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    disposed.current = false;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#09090b",
        foreground: "#fafafa",
        cursor: "#fafafa",
        selectionBackground: "#3f3f46",
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
      ref={containerRef}
      className="h-full w-full"
      style={{ display: visible ? "block" : "none" }}
    />
  );
}
