import { useState, useCallback, useRef, type ReactNode } from "react";
import { api } from "../lib/api";

interface UploadResult {
  filename: string;
  path: string;
  size: number;
}

interface FileUploadProps {
  sessionId: string;
  children: ReactNode;
  onUploaded?: (result: UploadResult) => void;
  onError?: (error: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({
  sessionId,
  children,
  onUploaded,
  onError,
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recentUploads, setRecentUploads] = useState<UploadResult[]>([]);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      const results: UploadResult[] = [];
      for (const file of Array.from(files)) {
        try {
          const result = await api.uploadFile(sessionId, file);
          results.push(result);
          onUploaded?.(result);
        } catch (e: any) {
          onError?.(e.message || "Upload failed");
        }
      }
      setRecentUploads((prev) => [...results, ...prev].slice(0, 5));
      setUploading(false);
    },
    [sessionId, onUploaded, onError],
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        upload(e.dataTransfer.files);
      }
    },
    [upload],
  );

  const dismissUpload = useCallback((index: number) => {
    setRecentUploads((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div
      className="relative h-full"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            upload(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-40 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <svg
              className="w-12 h-12 text-blue-400 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-blue-300 text-sm font-medium">
              Drop files to upload to worktree
            </p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="absolute top-2 right-2 z-50 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Uploading...
        </div>
      )}

      {/* Recent uploads */}
      {recentUploads.length > 0 && !uploading && (
        <div className="absolute bottom-3 right-3 z-50 flex flex-col gap-1.5 max-w-xs">
          {recentUploads.map((u, i) => (
            <div
              key={`${u.path}-${i}`}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs flex items-start gap-2 animate-in slide-in-from-right"
            >
              <svg
                className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              <div className="min-w-0">
                <p className="text-zinc-300 font-mono truncate">{u.path}</p>
                <p className="text-zinc-500">{formatSize(u.size)}</p>
              </div>
              <button
                onClick={() => dismissUpload(i)}
                className="text-zinc-600 hover:text-zinc-400 ml-1 shrink-0"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Export the trigger function hook for use in header buttons
export function useFileUploadTrigger() {
  const inputRef = useRef<HTMLInputElement>(null);

  const trigger = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return { inputRef, trigger };
}
