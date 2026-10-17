# InstaBox Remote MCP

A stateless remote MCP server for the official `@insforge/instabox-sdk`, deployed as a Cloudflare Worker.

## Authentication

There is **no separate MCP key and no `INSTABOX_API_KEY` Worker secret**. Configure the MCP client to send your InstaBox API key on each request:

- `X-API-Key: ibk_...` (recommended), or
- `Authorization: Bearer ibk_...`

The Worker reads the key from the incoming request and passes it explicitly to each SDK call. InstaBox validates the key when the SDK calls its API. Missing keys are rejected before tool execution. Use HTTPS and keep the key in your MCP client's secret/credential settings; do not hard-code it in a public web page.

## MCP client configuration

```json
{
  "mcpServers": {
    "instabox": {
      "url": "https://instabox-remote-mcp.<your-subdomain>.workers.dev/mcp",
      "headers": {
        "X-API-Key": "ibk_your_real_key"
      }
    }
  }
}
```

Use your actual deployed Worker URL. If your MCP client supports environment-variable interpolation, reference its secret store instead of putting the literal key in a shared config file.

## Tools

- `list_machines`
- `get_machine`
- `create_machine`
- `run_command`
- `read_file`
- `list_files`
- `write_file`
- `pause_machine`
- `resume_machine`
- `delete_machine`
- `get_machine_metrics`
- `get_machine_usage`
- `get_account_usage`

Machine creation and shell/file tools can incur charges or modify/delete data. The SDK is used for all InstaBox operations; this Worker does not manually construct InstaBox REST requests.

## Local development

```sh
npm install
npm run dev
``

Deploy with `npm run deploy` from an authenticated Wrangler environment. No Worker secret setup is required.
