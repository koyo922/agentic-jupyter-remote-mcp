#!/usr/bin/env node
/**
 * Jupyter Notebook MCP Server for Antigravity IDE
 * 
 * Remote Jupyter Server root_dir 与 notebook 文件路径如果不一致，
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
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import {
  normalizeNotebookPath,
  remoteNotebookPath,
  resolveLocalMirrorPath,
  sanitizeBaseUrl,
  selectExactSession,
} from "./lib/core.js";

const PRODUCT_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version;

// Parse --port from command line if provided
let port = 8765;
const portIndex = process.argv.indexOf('--port');
if (portIndex > -1 && process.argv.length > portIndex + 1) {
    port = parseInt(process.argv[portIndex + 1], 10) || 8765;
}

const BASE = process.env.JUPYTER_BASE_URL || `http://localhost:${port}`;
const TOKEN = process.env.JUPYTER_TOKEN || "";
const NB_ROOT = process.env.JUPYTER_NOTEBOOKS || "/home/aiuser/work";
const LOCAL_ROOT = process.env.JUPYTER_LOCAL_ROOT || "";

// ── kernel execution helper ──────────────────────────────────────────

async function getSessions() {
  const url = new URL("api/sessions", `${BASE.replace(/\/$/, "")}/`);
  if (TOKEN) url.searchParams.set("token", TOKEN);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sessions API ${res.status}`);
  return res.json();
}

async function getOrCreateSession(notebookPath) {
  notebookPath = normalizeNotebookPath(notebookPath);
  const sessions = await getSessions();
  let session = selectExactSession(sessions, notebookPath);
  if (session) return session;

  const url = new URL("api/sessions", `${BASE.replace(/\/$/, "")}/`);
  if (TOKEN) url.searchParams.set("token", TOKEN);
  session = await fetch(url, {
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
    const wsUrl = new URL(`api/kernels/${encodeURIComponent(kernelId)}/channels`, `${BASE.replace(/^http/, "ws").replace(/\/$/, "")}/`);
    if (TOKEN) wsUrl.searchParams.set("token", TOKEN);
    const ws = new WebSocket(wsUrl);
    const msgId = randomUUID();
    const sessionId = randomUUID();
    const outputs = [];
    let status = "unknown";
    let executionCount = null;
    let receivedShellReply = false;
    let receivedIdle = false;
    let settled = false;

    const finish = () => {
      if (!settled && receivedShellReply && receivedIdle) {
        settled = true;
        clearTimeout(timer);
        ws.close();
        resolve({ status, outputs, executionCount });
      }
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(new Error(`Kernel execution timed out after ${timeoutMs} ms`));
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
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (error) {
        fail(new Error(`Invalid Jupyter WebSocket message: ${error.message}`));
        return;
      }
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
          executionCount = msg.content.execution_count ?? executionCount;
          receivedShellReply = true;
          finish();
          break;
        case "status":
          if (msg.content.execution_state === "idle") {
            receivedIdle = true;
            finish();
          }
          break;
      }
    });

    ws.on("error", fail);
    ws.on("close", () => {
      if (!settled) fail(new Error("Kernel WebSocket closed before execution completed"));
    });
  });
}

/** Execute code on the kernel tied to a notebook path */
async function runOnNotebook(notebookPath, code, timeoutMs = 30000) {
  notebookPath = normalizeNotebookPath(notebookPath);
  const session = await getOrCreateSession(notebookPath);
  return executeOnKernel(session.kernel.id, code, timeoutMs);
}

/** Format kernel outputs into readable text */
function formatOutputs(outputs) {
  return outputs.map((o) => {
    if (o.type === "stream") return o.text;
    if (o.type === "error") return Array.isArray(o.traceback) ? o.traceback.join("\n") : `${o.ename}: ${o.evalue}`;
    if (o.data?.["text/plain"]) return o.data["text/plain"];
    return JSON.stringify(o.data);
  }).join("");
}

/** Sync remote notebook file to local workspace */
async function syncToLocal(notebookPath) {
  if (!LOCAL_ROOT) return;
  notebookPath = normalizeNotebookPath(notebookPath);
  const localPath = resolveLocalMirrorPath(LOCAL_ROOT, notebookPath);
  // Read the remote file content via kernel
  const result = await runOnNotebook(notebookPath, `
import pathlib as _p
print(_p.Path(${JSON.stringify(`${NB_ROOT}/${notebookPath}`)}).read_text(encoding='utf-8'), end='')
del _p
`);
  if (result.status !== "ok") {
    throw new Error(`Remote notebook sync failed: ${formatOutputs(result.outputs)}`);
  }
  const content = formatOutputs(result.outputs);
  if (content) {
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, content, "utf-8");
  }
}

