/**
 * Jupyter Notebook MCP Server for Antigravity IDE
 * 
 * BigQuant 的 Jupyter Server root_dir 与 notebook 文件路径不一致，
 * 因此不使用 Jupyter Contents API，改为通过 Kernel 直接操作文件系统。
 *
 * Env vars:
 *   JUPYTER_BASE_URL   – default http://localhost:8765
 *   JUPYTER_TOKEN      – required
 *   JUPYTER_NOTEBOOKS  – notebook root on remote fs, default /home/aiuser/work
 *   JUPYTER_LOCAL_ROOT – local workspace root for auto-sync, optional
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import WebSocket from "ws";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const BASE = process.env.JUPYTER_BASE_URL || "http://localhost:8765";
const TOKEN = process.env.JUPYTER_TOKEN || "";
const NB_ROOT = process.env.JUPYTER_NOTEBOOKS || "/home/aiuser/work";
const LOCAL_ROOT = process.env.JUPYTER_LOCAL_ROOT || "";

// ── kernel execution helper ──────────────────────────────────────────

async function getSessions() {
  const url = `${BASE}/api/sessions?token=${TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sessions API ${res.status}`);
  return res.json();
}

async function getOrCreateSession(notebookPath) {
  const sessions = await getSessions();
  const baseName = notebookPath.split("/").pop().replace(".ipynb", "");
  let session = sessions.find(
    (s) => s.path && s.path.includes(baseName)
  );
  if (session) return session;

  session = await fetch(`${BASE}/api/sessions?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: notebookPath,
      type: "notebook",
      kernel: { name: "python3" },
    }),
  });
  if (!session.ok) throw new Error(`Create session failed: ${session.status}`);
  return session.json();
}

function executeOnKernel(kernelId, code, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${BASE.replace(/^http/, "ws")}/api/kernels/${kernelId}/channels?token=${TOKEN}`;
    const ws = new WebSocket(wsUrl);
    const msgId = randomUUID();
    const sessionId = randomUUID();
    const outputs = [];
    let status = "unknown";

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Kernel execution timed out"));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        header: {
          msg_id: msgId, username: "mcp", session: sessionId,
          msg_type: "execute_request", version: "5.3",
          date: new Date().toISOString(),
        },
        parent_header: {}, metadata: {},
        content: {
          code, silent: false, store_history: true,
          user_expressions: {}, allow_stdin: false, stop_on_error: true,
        },
        channel: "shell",
      }));
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.parent_header?.msg_id !== msgId) return;
      switch (msg.header.msg_type) {
        case "stream":
          outputs.push({ type: "stream", name: msg.content.name, text: msg.content.text });
          break;
        case "display_data":
        case "execute_result":
          outputs.push({ type: msg.header.msg_type, data: msg.content.data });
          break;
        case "error":
          outputs.push({
            type: "error", ename: msg.content.ename,
            evalue: msg.content.evalue, traceback: msg.content.traceback,
          });
          break;
        case "execute_reply":
          status = msg.content.status;
          clearTimeout(timer);
          ws.close();
          resolve({ status, outputs });
          break;
      }
    });

    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

/** Execute code on the kernel tied to a notebook path */
async function runOnNotebook(notebookPath, code, timeoutMs = 30000) {
  const session = await getOrCreateSession(notebookPath);
  return executeOnKernel(session.kernel.id, code, timeoutMs);
}

/** Format kernel outputs into readable text */
function formatOutputs(outputs) {
  return outputs.map((o) => {
    if (o.type === "stream") return o.text;
    if (o.type === "error") return o.traceback.join("\n");
    if (o.data?.["text/plain"]) return o.data["text/plain"];
    return JSON.stringify(o.data);
  }).join("");
}

/** Sync remote notebook file to local workspace */
async function syncToLocal(notebookPath) {
  if (!LOCAL_ROOT) return;
  const localPath = join(LOCAL_ROOT, notebookPath);
  // Read the remote file content via kernel
  const result = await runOnNotebook(notebookPath, `
import pathlib as _p
print(_p.Path(${JSON.stringify(`${NB_ROOT}/${notebookPath}`)}).read_text(encoding='utf-8'), end='')
del _p
`);
  const content = formatOutputs(result.outputs);
  if (content) {
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, content, "utf-8");
  }
}

/** Run a Python snippet on the kernel that reads/writes the .ipynb via nbformat, then auto-sync to local */
async function nbAction(notebookPath, pyCode, timeoutMs = 30000) {
  const fullPath = `${NB_ROOT}/${notebookPath}`;
  const wrappedCode = `
import json as _json, pathlib as _pathlib

_nb_path = _pathlib.Path(${JSON.stringify(fullPath)})
_nb = _json.loads(_nb_path.read_text(encoding='utf-8'))

${pyCode}

_nb_path.write_text(_json.dumps(_nb, ensure_ascii=False, indent=1), encoding='utf-8')
del _nb, _nb_path, _json, _pathlib
`;
  const result = await runOnNotebook(notebookPath, wrappedCode, timeoutMs);
  // Auto-sync to local after every write
  await syncToLocal(notebookPath).catch(() => {});
  return result;
}

// ── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({ name: "jupyter-notebook", version: "1.0.0" });

// 1) List cells
server.tool(
  "notebook_list_cells",
  "List all cells in a Jupyter notebook with index, type, source preview and execution_count",
  { path: z.string().describe("Notebook path relative to work root, e.g. '我的克隆策略/羊驼策略.ipynb'") },
  async ({ path }) => {
    const code = `
_cells_info = []
for _i, _c in enumerate(_nb['cells']):
    _src = ''.join(_c.get('source', []) if isinstance(_c.get('source'), list) else [_c.get('source', '')])
    _cells_info.append({
        'index': _i,
        'type': _c['cell_type'],
        'execution_count': _c.get('execution_count'),
        'source_preview': _src[:200],
        'has_outputs': len(_c.get('outputs', [])) > 0,
    })
print(_json.dumps(_cells_info, ensure_ascii=False, indent=2))
`;
    const result = await nbAction(path, code);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) }] };
  }
);

