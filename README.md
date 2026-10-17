# InstaBox Remote MCP

A stateless remote MCP endpoint for InstaBox, designed for Cloudflare Workers.

## Endpoint

- MCP: `https://<worker>.workers.dev/mcp`
- Health: `https://<worker>.workers.dev/health`

Every MCP request must include `Authorization: Bearer <MCP_API_KEY>`. The Worker keeps a separate `INSTABOX_API_KEY` secret for the upstream InstaBox API. Do not put either secret in this repository.

## Cloudflare secrets

Set both Worker secrets:

- `MCP_API_KEY`: client key you provide to MCP clients.
- `INSTABOX_API_KEY`: InstaBox API key beginning with `ibk_`.

The client key is sent by the client on each HTTP request. This authenticates access to your Worker; it does not replace the upstream InstaBox key.

## MCP client config

```json
{
  "mcpServers": {
    "instabox": {
      "url": "https://YOUR-WORKER.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

## Tools

- `list_machines`
- `get_machine`
- `create_machine`
- `run_command`
- `read_file_or_directory`
- `update_machine`
- `delete_machine`
- `get_operation`

Machine creation and deletion can incur cost or destroy data. The Worker does not expose arbitrary HTTP proxying.

## Deploy

Connect this repository to Cloudflare Workers or deploy with Wrangler. Add the two secrets above, then test `/health` and send an authenticated MCP `initialize` request to `/mcp`.
