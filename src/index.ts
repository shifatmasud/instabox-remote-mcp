import { Sandbox } from "@insforge/instabox-sdk";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

function getClientApiKey(request: Request): string {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (xApiKey) return xApiKey;
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function textResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

const tools = [
  { name: "list_machines", description: "List InstaBox machines. Optional metadata filter.", inputSchema: { type: "object", properties: { metadata: { type: "object", additionalProperties: { type: "string" } } }, additionalProperties: false } },
  { name: "get_machine", description: "Get machine details by ID.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "create_machine", description: "Create a machine from a template. This may incur usage charges.", inputSchema: { type: "object", properties: { template: { type: "string" }, metadata: { type: "object", additionalProperties: { type: "string" } }, vault: { type: "boolean" } }, additionalProperties: false } },
  { name: "run_command", description: "Run a shell command on a machine. Commands can change or delete data.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 }, command: { type: "string", minLength: 1 }, cwd: { type: "string" }, timeoutMs: { type: "integer", minimum: 1, maximum: 120000 } }, required: ["id", "command"], additionalProperties: false } },
  { name: "read_file", description: "Read a UTF-8 text file from a machine.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 } }, required: ["id", "path"], additionalProperties: false } },
  { name: "list_files", description: "List a directory on a machine.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 }, path: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { name: "write_file", description: "Write or replace a UTF-8 text file on a machine.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 }, path: { type: "string", minLength: 1 }, content: { type: "string" } }, required: ["id", "path", "content"], additionalProperties: false } },
  { name: "pause_machine", description: "Pause a machine while retaining its files and process state.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "resume_machine", description: "Resume a paused machine.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "delete_machine", description: "Permanently delete a machine and its disks. Irreversible.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "get_machine_metrics", description: "Get recent CPU and memory metrics.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "get_machine_usage", description: "Get usage for a machine.", inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
  { name: "get_account_usage", description: "Get account-level usage and limits.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
] as const;

async function invokeTool(apiKey: string, name: string, args: Record<string, any>): Promise<ToolResult> {
  try {
    // The API key comes from the MCP client's request. No Cloudflare secret is needed.
    // Each SDK operation receives the same key explicitly.
    switch (name) {
      case "list_machines":
        return textResult(await Sandbox.list({ apiKey, ...(args.metadata ? { metadata: args.metadata } : {}) }));
      case "create_machine": {
        const sandbox = await Sandbox.create(args.template || "agent-browser", {
          apiKey,
          ...(args.metadata ? { metadata: args.metadata } : {}),
          ...(args.vault === undefined ? {} : { vault: args.vault }),
        });
        return textResult({ sandboxId: sandbox.sandboxId });
      }
      case "get_account_usage":
        return textResult(await Sandbox.usage({ apiKey }));
      case "get_machine_usage":
        return textResult(await Sandbox.getUsage(args.id, { apiKey }));
      case "get_machine_metrics":
        return textResult(await Sandbox.getMetrics(args.id, { apiKey }));
      case "delete_machine":
        return textResult({ deleted: await Sandbox.kill(args.id, { apiKey }) });
      case "get_machine": {
        const sandbox = await Sandbox.connect(args.id, { apiKey, resume: false });
        return textResult(await sandbox.getInfo());
      }
      case "run_command": {
        const sandbox = await Sandbox.connect(args.id, { apiKey });
        const result = await sandbox.commands.run(args.command, {
          ...(args.cwd ? { cwd: args.cwd } : {}),
          ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
        });
        return textResult(result);
      }
      case "read_file": {
        const sandbox = await Sandbox.connect(args.id, { apiKey });
        return textResult(await sandbox.files.read(args.path));
      }
      case "list_files": {
        const sandbox = await Sandbox.connect(args.id, { apiKey, resume: false });
        return textResult(await sandbox.files.list(args.path || "/data/home"));
      }
      case "write_file": {
        const sandbox = await Sandbox.connect(args.id, { apiKey });
        await sandbox.files.write(args.path, args.content);
        return textResult({ written: true, path: args.path });
      }
      case "pause_machine": {
        const sandbox = await Sandbox.connect(args.id, { apiKey, resume: false });
        await sandbox.pause();
        return textResult({ paused: true, id: args.id });
      }
      case "resume_machine": {
        const sandbox = await Sandbox.connect(args.id, { apiKey, resume: false });
        await sandbox.resume();
        return textResult({ resumed: true, id: args.id });
      }
      default:
        return errorResult(new Error(`Unknown tool: ${name}`));
    }
  } catch (error) {
    return errorResult(error);
  }
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version",
        "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
      }});
    }
    if (url.pathname === "/health") return json({ ok: true, service: "instabox-remote-mcp", auth: "client-provided-instabox-api-key" });
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "This stateless MCP endpoint accepts POST requests." }, 405, { Allow: "POST, OPTIONS" });

    const apiKey = getClientApiKey(request);
    if (!apiKey) return json({ error: "Provide your InstaBox API key in X-API-Key or Authorization: Bearer." }, 401, { "WWW-Authenticate": "Bearer" });

    let message: JsonRpcRequest;
    try { message = await request.json() as JsonRpcRequest; }
    catch { return rpcError(null, -32700, "Parse error"); }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return rpcError(message?.id ?? null, -32600, "Invalid Request");
    }
    const id = message.id;
    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    if (!hasId && message.method.startsWith("notifications/")) return new Response(null, { status: 202 });

    switch (message.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: message.params?.protocolVersion || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "instabox-remote-mcp", version: "2.0.0" },
        });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools });
      case "tools/call": {
        const name = message.params?.name;
        const args = message.params?.arguments || {};
        const definition = tools.find((tool) => tool.name === name);
        if (!definition) return rpcError(id, -32602, `Unknown tool: ${name}`);
        return rpcResult(id, await invokeTool(apiKey, name, args));
      }
      default:
        return hasId ? rpcError(id, -32601, `Method not found: ${message.method}`) : new Response(null, { status: 202 });
    }
  },
};
