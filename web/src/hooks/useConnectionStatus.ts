import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export type ConnectionStatus = "connected" | "offline" | "unknown";

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      try {
        const health = await api.gatewayHealth();
        if (!cancelled) setStatus(health.connected ? "connected" : "offline");
      } catch {
        // No gateway configured — if we can reach the page, we're connected
        if (!cancelled) setStatus("connected");
      }
      if (!cancelled) {
        const delay = statusRef.current === "offline" ? 5_000 : 10_000;
        timeout = setTimeout(poll, delay);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  return status;
}
