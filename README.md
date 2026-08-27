# Agentic Jupyter Remote (MCP)

[![npm version](https://img.shields.io/npm/v/agentic-jupyter-remote-mcp.svg)](https://www.npmjs.com/package/agentic-jupyter-remote-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

[English](#english) | [中文](#中文)

---

## English

An MCP server for AI agents that need to read, edit, and execute notebooks on a standalone or remote **Jupyter Server**. It connects to Jupyter's HTTP Sessions API and WebSocket kernel channels; it does not use an IDE's local IPython kernel.

### Choose the right product

| Kernel location | Product | Execution backend |
| --- | --- | --- |
| Local Notebook opened and run by VS Code, Cursor, Windsurf, or Antigravity | [agentic-jupyter-mcp](https://github.com/koyo922/agentic-jupyter-mcp) | IDE Notebook API and the IDE-selected IPython kernel |
| Standalone or remote Jupyter Server reachable by URL or SSH tunnel | **This package** | Jupyter HTTP Sessions API and WebSocket kernel channels |

A notebook file copied or synchronized onto a laptop is still a remote notebook when its real kernel lives on the Jupyter Server. File synchronization and kernel execution are separate responsibilities.

### Install

Node.js 18 or newer is required.

```bash
npx agentic-jupyter-remote-mcp@latest --port 8765
```

Or install it globally:

```bash
npm install --global agentic-jupyter-remote-mcp
agentic-jupyter-remote-mcp --port 8765
```

### MCP configuration

```json
{
  "mcpServers": {
    "agentic-jupyter-remote": {
      "command": "npx",
      "args": ["-y", "agentic-jupyter-remote-mcp@latest", "--port", "8765"],
      "env": {
        "JUPYTER_TOKEN": "<token>",
        "JUPYTER_NOTEBOOKS": "/home/aiuser/work"
      }
    }
  }
}
```

You may set `JUPYTER_BASE_URL` instead of `--port`, for example `http://127.0.0.1:8765`. Notebook tool paths are always relative to `JUPYTER_NOTEBOOKS`.

If the Jupyter Server is remote, establish a secure tunnel or another authenticated network route outside this package. The package never creates SSH credentials or tunnels itself.

### Tools

- `notebook_list_cells`
- `notebook_get_cell`
- `notebook_edit_cell`
- `notebook_insert_cell`
- `notebook_delete_cell`
- `notebook_run_cell`
- `notebook_run_code`

Read tools do not rewrite the notebook. Mutating tools save on the remote filesystem, and run tools execute in the Jupyter kernel session associated with the exact notebook path.

### File synchronization

This package owns remote Jupyter execution, not workspace synchronization. For a mirrored local workspace, use a dedicated synchronization tool such as Mutagen, rsync, or your platform's native sync mechanism.

`JUPYTER_LOCAL_ROOT` remains available as an explicit compatibility option for copying a remote notebook back to one local directory after mutations. Leave it unset when an external synchronizer is active; do not enable two writers for the same mirror.

### Security

- Bind forwarded ports to loopback unless remote access is intentionally secured.
- Keep `JUPYTER_TOKEN` in the MCP client's secret environment, not in Git.
- Tool paths cannot be absolute and cannot escape `JUPYTER_NOTEBOOKS`.
- Local compatibility mirroring cannot escape `JUPYTER_LOCAL_ROOT`.

---

## 中文

这是一个面向独立或远端 **Jupyter Server** 的 MCP 服务。它通过 Jupyter HTTP Sessions API 与 WebSocket Kernel Channels 读取、编辑和执行 Notebook；它不使用 IDE 里的本地 IPython Kernel。

### 两种产品必须分开

| Kernel 在哪里 | 应使用的产品 | 实际执行后端 |
| --- | --- | --- |
| Notebook 在 VS Code、Cursor、Windsurf 或 Antigravity 中打开并由 IDE 运行 | [agentic-jupyter-mcp](https://github.com/koyo922/agentic-jupyter-mcp) | IDE Notebook API 与 IDE 当前选择的 IPython Kernel |
| 可通过 URL 或 SSH 隧道访问的独立/远端 Jupyter Server | **本包** | Jupyter HTTP Sessions API 与 WebSocket Kernel Channels |

即使 `.ipynb` 已同步到笔记本电脑，只要真实 Kernel 仍在 Jupyter Server，它就属于远端场景。文件同步与 Kernel 执行是两个独立职责。

### 安装与配置

需要 Node.js 18 或更高版本：

```bash
npx agentic-jupyter-remote-mcp@latest --port 8765
```

MCP 配置示例：

```json
{
  "mcpServers": {
    "agentic-jupyter-remote": {
      "command": "npx",
      "args": ["-y", "agentic-jupyter-remote-mcp@latest", "--port", "8765"],
      "env": {
        "JUPYTER_TOKEN": "<token>",
        "JUPYTER_NOTEBOOKS": "/home/aiuser/work"
      }
    }
  }
}
```

也可以通过 `JUPYTER_BASE_URL` 指定完整地址。所有 Notebook 工具的 `path` 都必须相对于 `JUPYTER_NOTEBOOKS`。

远端网络连接由外部的 SSH 隧道或其他受认证链路负责；本包不会创建 SSH 凭据或自行启动隧道。

### 文件同步边界

本包只负责远端 Jupyter 执行，不负责工作区同步。本地镜像应交给 Mutagen、rsync 或平台原生同步机制。

`JUPYTER_LOCAL_ROOT` 仅作为显式兼容选项保留，用于在修改后把远端 Notebook 复制到一个本地目录。已经启用外部同步时应保持它为空，避免同一镜像出现两个写入者。

### 安全约束

- 转发端口默认只绑定 loopback，除非远端访问已另行加固。
- `JUPYTER_TOKEN` 只放在 MCP 客户端的私密环境中，不写入 Git。
- 工具路径不能是绝对路径，也不能越出 `JUPYTER_NOTEBOOKS`。
- 本地兼容镜像不能越出 `JUPYTER_LOCAL_ROOT`。
