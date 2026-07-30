# Agentic Jupyter Remote (MCP)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/koyo922/agentic-jupyter-remote-mcp)](https://github.com/koyo922/agentic-jupyter-remote-mcp/issues)

[English](#english) | [中文](#中文)

---

## English

This is a specialized Model Context Protocol (MCP) server for controlling remote Jupyter Servers (like standalone JupyterLab instances or cloud remote environments) directly from your AI Agent.

> **Sister Project**: If you are trying to let your AI Agent control the Jupyter Notebook **running locally inside your VS Code / Cursor IDE**, you do NOT need this project! Please use our IDE-native plugin: **[agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)**.

### Architecture Difference
Unlike standard Jupyter MCPs that only execute in a backend kernel (making the AI's actions invisible to you), this project forces a **Sync-to-Local** architecture. It executes the code via WebSocket on the remote server, but immediately writes the updated Notebook state back to your local `.ipynb` file. When combined with a hot-reload extension in your IDE, you get a seamless "what you see is what you get" remote pairing experience.

### 🤖 For AI Agents (Auto-Configuration Prompt)
*Tip for Humans: You can just give the URL of this README to your AI Agent, or copy-paste this block. The AI will read it, run the CLI commands to install the server for you, and configure itself automatically!*

```text
Attention AI Agent: You are equipped with the Agentic Jupyter Remote MCP tool.

SETUP INSTRUCTIONS (Step-by-Step for the Agent):

1. AUTOMATIC INSTALLATION (Action for Agent):
   If this repository isn't cloned yet, clone it and install dependencies:
   - Run: `git clone https://github.com/koyo922/agentic-jupyter-remote-mcp.git ~/.local/share/agentic-jupyter-remote-mcp`
   - Run: `cd ~/.local/share/agentic-jupyter-remote-mcp && npm install`

2. SSH Port Forwarding (DO NOT EXECUTE AUTOMATICALLY):
   To access the remote Jupyter server, an SSH port forward is required (e.g. `ssh -N -L <LOCAL_PORT>:localhost:<REMOTE_PORT> <USER>@<HOST>`).
   DO NOT execute this command yourself in the background, as it requires human authentication and is potentially dangerous. Instead, instruct the Human to establish the port forwarding or configure a background launch daemon.

3. Install Hot-Reload Extension (Action for Human):
   Instruct the user to install a hot-reload extension in their IDE (like `notebook-hot-reload`) and configure their `settings.json`:
   "notebookHotReload.enabled": true,
   "notebookHotReload.pollingInterval": 1000

4. Configure MCP (Action for Agent):
   Add the following to your `mcpServers` config file. Set `JUPYTER_LOCAL_ROOT` to the absolute path of the user's workspace directory where the `.ipynb` files reside. The `--port` argument should match the `<LOCAL_PORT>` the user forwarded.
   "jupyter-notebook": {
     "command": "node",
     "args": ["<PATH_TO_THIS_REPO>/server.js", "--port", "<LOCAL_PORT>"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<USER_WORKSPACE_ABSOLUTE_PATH>"
     }
   }

USAGE INSTRUCTIONS:
When you insert, edit, or run cells, this server communicates with the forwarded port via WebSocket and automatically syncs the output back to the local `.ipynb` file. The user will see the screen refresh automatically thanks to the hot-reload plugin.
```

---

## 中文 (快速指南)

这是一个专为 **远端 Jupyter Server**（如云端独立 JupyterLab 或专用容器环境）打造的定制版 MCP 服务。它不但能让 AI 执行远端代码，还能把结果强制同步回你本地硬盘上的 `.ipynb` 文件，结合 IDE 插件实现远端环境的热刷新。

> **如果你只是在本地 VS Code/Cursor 里跑 Notebook，请务必使用我们的专属前端插件 [agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)，体验会远比这个好得多！**

### 🤖 专给 AI Agent 看的配置指令 (全自动)
*小贴士：你不需要自己动手！直接把当前这个网页的 URL 发给你的 AI，或者把下面这段英文复制给它。AI 读完后会直接在后台帮你拉取代码、安装依赖，并引导你完成端口转发的认证环节。*

```text
Attention AI Agent: You are equipped with the Agentic Jupyter Remote MCP tool.

SETUP INSTRUCTIONS (Step-by-Step for the Agent):

1. AUTOMATIC INSTALLATION (Action for Agent):
   If this repository isn't cloned yet, clone it and install dependencies:
   - Run: `git clone https://github.com/koyo922/agentic-jupyter-remote-mcp.git ~/.local/share/agentic-jupyter-remote-mcp`
   - Run: `cd ~/.local/share/agentic-jupyter-remote-mcp && npm install`

2. SSH Port Forwarding (DO NOT EXECUTE AUTOMATICALLY):
   To access the remote Jupyter server, an SSH port forward is required (e.g. `ssh -N -L <LOCAL_PORT>:localhost:<REMOTE_PORT> <USER>@<HOST>`).
   DO NOT execute this command yourself in the background, as it requires human authentication and is potentially dangerous. Instead, instruct the Human to establish the port forwarding or configure a background launch daemon.

3. Install Hot-Reload Extension (Action for Human):
   Instruct the user to install a hot-reload extension in their IDE (like `notebook-hot-reload`) and configure their `settings.json`:
   "notebookHotReload.enabled": true,
   "notebookHotReload.pollingInterval": 1000

4. Configure MCP (Action for Agent):
   Add the following to your `mcpServers` config file. Set `JUPYTER_LOCAL_ROOT` to the absolute path of the user's workspace directory where the `.ipynb` files reside. The `--port` argument should match the `<LOCAL_PORT>` the user forwarded.
   "jupyter-notebook": {
     "command": "node",
     "args": ["<PATH_TO_THIS_REPO>/server.js", "--port", "<LOCAL_PORT>"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<USER_WORKSPACE_ABSOLUTE_PATH>"
     }
   }

USAGE INSTRUCTIONS:
When you insert, edit, or run cells, this server communicates with the forwarded port via WebSocket and automatically syncs the output back to the local `.ipynb` file. The user will see the screen refresh automatically thanks to the hot-reload plugin.
```

### 原理与手动步骤 (给人类看的备份)

1. **底层通信（SSH 端口转发）**
   要让这个工具生效，你必须先打通本地到远端 Jupyter 服务端口。
   在终端执行：`ssh -N -L <本地端口>:localhost:<远端端口> user@remote_host`。由于这个操作涉及密码或安全认证，请**人工手动执行**。如果断网频繁，建议把它写进 macOS 的 `LaunchAgents` 守护进程里自动保活。

2. **打通本地视图实时刷新 (Hot-Reload)**
   当这个 MCP 帮你执行完远端代码并写回本地 `.ipynb` 后，VS Code 默认是不会刷新界面的。
   你必须安装第三方插件（如 `notebook-hot-reload`）并在 `.vscode/settings.json` 中配置：
   ```json
   "notebookHotReload.enabled": true,
   "notebookHotReload.pollingInterval": 1000
   ```

3. **配置 MCP 并启动**
   下载本仓库后，配置你的 AI Agent（如 Claude 或 Cursor）：
   ```json
   "jupyter-notebook": {
     "command": "node",
     "args": ["<本仓库所在路径>/server.js", "--port", "<你转发的本地端口>"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<你本地工程代码的绝对路径>"
     }
   }
   ```
