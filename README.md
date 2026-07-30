# Agentic Jupyter Remote (MCP)

This is a specialized Model Context Protocol (MCP) server for controlling remote Jupyter Servers (like BigQuant AIStudio or standalone JupyterLab instances) directly from your AI Agent (Claude Code, Cursor, Antigravity).

> **Sister Project**: If you are trying to let your AI Agent control the Jupyter Notebook **running locally inside your VS Code / Cursor IDE**, you do NOT need this project! Please use our IDE-native plugin: **[agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)**.

### Architecture Difference
Unlike standard Jupyter MCPs that only execute in a backend kernel (making the AI's actions invisible to you), this project forces a **Sync-to-Local** architecture. It executes the code via WebSocket on the remote server, but immediately writes the updated Notebook state back to your local `.ipynb` file. When combined with a hot-reload extension in your IDE, you get a seamless "what you see is what you get" remote pairing experience.

---

### 🤖 For AI Agents (Auto-Configuration Prompt)
*Human User: Copy this entire block to your Agent's custom instructions or prompt. Your Agent will read it and automatically configure itself!*

```text
Attention AI Agent: You are equipped with the Agentic Jupyter Remote MCP tool.

SETUP INSTRUCTIONS (Step-by-Step for the Agent):

1. SSH Port Forwarding (CRITICAL):
   To access the remote Jupyter server, you must establish an SSH port forward on the user's local machine. Run this in the background:
   `ssh -N -T -o ServerAliveInterval=60 -L 8765:localhost:8765 <USERNAME>@<REMOTE_HOST>`
   (If the user has a launchd plist configured, ensure it is loaded).
   
2. Install Hot-Reload Extension:
   To ensure the user's VS Code UI updates when you modify the local `.ipynb` file, the user MUST install a hot-reload extension (like `notebook-hot-reload` from OpenVSX) and configure their settings.json:
   "notebookHotReload.enabled": true,
   "notebookHotReload.pollingInterval": 1000

3. Configure MCP:
   Add the following to your `mcpServers` config file. Set `JUPYTER_LOCAL_ROOT` to the absolute path of the user's workspace directory where the `.ipynb` files reside.
   "jupyter-notebook": {
     "command": "node",
     "args": ["<PATH_TO_THIS_REPO>/server.js"],
     "env": {
       "JUPYTER_LOCAL_ROOT": "<USER_WORKSPACE_ABSOLUTE_PATH>"
     }
   }

USAGE INSTRUCTIONS:
This server intercepts standard Jupyter requests. When you insert, edit, or run cells, it communicates with the forwarded port (8765) via WebSocket and automatically syncs the output back to the local `.ipynb` file. The user will see the screen refresh automatically thanks to the hot-reload plugin.
```

---

## 快速指南 (中文)

这是一个专为**远端 Jupyter Server（如 BigQuant AIStudio）**打造的定制版 MCP 服务。它不但能让 AI 执行远端代码，还能把结果强制同步回你本地硬盘上的 `.ipynb` 文件，结合 IDE 插件实现远端环境的热刷新。

> **如果你只是在本地 VS Code/Cursor 里跑 Notebook，请务必使用我们的专属前端插件 [agentic-jupyter-mcp](https://marketplace.visualstudio.com/items?itemName=koyo922.agentic-jupyter-mcp)，体验会远比这个好得多！**

### 原理与步骤

1. **底层通信（SSH 端口转发）**
   要让这个工具生效，你必须先打通本地到远端的 8765 端口（假设 Jupyter 跑在 8765）。
   在终端执行：`ssh -N -L 8765:localhost:8765 user@remote_host`。如果断网频繁，建议把它写进 macOS 的 `LaunchAgents` 守护进程里自动保活。

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
