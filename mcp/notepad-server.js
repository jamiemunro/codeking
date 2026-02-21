import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SESSION_ID = process.env.FORGE_SESSION_ID;
const API_URL = process.env.FORGE_API_URL || "http://localhost:8800";

if (!SESSION_ID) {
  console.error("FORGE_SESSION_ID is required");
  process.exit(1);
}

const notesUrl = `${API_URL}/api/sessions/${SESSION_ID}/notes`;

async function getNotes() {
  const res = await fetch(notesUrl);
  if (!res.ok) throw new Error(`GET notes failed: ${res.status}`);
  return res.json();
}

async function putNotes(content) {
  const res = await fetch(notesUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`PUT notes failed: ${res.status}`);
  return res.json();
}

const server = new McpServer({
  name: "forge-notepad",
  version: "1.0.0",
});

server.tool("read_notepad", "Read the session notepad contents", {}, async () => {
  const data = await getNotes();
  return {
    content: [{ type: "text", text: data.content || "(empty)" }],
  };
});

server.tool(
  "write_notepad",
  "Replace the entire session notepad with new content",
  { content: z.string().describe("The new notepad content") },
  async ({ content }) => {
    const data = await putNotes(content);
    return {
      content: [{ type: "text", text: `Notepad updated (${data.content.length} chars)` }],
    };
  }
);

server.tool(
  "append_notepad",
  "Append text to the end of the session notepad",
  { text: z.string().describe("Text to append to the notepad") },
  async ({ text }) => {
    const current = await getNotes();
    const newContent = current.content ? current.content + "\n" + text : text;
    const data = await putNotes(newContent);
    return {
      content: [{ type: "text", text: `Appended to notepad (${data.content.length} chars total)` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
