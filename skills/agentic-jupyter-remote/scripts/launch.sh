#!/bin/bash

set -euo pipefail

package_spec="${AGENTIC_JUPYTER_REMOTE_MCP_SPEC:-github:koyo922/agentic-jupyter-remote-mcp#v1.2.1}"

if ! command -v npx >/dev/null 2>&1; then
    printf 'npx is required; install Node.js 18 or newer.\n' >&2
    exit 1
fi

exec npx --yes --package "$package_spec" agentic-jupyter-remote-mcp "$@"
