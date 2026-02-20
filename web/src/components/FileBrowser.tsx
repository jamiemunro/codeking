import { useState, useEffect, useCallback } from "react";
import { api, type FileNode } from "../lib/api";

interface FileBrowserProps {
  sessionId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string, isDir: boolean): string {
  if (isDir) return "\u{1F4C1}";
  const ext = name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return "\u{1F7E6}";
  if (["go", "rs", "py", "rb", "java"].includes(ext || "")) return "\u{1F7E2}";
  if (["md", "txt", "json", "yaml", "yml", "toml"].includes(ext || ""))
    return "\u{1F4C4}";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || ""))
    return "\u{1F5BC}";
  if (["css", "scss", "html"].includes(ext || "")) return "\u{1F3A8}";
  return "\u{1F4C4}";
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string, isDir: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        onClick={() => {
          if (node.is_dir) {
            setExpanded((v) => !v);
          }
          onSelect(node.path, node.is_dir);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-0.5 text-left text-xs hover:bg-zinc-800/50 transition-colors ${
          isSelected ? "bg-zinc-800 text-white" : "text-zinc-400"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.is_dir && (
          <span
            className="text-[10px] text-zinc-600 w-3 inline-block"
          >
            {expanded ? "\u25BE" : "\u25B8"}
          </span>
        )}
        {!node.is_dir && <span className="w-3 inline-block" />}
        <span className="text-[10px]">{fileIcon(node.name, node.is_dir)}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {node.is_dir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileBrowser({ sessionId }: FileBrowserProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    binary?: boolean;
    truncated?: boolean;
    size: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(() => {
    setLoading(true);
    api
      .getFileTree(sessionId)
      .then(setTree)
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const handleSelect = useCallback(
    (path: string, isDir: boolean) => {
      setSelectedPath(path);
      if (isDir) {
        setFileContent(null);
        setFileInfo(null);
        return;
      }
      setFileContent(null);
      setFileInfo(null);
      api.getFileContent(sessionId, path).then((data) => {
        setFileInfo({
          binary: data.binary,
          truncated: data.truncated,
          size: data.size,
        });
        setFileContent(data.content);
      });
    },
    [sessionId],
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-medium text-zinc-400">Files</span>
        <button
          onClick={loadTree}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Refresh file tree"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-zinc-600">Loading...</span>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Tree */}
          <div className="w-2/5 min-w-[140px] border-r border-zinc-800 overflow-y-auto py-1">
            {tree.length === 0 ? (
              <p className="text-xs text-zinc-600 px-3 py-2">Empty worktree</p>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto">
            {!selectedPath && (
              <p className="text-xs text-zinc-600 p-3">
                Select a file to preview
              </p>
            )}
            {selectedPath && fileInfo?.binary && (
              <div className="p-3 text-xs text-zinc-500">
                Binary file ({formatSize(fileInfo.size)})
              </div>
            )}
            {selectedPath && fileInfo?.truncated && (
              <div className="p-3 text-xs text-zinc-500">
                File too large to preview ({formatSize(fileInfo.size)})
              </div>
            )}
            {selectedPath &&
              fileContent !== null &&
              !fileInfo?.binary &&
              !fileInfo?.truncated && (
                <pre className="p-3 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {fileContent}
                </pre>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
