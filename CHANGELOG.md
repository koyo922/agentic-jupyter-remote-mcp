# Changelog

## 1.2.0 - 2026-08-27

- Publish a first-class `agentic-jupyter-remote` Skill for GitHub-based installation.
- Add a version-locked Skill launcher for the matching remote MCP package.
- Document the `/bin/bash <launcher>` entrypoint so GitHub ZIP installs work without executable bits.
- Add `jupyter_server_status` for safe, non-Notebook health and session diagnostics.
- Redact credentials, query parameters, and fragments from status URLs.
- Read the MCP runtime version from package metadata.

## 1.1.0 - 2026-08-27

- Package the remote Jupyter MCP server as an installable Node CLI artifact.
- Require safe Notebook paths relative to `JUPYTER_NOTEBOOKS` and prevent mirror path traversal.
- Reuse Jupyter sessions by exact Notebook path rather than basename substring matching.
- Wait for both the shell reply and IOPub idle state so outputs are complete before returning.
- Keep optional local mirroring separate from the remote HTTP/WebSocket execution backend.
- Add automated tests for path and session routing invariants.