// 2) Get cell content & outputs
server.tool(
  "notebook_get_cell",
  "Get the full source and outputs of a specific cell by index",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().describe("0-based cell index"),
  },
  async ({ path, cell_index }) => {
    const code = `
_c = _nb['cells'][${cell_index}]
_src = ''.join(_c.get('source', []) if isinstance(_c.get('source'), list) else [_c.get('source', '')])
print(_json.dumps({
    'index': ${cell_index},
    'type': _c['cell_type'],
    'source': _src,
    'execution_count': _c.get('execution_count'),
    'outputs': _c.get('outputs', []),
}, ensure_ascii=False, indent=2))
`;
    const result = await nbAction(path, code);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) }] };
  }
);

// 3) Edit cell
server.tool(
  "notebook_edit_cell",
  "Replace the source code of a specific cell by index, then save the notebook",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().describe("0-based cell index"),
    new_source: z.string().describe("New source code for the cell"),
  },
  async ({ path, cell_index, new_source }) => {
    const escapedSource = JSON.stringify(new_source);
    const code = `
_nb['cells'][${cell_index}]['source'] = ${escapedSource}
_nb['cells'][${cell_index}]['outputs'] = []
_nb['cells'][${cell_index}]['execution_count'] = None
print('Cell ${cell_index} updated and saved.')
`;
    const result = await nbAction(path, code);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) || `Cell ${cell_index} updated and saved.` }] };
  }
);

// 4) Insert cell
server.tool(
  "notebook_insert_cell",
  "Insert a new cell at a given position",
  {
    path: z.string().describe("Notebook path"),
    position: z.number().int().describe("0-based position to insert at"),
    cell_type: z.enum(["code", "markdown"]).default("code"),
    source: z.string().describe("Cell source code or markdown"),
  },
  async ({ path, position, cell_type, source }) => {
    const escapedSource = JSON.stringify(source);
    const code = `
_new_cell = {
    'cell_type': ${JSON.stringify(cell_type)},
    'source': ${escapedSource},
    'metadata': {},
    ${cell_type === "code" ? "'outputs': [], 'execution_count': None," : ""}
}
_nb['cells'].insert(${position}, _new_cell)
print('Inserted ${cell_type} cell at position ${position}.')
`;
    const result = await nbAction(path, code);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) || `Inserted ${cell_type} cell at position ${position}.` }] };
  }
);

// 5) Delete cell
server.tool(
  "notebook_delete_cell",
  "Delete a cell by index",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().describe("0-based cell index"),
  },
  async ({ path, cell_index }) => {
    const code = `
_nb['cells'].pop(${cell_index})
print('Cell ${cell_index} deleted.')
`;
    const result = await nbAction(path, code);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) || `Cell ${cell_index} deleted.` }] };
  }
);

// 6) Run cell — execute the cell source on the kernel and write outputs back
server.tool(
  "notebook_run_cell",
  "Execute a cell on the remote Jupyter kernel, return output, and write outputs back to the .ipynb file",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().describe("0-based cell index to execute"),
    timeout_ms: z.number().int().default(30000).describe("Execution timeout in ms"),
  },
  async ({ path, cell_index, timeout_ms }) => {
    // First, read cell source
    const readCode = `
_c = _nb['cells'][${cell_index}]
_src = ''.join(_c.get('source', []) if isinstance(_c.get('source'), list) else [_c.get('source', '')])
print(_src)
`;
    const readResult = await nbAction(path, readCode);
    const cellSource = formatOutputs(readResult.outputs).trim();

    if (!cellSource) throw new Error(`Cell ${cell_index} is empty`);

    // Execute on kernel
    const execResult = await runOnNotebook(path, cellSource, timeout_ms);

    // Write outputs back to notebook
    const nbOutputs = execResult.outputs.map((o) => {
      if (o.type === "stream") return { output_type: "stream", name: o.name, text: [o.text] };
      if (o.type === "error") return { output_type: "error", ename: o.ename, evalue: o.evalue, traceback: o.traceback };
      return { output_type: o.type === "execute_result" ? "execute_result" : "display_data", data: o.data, metadata: {}, ...(o.type === "execute_result" ? { execution_count: null } : {}) };
    });

    const writeCode = `
_nb['cells'][${cell_index}]['outputs'] = _json.loads(${JSON.stringify(JSON.stringify(nbOutputs))})
_nb['cells'][${cell_index}]['execution_count'] = (_nb['cells'][${cell_index}].get('execution_count') or 0) + 1
print('Outputs written back.')
`;
    await nbAction(path, writeCode);

    const text = formatOutputs(execResult.outputs);
    return {
      content: [{ type: "text", text: `Status: ${execResult.status}\n\n${text || "(no output)"}` }],
    };
  }
);

// 7) Run arbitrary code
server.tool(
  "notebook_run_code",
  "Execute arbitrary code on the Jupyter kernel associated with a notebook, without modifying the notebook file",
  {
    path: z.string().describe("Notebook path (used to find the kernel session)"),
    code: z.string().describe("Python code to execute"),
    timeout_ms: z.number().int().default(30000).describe("Execution timeout in ms"),
  },
  async ({ path, code, timeout_ms }) => {
    const result = await runOnNotebook(path, code, timeout_ms);
    const text = formatOutputs(result.outputs);
    return { content: [{ type: "text", text: `Status: ${result.status}\n\n${text || "(no output)"}` }] };
  }
);

// ── start ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
