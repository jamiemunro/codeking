import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";

const API_URL = process.env.CODEKING_API_URL || "http://localhost:8800";

const server = new McpServer({
  name: "codeking-orchestrator",
  version: "1.0.0",
});

server.tool(
  "list_sessions",
  "List all coding sessions with their status and a snippet of recent output",
  {},
  async () => {
    try {
      const res = await fetch(`${API_URL}/api/orchestrator/sessions`);
      if (!res.ok) throw new Error(`GET sessions failed: ${res.status}`);
      const data = await res.json();
      const sessions = Array.isArray(data) ? data : data.sessions ?? [];
      if (sessions.length === 0) {
        return { content: [{ type: "text", text: "No sessions found." }] };
      }
      const lines = sessions.map((s) => {
        const snippet = s.snippet ? `\n  Output: ${s.snippet}` : "";
        return `- id: ${s.id}\n  repo: ${s.repo_owner ?? ""}/${s.repo_name ?? "(unknown)"}\n  branch: ${s.branch ?? "(unknown)"}\n  status: ${s.status ?? "(unknown)"}${snippet}`;
      });
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error listing sessions: ${err.message}` }] };
    }
  }
);

server.tool(
  "get_session_output",
  "Get the last N lines of output from a session's terminal",
  {
    session_id: z.string().describe("The session ID"),
    lines: z.number().optional().default(50).describe("Number of lines to return (default: 50)"),
  },
  async ({ session_id, lines }) => {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${session_id}/tail?lines=${lines}`);
      if (!res.ok) throw new Error(`GET tail failed: ${res.status}`);
      const data = await res.json();
      const output = Array.isArray(data) ? data.join("\n") : data.lines?.join("\n") ?? String(data);
      return { content: [{ type: "text", text: output || "(no output)" }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error getting session output: ${err.message}` }] };
    }
  }
);

server.tool(
  "send_to_session",
  "Send text input to a session's terminal (like typing into it)",
  {
    session_id: z.string().describe("The session ID"),
    text: z.string().describe("Text to send. Include \\n for Enter key."),
  },
  async ({ session_id, text }) => {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${session_id}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: text }),
      });
      if (!res.ok) throw new Error(`POST input failed: ${res.status}`);
      return { content: [{ type: "text", text: `Input sent to session ${session_id}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error sending input to session: ${err.message}` }] };
    }
  }
);

server.tool(
  "stop_session",
  "Stop a coding session",
  {
    session_id: z.string().describe("The session ID"),
  },
  async ({ session_id }) => {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${session_id}?delete_local=false`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE session failed: ${res.status}`);
      return { content: [{ type: "text", text: `Session ${session_id} stopped.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error stopping session: ${err.message}` }] };
    }
  }
);

server.tool(
  "list_workflows",
  "List all saved workflows",
  {},
  async () => {
    try {
      const res = await fetch(`${API_URL}/api/workflows`);
      if (!res.ok) throw new Error(`GET workflows failed: ${res.status}`);
      const data = await res.json();
      const workflows = Array.isArray(data) ? data : data.workflows ?? [];
      if (workflows.length === 0) {
        return { content: [{ type: "text", text: "No workflows found." }] };
      }
      const lines = workflows.map((w) => `- id: ${w.id}\n  name: ${w.name ?? "(unnamed)"}\n  description: ${w.description ?? "(no description)"}`);
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error listing workflows: ${err.message}` }] };
    }
  }
);

server.tool(
  "run_workflow",
  "Run a saved workflow by ID",
  {
    workflow_id: z.number().describe("The workflow ID"),
  },
  async ({ workflow_id }) => {
    try {
      const res = await fetch(`${API_URL}/api/workflows/${workflow_id}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`POST run workflow failed: ${res.status}`);
      return { content: [{ type: "text", text: `Workflow ${workflow_id} started.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error running workflow: ${err.message}` }] };
    }
  }
);

server.tool(
  "run_shell",
  "Run a shell command on the server",
  {
    command: z.string().describe("The shell command to run"),
  },
  async ({ command }) => {
    try {
      const stdout = execSync(command, { timeout: 60000, encoding: "utf-8" });
      return { content: [{ type: "text", text: stdout || "(no output)" }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error running command: ${err.message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
