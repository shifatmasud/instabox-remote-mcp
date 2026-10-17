# InstaBox Remote MCP

A stateless remote MCP server for InstaBox, running on Cloudflare Workers.

## Endpoints

- MCP: `https://YOUR-WORKER.workers.dev/mcp`
- Health: `https://YOUR-WORKER.workers.dev/health`

## Authentication

Use **one secret only: `INSTABOX_API_KEY`**. Configure it as a Cloudflare Worker secret. The same key authenticates incoming MCP client requests and is forwarded to InstaBox as `X-API-Key`. The MCP endpoint accepts the key in either `X-API-Key` or `Authorization: Bearer ...`.

Do not put the key in this repository or in public client-side/browser code. Store it in your MCP client's server-side secret/environment configuration.

## Available tools

- `list_machines`
- `get_machine`
- `create_machine`
- `run_command`
- `pause_machine`
- `resume_machine`
- `delete_machine`
- `get_machine_metrics`
- `get_machine_usage`
- `get_account_usage`

Machine creation may incur usage charges. Shell commands can modify or delete data. Deleting a machine permanently removes it and its disks.

## Deploy

1. Deploy `src/index.js` as a Cloudflare Worker named `instabox-remote-mcp` (or connect this repository to Workers Builds).
2. In the Worker settings, add the secret `INSTABOX_API_KEY` with your InstaBox API key (`ibk_...`).
3. Deploy, then verify `/health` returns `{"ok":true,"service":"instabox-remote-mcp"}`.
4. Configure your MCP client to use `/mcp` and send the same key as a request header.

The optional `INSTABOX_API_URL` variable can override the upstream base URL; by default it is `https://api.instabox.sh`.

## MCP client configuration

Adapt this to the client’s supported environment-variable syntax:

```json
{
  "mcpServers": {
    "instabox": {
      "url": "https://YOUR-WORKER.workers.dev/mcp",
      "headers": {
        "X-API-Key": "${INSTABOX_API_KEY}"
      }
    }
  }
}
```

Some MCP clients require a literal secret value or a separate secret manager rather than expanding environment variables inside JSON. Keep the value private.

## Notes

This implementation handles stateless JSON-RPC over HTTP POST and exposes a health endpoint. It does not implement server-sent events or session state.
