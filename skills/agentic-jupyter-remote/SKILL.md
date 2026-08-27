---
name: agentic-jupyter-remote
description: Safely read, edit, and execute notebooks on a standalone or remote Jupyter Server through HTTP Sessions and WebSocket kernel channels. Use only when the real kernel belongs to a Jupyter Server, not an IDE-local IPython kernel.
---

# Agentic Jupyter Remote

Use this Skill for a standalone or remote Jupyter Server reachable through an authenticated URL, SSH tunnel, or equivalent secure route. A Notebook mirrored onto the local filesystem still belongs to this route when its real kernel runs on that Server.

Do not use this Skill for a Notebook whose kernel is selected and managed by VS Code, Cursor, Windsurf, or Antigravity. That case needs the separate `agentic-jupyter-mcp` IDE extension.

## Connect

The MCP backend requires Node.js 18 or newer and these environment variables:

- `JUPYTER_TOKEN`: current Jupyter Server token; keep it out of files and logs.
- `JUPYTER_NOTEBOOKS`: remote Notebook root, such as `/home/aiuser/work`.
- `JUPYTER_BASE_URL`: Server URL, or pass `--port` to use `http://127.0.0.1:<port>`.

Register `/bin/bash` as the stdio MCP command and pass the absolute path to [scripts/launch.sh](scripts/launch.sh) as its first argument. GitHub ZIP installation does not preserve executable bits, so do not register the script itself as the command. The launcher starts the matching published backend version; do not substitute a local IDE bridge or a direct `.ipynb` file editor.

## Operate

1. Call `jupyter_server_status`. Continue only when it reports `status: ready`.
2. Use paths relative to `JUPYTER_NOTEBOOKS`; reject absolute paths and traversal.
3. Start with `notebook_list_cells`, then use `notebook_get_cell` for the complete source and outputs of one cell.
4. Before any write, re-read the target cell and confirm its index, type, and source. After insertion or deletion, discard old downstream indices.
5. Use only the Notebook MCP tools to edit, insert, delete, execute, and save. Never modify `.ipynb` JSON with shell, patches, Git, or ad hoc scripts.
6. Treat file synchronization as a separate system. Leave `JUPYTER_LOCAL_ROOT` unset when Mutagen, rsync, or another synchronizer already owns the mirror.
7. After execution, inspect the returned status and outputs. An error result is not a successful run merely because the transport call completed.

The backend creates or reuses a Jupyter `python3` session through the Sessions API. It does not require an IDE `Select Kernel` action.
