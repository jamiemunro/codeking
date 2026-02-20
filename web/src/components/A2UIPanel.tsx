import { useState, useEffect, useRef, useCallback } from "react";

interface A2UIPanelProps {
  sessionId: string;
}

type UIElement =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "text"; content: string }
  | { type: "code"; language?: string; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "progress"; label: string; value: number }
  | { type: "image"; url: string; alt?: string }
  | { type: "divider" }
  | { type: "section"; id?: string; children: UIElement[] };

interface UIContent {
  title?: string;
  elements: UIElement[];
}

interface UIState {
  content: string;
  updated_at: string;
}

const fetchUI = (sessionId: string) =>
  fetch(`/api/sessions/${sessionId}/ui`).then((r) => r.json() as Promise<UIState>);

function parseInlineText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="text-blue-400 hover:underline">$1</a>',
    );
}

function RenderElement({ element }: { element: UIElement }): React.ReactElement {
  switch (element.type) {
    case "heading": {
      const parsed = parseInlineText(element.text);
      if (element.level === 1) {
        return (
          <h1
            className="text-lg font-bold text-zinc-100 mb-3"
            dangerouslySetInnerHTML={{ __html: parsed }}
          />
        );
      }
      if (element.level === 2) {
        return (
          <h2
            className="text-base font-semibold text-zinc-200 mb-3"
            dangerouslySetInnerHTML={{ __html: parsed }}
          />
        );
      }
      return (
        <h3
          className="text-sm font-medium text-zinc-300 mb-3"
          dangerouslySetInnerHTML={{ __html: parsed }}
        />
      );
    }

    case "text":
      return (
        <p
          className="text-sm text-zinc-400 leading-relaxed mb-3"
          dangerouslySetInnerHTML={{ __html: parseInlineText(element.content) }}
        />
      );

    case "code":
      return (
        <div className="mb-3">
          {element.language && (
            <div className="text-[10px] text-zinc-500 mb-1 font-mono">
              {element.language}
            </div>
          )}
          <pre className="bg-zinc-900 rounded-lg p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
            <code>{element.content}</code>
          </pre>
        </div>
      );

    case "table":
      return (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-800">
                {element.headers.map((header, i) => (
                  <th
                    key={i}
                    className="text-left px-3 py-2 text-zinc-400 font-medium"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {element.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={rowIdx % 2 === 0 ? "bg-zinc-900/50" : ""}
                >
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-zinc-300">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "list":
      return element.ordered ? (
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside mb-3">
          {element.items.map((item, i) => (
            <li
              key={i}
              dangerouslySetInnerHTML={{ __html: parseInlineText(item) }}
            />
          ))}
        </ol>
      ) : (
        <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside mb-3">
          {element.items.map((item, i) => (
            <li
              key={i}
              dangerouslySetInnerHTML={{ __html: parseInlineText(item) }}
            />
          ))}
        </ul>
      );

    case "progress": {
      const pct = Math.max(0, Math.min(100, element.value));
      return (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{element.label}</span>
            <span className="text-xs text-zinc-500">{pct}%</span>
          </div>
          <div className="bg-zinc-800 rounded-full h-2">
            <div
              className="bg-blue-500 rounded-full h-2 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    case "image":
      return (
        <div className="mb-3">
          <img
            src={element.url}
            alt={element.alt ?? ""}
            className="max-w-full rounded-lg"
          />
          {element.alt && (
            <p className="text-xs text-zinc-500 mt-1">{element.alt}</p>
          )}
        </div>
      );

    case "divider":
      return <hr className="border-t border-zinc-800 my-3" />;

    case "section":
      return (
        <div data-section-id={element.id} className="mb-3">
          {element.children.map((child, i) => (
            <RenderElement key={i} element={child} />
          ))}
        </div>
      );

    default:
      return <></>;
  }
}

export default function A2UIPanel({ sessionId }: A2UIPanelProps) {
  const [uiContent, setUiContent] = useState<UIContent | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUpdatedAt = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  const loadUI = useCallback(
    async (isInitial = false) => {
      try {
        const data = await fetchUI(sessionId);
        if (
          !isInitial &&
          data.updated_at &&
          data.updated_at === lastUpdatedAt.current
        ) {
          return;
        }
        lastUpdatedAt.current = data.updated_at ?? null;

        if (!data.content) {
          setUiContent(null);
          setParseError(null);
          setRawContent(null);
          return;
        }

        try {
          const parsed = JSON.parse(data.content) as UIContent;
          setUiContent(parsed);
          setParseError(null);
          setRawContent(null);
        } catch {
          setUiContent(null);
          setParseError("Failed to parse UI content as JSON");
          setRawContent(data.content);
        }
      } catch {
        // Ignore poll errors
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    setLoading(true);
    loadUI(true);
  }, [loadUI]);

  useEffect(() => {
    pollTimer.current = setInterval(() => {
      loadUI(false);
    }, 2000);

    return () => clearInterval(pollTimer.current);
  }, [loadUI]);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-medium text-zinc-400">
          {uiContent?.title ?? "Agent UI"}
        </span>
        <button
          onClick={() => loadUI(false)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Refresh UI"
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-zinc-600">Loading...</span>
        </div>
      ) : parseError ? (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-red-400 mb-2">{parseError}</p>
          {rawContent && (
            <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap break-all">
              {rawContent}
            </pre>
          )}
        </div>
      ) : !uiContent || uiContent.elements.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-zinc-600 text-center">
            No UI content yet. Claude can push structured displays here using
            the render_ui tool.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {uiContent.elements.map((element, i) => (
            <RenderElement key={i} element={element} />
          ))}
        </div>
      )}
    </div>
  );
}
