# Changelog

## 1.1.0 - 2026-08-27

- Publish the remote Jupyter MCP server as an installable npm CLI package.
- Require safe Notebook paths relative to `JUPYTER_NOTEBOOKS` and prevent mirror path traversal.
- Reuse Jupyter sessions by exact Notebook path rather than basename substring matching.
- Wait for both the shell reply and IOPub idle state so outputs are complete before returning.
- Keep optional local mirroring separate from the remote HTTP/WebSocket execution backend.
- Add automated tests for path and session routing invariants.