/** Run a Python snippet against a notebook, writing it back only for mutating tools. */
async function nbAction(notebookPath, pyCode, timeoutMs = 30000, writeBack = true) {
  notebookPath = normalizeNotebookPath(notebookPath);
  const fullPath = remoteNotebookPath(NB_ROOT, notebookPath);
  const writeStatement = writeBack
    ? "_nb_path.write_text(_json.dumps(_nb, ensure_ascii=False, indent=1), encoding='utf-8')"
    : "";
  const wrappedCode = `
import json as _json, pathlib as _pathlib

_nb_path = _pathlib.Path(${JSON.stringify(fullPath)})
_nb = _json.loads(_nb_path.read_text(encoding='utf-8'))

${pyCode}

${writeStatement}
del _nb, _nb_path, _json, _pathlib
`;
  const result = await runOnNotebook(notebookPath, wrappedCode, timeoutMs);
  if (result.status !== "ok") {
    throw new Error(`Remote notebook action failed: ${formatOutputs(result.outputs)}`);
  }
  if (writeBack) {
    await syncToLocal(notebookPath);
  }
  return result;
}

// ── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({ name: "agentic-jupyter-remote", version: PRODUCT_VERSION });

server.tool(
  "jupyter_server_status",
  "Check the configured standalone or remote Jupyter Server without reading or modifying a Notebook",
  {},
  async () => {
    try {
      const sessions = await getSessions();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            product: "agentic-jupyter-remote-mcp",
            version: PRODUCT_VERSION,
            status: "ready",
            base_url: sanitizeBaseUrl(BASE),
            notebook_root: NB_ROOT,
            local_mirror_enabled: Boolean(LOCAL_ROOT),
            session_count: sessions.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: JSON.stringify({
            product: "agentic-jupyter-remote-mcp",
            version: PRODUCT_VERSION,
            status: "unreachable",
            base_url: sanitizeBaseUrl(BASE),
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }
);

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
    const result = await nbAction(path, code, 30000, false);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) }] };
  }
);

// 2) Get cell content & outputs
server.tool(
  "notebook_get_cell",
  "Get the full source and outputs of a specific cell by index",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().nonnegative().describe("0-based cell index"),
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
    const result = await nbAction(path, code, 30000, false);
    return { content: [{ type: "text", text: formatOutputs(result.outputs) }] };
  }
);

// 3) Edit cell
server.tool(
  "notebook_edit_cell",
  "Replace the source code of a specific cell by index, then save the notebook",
  {
    path: z.string().describe("Notebook path"),
    cell_index: z.number().int().nonnegative().describe("0-based cell index"),
    new_source: z.string().describe("New source code for the cell"),
  },
  async ({ path, cell_index, new_source }) => {
    const escapedSource = JSON.stringify(new_source.replace(/\n+$/, ""));
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
    position: z.number().int().nonnegative().describe("0-based position to insert at"),
    cell_type: z.enum(["code", "markdown"]).default("code"),
    source: z.string().describe("Cell source code or markdown"),
  },
  async ({ path, position, cell_type, source }) => {
    const escapedSource = JSON.stringify(source.replace(/\n+$/, ""));
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
    cell_index: z.number().int().nonnegative().describe("0-based cell index"),
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
    cell_index: z.number().int().nonnegative().describe("0-based cell index to execute"),
    timeout_ms: z.number().int().positive().max(600000).default(30000).describe("Execution timeout in ms"),
  },
  async ({ path, cell_index, timeout_ms }) => {
    // First, read cell source
    const readCode = `
_c = _nb['cells'][${cell_index}]
_src = ''.join(_c.get('source', []) if isinstance(_c.get('source'), list) else [_c.get('source', '')])
print(_src)
`;
    const readResult = await nbAction(path, readCode, 30000, false);
    const cellSource = formatOutputs(readResult.outputs);

    if (cellSource.trim().length === 0) throw new Error(`Cell ${cell_index} is empty`);

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
_nb['cells'][${cell_index}]['execution_count'] = ${JSON.stringify(execResult.executionCount)}
print('Outputs written back.')
`;
    await nbAction(path, writeCode);

    const text = formatOutputs(execResult.outputs);
    return {
      isError: execResult.status !== "ok",
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
    timeout_ms: z.number().int().positive().max(600000).default(30000).describe("Execution timeout in ms"),
  },
  async ({ path, code, timeout_ms }) => {
    const result = await runOnNotebook(path, code, timeout_ms);
    const text = formatOutputs(result.outputs);
    return {
      isError: result.status !== "ok",
      content: [{ type: "text", text: `Status: ${result.status}\n\n${text || "(no output)"}` }],
    };
  }
);

// ── start ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
