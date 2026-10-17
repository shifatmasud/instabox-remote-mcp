const API_BASE = "https://api.instabox.sh";

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function suppliedKey(request) {
  const apiKey = request.headers.get("X-API-Key");
  if (apiKey) return apiKey.trim();
  const authorization = request.headers.get("Authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function callInstabox(env, path, method = "GET", body) {
  const response = await fetch(`${env.INSTABOX_API_URL || API_BASE}${path}`, {
    method,
    headers: {
      "X-API-Key": env.INSTABOX_API_KEY,
      "Accept": "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { raw: text }; }
  if (!response.ok) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: response.status, error: data }) }] };
  }
  return { isError: false, content: [{ type: "text", text: JSON.stringify(data) }] };
}

const tools = [
  {
    name: "list_machines",
    description: "List InstaBox machines. Optional limit and cursor are passed through to the API.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string" }, metadata: { type: "string", description: "Optional metadata filter in the API's documented format." } }, additionalProperties: false },
  },
  {
    name: "get_machine",
    description: "Get a machine's details by machine ID.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "create_machine",
    description: "Create a machine from a template. This may incur usage charges.",
    inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, template: { type: "string", description: "Template name, e.g. agent-browser or universal." }, metadata: { type: "object", additionalProperties: { type: "string" } }, vault: { type: "boolean" } }, required: ["name"], additionalProperties: false },
  },
  {
    name: "run_command",
    description: "Execute a shell command on a machine. Commands can change or delete data.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 }, command: { type: "string", minLength: 1 }, cwd: { type: "string" }, timeoutMs: { type: "integer", minimum: 1, maximum: 120000 } }, required: ["id", "command"], additionalProperties: false },
  },
  {
    name: "pause_machine",
    description: "Pause a machine while retaining its files and process state where supported.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "resume_machine",
    description: "Resume a paused machine.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "delete_machine",
    description: "Permanently delete a machine and its disks. Irreversible.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "get_machine_metrics",
    description: "Get recent CPU and memory metrics for a machine.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "get_machine_usage",
    description: "Get usage information for a machine.",
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "get_account_usage",
    description: "Get account-level usage and limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function invokeTool(env, name, args) {
  const id = encodeURIComponent(args.id || "");
  switch (name) {
    case "list_machines":
      return callInstabox(env, "/v1/machines" + queryString({ limit: args.limit, cursor: args.cursor, metadata: args.metadata }));
    case "get_machine":
      return callInstabox(env, `/v1/machines/${id}`);
    case "create_machine": {
      const body = {
        name: args.name,
        ...(args.template ? { template: args.template } : {}),
        ...(args.metadata ? { metadata: args.metadata } : {}),
        ...(args.vault === undefined ? {} : { vault: args.vault }),
      };
      return callInstabox(env, "/v1/machines", "POST", body);
    }
    case "run_command":
      return callInstabox(env, `/v1/machines/${id}/exec`, "POST", {
        command: args.command,
        ...(args.cwd ? { cwd: args.cwd } : {}),
        ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
      });
    case "pause_machine":
      return callInstabox(env, `/v1/machines/${id}/suspend`, "POST", {});
    case "resume_machine":
      return callInstabox(env, `/v1/machines/${id}/resume`, "POST", {});
    case "delete_machine":
      return callInstabox(env, `/v1/machines/${id}`, "DELETE");
    case "get_machine_metrics":
      return callInstabox(env, `/v1/machines/${id}/metrics`);
    case "get_machine_usage":
      return callInstabox(env, `/v1/machines/${id}/usage`);
    case "get_account_usage":
      return callInstabox(env, "/v1/usage");
    default:
      return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
}

function rpcResult(id, result) {
  return json({ jsonrpc: "2.0", id, result });
}
function rpcError(id, code, message) {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version",
        "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
      }});
    }
    if (url.pathname === "/health") return json({ ok: true, service: "instabox-remote-mcp" });
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "This stateless MCP endpoint accepts POST requests." }, 405, { Allow: "POST, OPTIONS" });
    if (!env.INSTABOX_API_KEY) return json({ error: "Worker secret INSTABOX_API_KEY is not configured." }, 500);
    if (!constantTimeEqual(suppliedKey(request), env.INSTABOX_API_KEY)) {
      return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    }

    let message;
    try { message = await request.json(); }
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
          serverInfo: { name: "instabox-remote-mcp", version: "1.0.0" },
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
        const result = await invokeTool(env, name, args);
        return rpcResult(id, result);
      }
      default:
        return hasId ? rpcError(id, -32601, `Method not found: ${message.method}`) : new Response(null, { status: 202 });
    }
  },
};
