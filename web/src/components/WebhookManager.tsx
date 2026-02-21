import { useState, useEffect, useCallback } from "react";
import { api, type Webhook } from "../lib/api";

const ALL_EVENTS = [
  "session.created",
  "session.stopped",
  "session.error",
  "session.idle",
];

function generateSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface WebhookFormProps {
  initial?: Partial<Webhook>;
  isNew: boolean;
  onSave: (data: Partial<Webhook>) => Promise<void>;
  onCancel: () => void;
}

function WebhookForm({ initial, isNew, onSave, onCancel }: WebhookFormProps) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ url: url.trim(), secret, events, active });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          URL
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Secret
        </label>
        <div className="flex gap-1">
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Optional signing secret"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => setSecret(generateSecret())}
            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
          >
            Generate
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          Events
        </label>
        <div className="space-y-1">
          {ALL_EVENTS.map((event) => (
            <label
              key={event}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={() => toggleEvent(event)}
                className="accent-blue-500"
              />
              <span className="text-xs text-zinc-300 font-mono">{event}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="accent-blue-500"
          />
          <span className="text-xs text-zinc-300">Active</span>
        </label>
      </div>

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!url.trim() || saving}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {saving ? "Saving..." : isNew ? "Add" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface TestResult {
  webhookId: number;
  success: boolean;
  message: string;
}

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>(
    {},
  );
  const [testing, setTesting] = useState<Record<number, boolean>>({});

  const loadWebhooks = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getWebhooks()
      .then((data) => setWebhooks(data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreate = useCallback(async (data: Partial<Webhook>) => {
    const created = await api.createWebhook(data);
    setWebhooks((prev) => [...prev, created]);
    setShowAddForm(false);
  }, []);

  const handleUpdate = useCallback(
    async (id: number, data: Partial<Webhook>) => {
      const updated = await api.updateWebhook(id, data);
      setWebhooks((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setEditingId(null);
    },
    [],
  );

  const handleDelete = useCallback(async (id: number) => {
    try {
      await api.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, []);

  const handleTest = useCallback(async (id: number) => {
    setTesting((prev) => ({ ...prev, [id]: true }));
    try {
      await api.testWebhook(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          webhookId: id,
          success: true,
          message: "Test sent successfully",
        },
      }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          webhookId: id,
          success: false,
          message: err instanceof Error ? err.message : "Test failed",
        },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 4000);
    }
  }, []);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-medium text-zinc-400">Webhooks</span>
        <button
          onClick={loadWebhooks}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-zinc-600">Loading...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-red-400">{error}</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {webhooks.length === 0 && !showAddForm && (
            <p className="text-xs text-zinc-600 py-2">
              No webhooks configured. Add one to receive event notifications.
            </p>
          )}

          {/* Webhook list */}
          {webhooks.map((webhook) =>
            editingId === webhook.id ? (
              <WebhookForm
                key={webhook.id}
                initial={webhook}
                isNew={false}
                onSave={(data) => handleUpdate(webhook.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={webhook.id}
                className="border border-zinc-800 rounded-lg p-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-zinc-200 font-mono truncate">
                      {webhook.url}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                        webhook.active
                          ? "bg-emerald-900/50 text-emerald-400"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {webhook.active ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => handleTest(webhook.id)}
                      disabled={testing[webhook.id]}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 transition-colors disabled:opacity-40"
                    >
                      {testing[webhook.id] ? "Testing..." : "Test"}
                    </button>
                    <button
                      onClick={() => setEditingId(webhook.id)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="text-[10px] text-red-500/60 hover:text-red-400 px-1.5 py-0.5 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {webhook.events.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {webhook.events.map((event) => (
                      <span
                        key={event}
                        className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded font-mono"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                )}

                {testResults[webhook.id] && (
                  <div
                    className={`mt-1.5 text-[10px] px-2 py-1 rounded ${
                      testResults[webhook.id].success
                        ? "bg-emerald-900/30 text-emerald-400"
                        : "bg-red-900/30 text-red-400"
                    }`}
                  >
                    {testResults[webhook.id].message}
                  </div>
                )}
              </div>
            ),
          )}

          {/* Add form */}
          {showAddForm && (
            <WebhookForm
              isNew
              onSave={handleCreate}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {/* Add button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full border border-dashed border-zinc-700 hover:border-zinc-500 rounded-lg py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + Add Webhook
            </button>
          )}
        </div>
      )}
    </div>
  );
}
