# InstaBox Remote MCP

A stateless remote MCP endpoint for InstaBox, designed for Cloudflare Workers.

## Endpoint

- MCP: `https://instabox-remote-mcp.<your-subdomain>.workers.dev/mcp`
- Health: `https://instabox-remote-mcp.<your-subdomain>.workers.dev/health`

Every MCP request must include `Authorization: Bearer <MCP_API_KEY>`. The Worker keeps a separate `INSTABOX_API_KEY` secret for the upstream InstaBox API. Neither secret belongs in this repository.

## Tools

- `list_machines`
- `get_machine`
- `create_machine`
- `run_command`
- `read_file_or_directory`
- `update_machine`
- `delete_machine`
- `get_operation`

Machine creation may incur cost. Machine deletion permanently removes the machine and its files. Shell commands can modify or delete data. Use restricted InstaBox API keys where practical.

## Deploy

1. In Cloudflare, create a Worker named `instabox-remote-mcp` and deploy the contents of `src/index.js` (or connect this repository to Workers Builds using `wrangler.toml`).
2. Add these as **Worker secrets**, not plaintext variables:
   - `MCP_API_KEY`: a high-entropy client bearer key you generate and distribute to your MCP clients.
   - `INSTABOX_API_KEY`: your InstaBox API key beginning with `ibk_`.
3. Deploy and test `/health`.
4. Send an authenticated MCP `initialize` request to `/mcp`.

Cloudflare deployment automation can be enabled through GitHub Actions after granting the GitHub connection the workflow scope and adding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

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

The client bearer key authenticates to this Worker; it is distinct from the upstream InstaBox key. This is a shared-key design, so any client that obtains the bearer key can use the Worker with the upstream key's permissions.
