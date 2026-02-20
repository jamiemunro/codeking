import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SESSION_ID = process.env.CODEKING_SESSION_ID;
const API_URL = process.env.CODEKING_API_URL || "http://localhost:8800";

if (!SESSION_ID) {
  console.error("CODEKING_SESSION_ID is required");
  process.exit(1);
}

const uiUrl = `${API_URL}/api/sessions/${SESSION_ID}/ui`;

async function getUI() {
  const res = await fetch(uiUrl);
  if (!res.ok) throw new Error(`GET ui failed: ${res.status}`);
  return res.json();
}

async function putUI(content) {
  const res = await fetch(uiUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`PUT ui failed: ${res.status}`);
  return res.json();
}

const ELEMENT_SCHEMA_DESC = `UI element — one of:
  heading: {type: "heading", level: 1|2|3, text: "..."}
  text: {type: "text", content: "..."} (supports **bold**, *italic*, [links](url))
  code: {type: "code", language: "js"|"py"|etc, content: "..."}
  table: {type: "table", headers: ["col1", "col2"], rows: [["a", "b"], ["c", "d"]]}
  list: {type: "list", ordered: true|false, items: ["item1", "item2"]}
  progress: {type: "progress", label: "Building...", value: 75}
  image: {type: "image", url: "https://...", alt: "description"}
  divider: {type: "divider"}
  section: {type: "section", id: "my-section", children: [...elements]}`;

const server = new McpServer({
  name: "codeking-a2ui",
  version: "1.0.0",
});

server.tool(
  "render_ui",
  "Replace the entire UI panel content with a new layout",
  {
    title: z.string().describe("Title for the UI panel"),
    elements: z
      .array(z.record(z.unknown()))
      .describe(`Array of UI elements. ${ELEMENT_SCHEMA_DESC}`),
  },
  async ({ title, elements }) => {
    const ui = { title, elements };
    const data = await putUI(JSON.stringify(ui));
    return {
      content: [{ type: "text", text: `UI rendered: "${title}" with ${elements.length} element(s)` }],
    };
  }
);

server.tool(
  "update_section",
  "Update a specific section by ID within the current UI, replacing its children",
  {
    section_id: z.string().describe("The id of the section element to update"),
    elements: z
      .array(z.record(z.unknown()))
      .describe(`Replacement elements for the section. ${ELEMENT_SCHEMA_DESC}`),
  },
  async ({ section_id, elements }) => {
    const data = await getUI();
    let ui;
    try {
      ui = data.content && data.content !== "{}" ? JSON.parse(data.content) : { elements: [] };
    } catch {
      ui = { elements: [] };
    }

    let found = false;
    function updateSection(els) {
      if (!Array.isArray(els)) return els;
      return els.map((el) => {
        if (el.type === "section" && el.id === section_id) {
          found = true;
          return { ...el, children: elements };
        }
        if (el.children) {
          return { ...el, children: updateSection(el.children) };
        }
        return el;
      });
    }

    ui.elements = updateSection(ui.elements || []);

    if (!found) {
      return {
        content: [{ type: "text", text: `Section "${section_id}" not found in current UI` }],
      };
    }

    await putUI(JSON.stringify(ui));
    return {
      content: [{ type: "text", text: `Section "${section_id}" updated with ${elements.length} element(s)` }],
    };
  }
);

server.tool(
  "clear_ui",
  "Clear the UI panel, removing all content",
  {},
  async () => {
    await putUI("{}");
    return {
      content: [{ type: "text", text: "UI panel cleared" }],
    };
  }
);

server.tool(
  "append_element",
  "Add a single UI element to the end of the current UI",
  {
    element: z
      .record(z.unknown())
      .describe(`A single UI element to append. ${ELEMENT_SCHEMA_DESC}`),
  },
  async ({ element }) => {
    const data = await getUI();
    let ui;
    try {
      ui = data.content && data.content !== "{}" ? JSON.parse(data.content) : { elements: [] };
    } catch {
      ui = { elements: [] };
    }

    if (!Array.isArray(ui.elements)) {
      ui.elements = [];
    }
    ui.elements.push(element);

    await putUI(JSON.stringify(ui));
    return {
      content: [{ type: "text", text: `Element appended (${ui.elements.length} total)` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
