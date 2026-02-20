import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number;
  storageKey?: string;
}

export default function SplitPane({
  left,
  right,
  defaultSplit = 50,
  storageKey,
}: SplitPaneProps) {
  const [split, setSplit] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseFloat(saved);
        if (n >= 20 && n <= 80) return n;
      }
    }
    return defaultSplit;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(split));
    }
  }, [split, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="min-h-0 overflow-hidden" style={{ width: `${split}%` }}>
        {left}
      </div>
      <div
        className="w-1 shrink-0 bg-zinc-700 hover:bg-blue-500 cursor-col-resize transition-colors"
        onMouseDown={onMouseDown}
      />
      <div
        className="min-h-0 overflow-hidden"
        style={{ width: `${100 - split}%` }}
      >
        {right}
      </div>
    </div>
  );
}
