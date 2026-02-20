import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";

interface NotePadProps {
  sessionId: string;
}

function renderMarkdown(md: string): string {
  const html = md
    // Code blocks (fenced)
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre class="bg-zinc-950 rounded p-3 my-2 overflow-x-auto text-sm"><code>$2</code></pre>',
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 rounded text-sm">$1</code>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="text-blue-400 hover:underline">$1</a>',
    )
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-zinc-700 my-3" />')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Paragraphs (blank lines)
    .replace(/\n\n/g, '</p><p class="my-2">');

  return `<p class="my-2">${html}</p>`;
}

export default function NotePad({ sessionId }: NotePadProps) {
  const [content, setContent] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const localUpdatedAt = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const contentRef = useRef(content);
  const pendingSave = useRef(false);

  contentRef.current = content;

  // Fetch notes on mount
  useEffect(() => {
    api.getSessionNotes(sessionId).then((data) => {
      setContent(data.content);
      localUpdatedAt.current = data.updated_at;
    });
  }, [sessionId]);

  // Auto-save with debounce
  const saveNotes = useCallback(
    async (text: string) => {
      setSaving(true);
      pendingSave.current = false;
      try {
        const data = await api.updateSessionNotes(sessionId, text);
        localUpdatedAt.current = data.updated_at;
        setLastSaved(new Date());
      } finally {
        setSaving(false);
      }
    },
    [sessionId],
  );

  const debouncedSave = useCallback(
    (text: string) => {
      pendingSave.current = true;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveNotes(text), 1500);
    },
    [saveNotes],
  );

  // Poll for remote changes (handles Claude writing via MCP)
  useEffect(() => {
    pollTimer.current = setInterval(async () => {
      if (pendingSave.current || saving) return;
      try {
        const data = await api.getSessionNotes(sessionId);
        if (
          data.updated_at &&
          data.updated_at !== localUpdatedAt.current
        ) {
          setContent(data.content);
          localUpdatedAt.current = data.updated_at;
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000);

    return () => clearInterval(pollTimer.current);
  }, [sessionId, saving]);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimer.current);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    debouncedSave(val);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Notepad</span>
          <div className="flex rounded-md overflow-hidden border border-zinc-700">
            <button
              onClick={() => setViewMode("edit")}
              className={`text-[11px] px-2 py-0.5 transition-colors ${
                viewMode === "edit"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={`text-[11px] px-2 py-0.5 transition-colors ${
                viewMode === "preview"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              Preview
            </button>
          </div>
        </div>
        <span className="text-[10px] text-zinc-600">
          {saving
            ? "Saving..."
            : lastSaved
              ? `Saved ${lastSaved.toLocaleTimeString()}`
              : ""}
        </span>
      </div>

      {/* Content */}
      {viewMode === "edit" ? (
        <textarea
          value={content}
          onChange={handleChange}
          className="flex-1 w-full bg-transparent text-zinc-300 text-sm p-3 resize-none outline-none font-mono leading-relaxed placeholder:text-zinc-700"
          placeholder="Write notes here... (Markdown supported)"
          spellCheck={false}
        />
      ) : (
        <div
          className="flex-1 overflow-auto p-3 text-sm text-zinc-300 leading-relaxed prose-invert"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      )}
    </div>
  );
}
