const API = "https://api.instabox.sh";
const PROTOCOL_VERSION = "2025-03-26";

const tools = [
  { name: "list_machines", description: "List InstaBox machines. Optional metadata filters use key:value strings; limit and cursor paginate results.", inputSchema: { type: "object", properties: { metadata: { type: "array", items: { type: "string" } }, limit: { type: "integer" }, cursor: { type: "string" } } } },
  { name: "get_machine", description: "Get a machine by its ID or name.", inputSchema: { type: "object", properties: { machine_id: { type: "string" } }, required: ["machine_id"] } },
  { name: "create_machine", description: "Create an InstaBox machine. This is a billable/resource-creating action.", inputSchema: { type: "object", properties: { name: { type: "string" }, templateId: { type: "string" }, snapshotId: { type: "string" }, timeoutSeconds: { type: "integer" }, onTimeout: { type: "string", enum: ["pause", "kill"] }, autoSuspendAfterSeconds: { type: "integer" }, metadata: { type: "object", additionalProperties: { type: "string" } }, desiredState: { type: "string", enum: ["running", "stopped"] }, guestUser: { type: "string" } }, required: ["name"] } },
  { name: "run_command", description: "Run a shell command in a machine. Commands can modify or delete data; only run trusted commands.", inputSchema: { type: "object", properties: { machine_id: { type: "string" }, cmd: { type: "string" }, cwd: { type: "string" }, envs: { type: "object", additionalProperties: { type: "string" } }, stdin: { type: "string" }, timeoutSeconds: { type: "integer" } }, required: ["machine_id", "cmd"] } },
  { name: "read_file_or_directory", description: "Read a text file or list a directory in a machine.", inputSchema: { type: "object", properties: { machine_id: { type: "string" }, path: { type: "string" } }, required: ["machine_id"] } },
  { name: "update_machine", description: "Update machine timeout, idle suspension, or metadata labels.", inputSchema: { type: "object", properties: { machine_id: { type: "string" }, timeoutSeconds: { type: "integer" }, onTimeout: { type: "string", enum: ["pause", "kill"] }, autoSuspendAfterSeconds: { type: "integer" }, metadata: { type: "object", additionalProperties: { type: "string" } } }, required: ["machine_id"] } },
  { name: "delete_machine", description: "Permanently delete a machine and its files. Saved snapshots are retained.", inputSchema: { type: "object", properties: { machine_id: { type: "string" } }, required: ["machine_id"] } },
  { name: "get_operation", description: "Get or wait for an operation by operation ID. Use this to check create/lifecycle/delete progress.", inputSchema: { type: "object", properties: { operation_id: { type: "string" }, wait: { type: "string" } }, required: ["operation_id"] } }
];

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });
}
function rpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function err(id, code, message, data) { return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function equalSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
async function upstream(env, path, options = {}) {
  if (!env.INSTABOX_API_KEY) throw new Error("Worker is missing INSTABOX_API_KEY secret.");
  const headers = new Headers(options.headers || {});
  headers.set("X-API-Key", env.INSTABOX_API_KEY);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(API + path, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error("InstaBox API " + response.status + ": " + JSON.stringify(body));
  return body;
}
function idem(headers) { headers.set("Idempotency-Key", crypto.randomUUID()); return headers; }
async function callTool(env, name, a) {
  const id = encodeURIComponent(a.machine_id || "");
  switch (name) {
    case "list_machines": {
      const q = new URLSearchParams();
      if (a.limit !== undefined) q.set("limit", String(a.limit));
      if (a.cursor) q.set("cursor", a.cursor);
      for (const m of a.metadata || []) q.append("metadata", m);
      return upstream(env, "/v1/machines" + (q.size ? "?" + q.toString() : ""));
    }
    case "get_machine":
      if (!a.machine_id) throw new Error("machine_id is required");
      return upstream(env, "/v1/machines/" + encodeURIComponent(a.machine_id));
    case "create_machine": {
      const { name: machineName, ...rest } = a;
      const headers = idem(new Headers());
      const body = { name: machineName, ...rest };
      if (!body.templateId && !body.snapshotId) body.templateId = "universal";
      return upstream(env, "/v1/machines", { method: "POST", headers, body: JSON.stringify(body) });
    }
    case "run_command": {
      if (!a.machine_id || !a.cmd) throw new Error("machine_id and cmd are required");
      const { machine_id, ...body } = a;
      return upstream(env, "/v1/machines/" + id + "/exec", { method: "POST", body: JSON.stringify(body) });
    }
    case "read_file_or_directory": {
      if (!a.machine_id) throw new Error("machine_id is required");
      const q = new URLSearchParams({ path: a.path || "/" });
      return upstream(env, "/v1/machines/" + id + "/files?" + q.toString());
    }
    case "update_machine": {
      if (!a.machine_id) throw new Error("machine_id is required");
      const { machine_id, ...body } = a;
      return upstream(env, "/v1/machines/" + id, { method: "PATCH", headers: idem(new Headers()), body: JSON.stringify(body) });
    }
    case "delete_machine":
      if (!a.machine_id) throw new Error("machine_id is required");
      return upstream(env, "/v1/machines/" + id, { method: "DELETE", headers: idem(new Headers()) });
    case "get_operation": {
      if (!a.operation_id) throw new Error("operation_id is required");
      const q = new URLSearchParams();
      if (a.wait) q.set("wait", a.wait);
      return upstream(env, "/v1/operations/" + encodeURIComponent(a.operation_id) + (q.size ? "?" + q.toString() : ""));
    }
    default: throw new Error("Unknown tool: " + name);
  }
}
async function handleRpc(request, env) {
  let body;
  try { body = await request.json(); } catch { return json(err(null, -32700, "Parse error"), 400); }
  const batch = Array.isArray(body);
  const messages = batch ? body : [body];
  const outputs = [];
  for (const msg of messages) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      outputs.push(err(msg?.id ?? null, -32600, "Invalid Request")); continue;
    }
    if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") continue;
    if (msg.method === "initialize") {
      outputs.push(rpc(msg.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "instabox-remote-mcp", version: "1.0.0" } }));
    } else if (msg.method === "ping") {
      outputs.push(rpc(msg.id, {}));
    } else if (msg.method === "tools/list") {
      outputs.push(rpc(msg.id, { tools }));
    } else if (msg.method === "tools/call") {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      try {
        const result = await callTool(env, name, args);
        outputs.push(rpc(msg.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false }));
      } catch (e) {
        outputs.push(rpc(msg.id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }));
      }
    } else if (msg.method.startsWith("resources/") || msg.method.startsWith("prompts/")) {
      outputs.push(err(msg.id ?? null, -32601, "Method not found"));
    } else {
      outputs.push(err(msg.id ?? null, -32601, "Method not found"));
    }
  }
  const reply = batch ? outputs : outputs[0];
  if (!reply) return new Response(null, { status: 202 });
  return json(reply);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "instabox-remote-mcp" });
    if (url.pathname !== "/mcp") return json({ error: "Not found", endpoint: "/mcp" }, 404);
    if (request.method !== "POST") return json({ error: "Use POST for MCP JSON-RPC requests." }, 405, { Allow: "POST" });
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!equalSecret(token, env.MCP_API_KEY)) return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    if (!env.MCP_API_KEY) return json({ error: "Worker is missing MCP_API_KEY secret." }, 500);
    return handleRpc(request, env);
  }
};
