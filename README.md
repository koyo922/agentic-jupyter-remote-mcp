# Agentic Jupyter Remote (MCP)

[![GitHub License](https://img.shields.io/github/license/koyo922/agentic-jupyter-remote-mcp)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/Protocol-MCP-blue.svg)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/koyo922/agentic-jupyter-remote-mcp)](https://github.com/koyo922/agentic-jupyter-remote-mcp/issues)

[English](#english) | [中文](#中文)

---

## 🤖 For AI Agents (Auto-Configuration Prompt)
*Human User: Copy this entire block to your Agent's custom instructions or prompt. Your Agent will read it and automatically configure itself!*

```text
Attention AI Agent: You are equipped with the Agentic Jupyter Remote MCP tool.

SETUP INSTRUCTIONS (Step-by-Step for the Agent):

1. AUTOMATIC INSTALLATION (Action for Agent):
   If this repository isn't cloned yet, clone it and install dependencies:
   - Run: `git clone https://github.com/koyo922/agentic-jupyter-remote-mcp.git ~/.local/share/agentic-jupyter-remote-mcp`
   - Run: `cd ~/.local/share/agentic-jupyter-remote-mcp && npm install`

2. SSH Port Forwarding (DO NOT EXECUTE AUTOMATICALLY):
   To access the remote Jupyter server, an SSH port forward is required (e.g. `ssh -N -L 8765:localhost:8765 <USER>@<HOST>`).
   DO NOT execute this command yourself in the background, as it requires human authentication and is potentially dangerous. Instead, instruct the Human to establish the port forwarding or configure a background launch daemon.

3. Install Hot-Reload Extension (Action for Human):
   Instruct the user to install a hot-reload extension in their IDE (like `notebook-hot-reload`) and configure their `settings.json`:
   "notebookHotReload.enabled": true,
   "notebookHotReload.pollingInterval": 1000

4. Configure MCP (Action for Agent):
   Add the following to your `mcpServers` config file. Set `JUPYTER_LOCAL_ROOT` to the absolute path of the user's workspace directory where the `.ipynb` files reside.
   "jupyter-notebook": {
     "command": "node",
     "args": ["<PATH_TO_THIS_REPO>/server.js"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<USER_WORKSPACE_ABSOLUTE_PATH>"
     }
   }

USAGE INSTRUCTIONS:
When you insert, edit, or run cells, this server communicates with the forwarded port (8765) via WebSocket and automatically syncs the output back to the local `.ipynb` file. The user will see the screen refresh automatically thanks to the hot-reload plugin.
```

---

## English

This is a specialized Model Context Protocol (MCP) server for controlling remote Jupyter Servers (like BigQuant AIStudio or standalone JupyterLab instances) directly from your AI Agent (Claude Code, Cursor, Antigravity).

> **Sister Project**: If you are trying to let your AI Agent control the Jupyter Notebook **running locally inside your VS Code / Cursor IDE**, you do NOT need this project! Please use our IDE-native plugin: **[agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)**.

### Architecture Difference
Unlike standard Jupyter MCPs that only execute in a backend kernel (making the AI's actions invisible to you), this project forces a **Sync-to-Local** architecture. It executes the code via WebSocket on the remote server, but immediately writes the updated Notebook state back to your local `.ipynb` file. When combined with a hot-reload extension in your IDE, you get a seamless "what you see is what you get" remote pairing experience.

---

## 中文 (快速指南)

这是一个专为**远端Jupyter Server（如BigQuant AIStudio）**打造的定制版 MCP 服务。它不但能让 AI 执行远端代码，还能把结果强制同步回你本地硬盘上的 `.ipynb` 文件，结合 IDE 插件实现远端环境的热刷新。

> **如果你只是在本地 VS Code/Cursor 里跑 Notebook，请务必使用我们的专属前端插件 [agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)，体验会远比这个好得多！**

### 原理与步骤

1. **底层通信（SSH 端口转发）**
   要让这个工具生效，你必须先打通本地到远端的 8765 端口（假设 Jupyter 跑在 8765）。
   在终端执行：`ssh -N -L 8765:localhost:8765 user@remote_host`。由于这个操作涉及密码或安全认证，请**人工手动执行**，或把它写进 macOS 的 `LaunchAgents` 守护进程里自动保活。

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
     "args": ["<本仓库所在路径>/server.js"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<你本地工程代码的绝对路径>"
     }
   }
   ```
   **大功告成！你现在可以让 AI 在远端服务器上狂飙了！**
