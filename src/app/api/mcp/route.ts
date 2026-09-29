import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { accessService } from "@/server/access";
import { createMcpServer } from "@/server/mcp";

/**
 * MCP endpoint (Streamable HTTP, stateless). Authenticate with a personal API token from
 * Back Office → Account:  Authorization: Bearer rdt_…
 * Every request gets a fresh server bound to the token's owner, so writes are recorded under that user.
 */

export const dynamic = "force-dynamic";

async function handler(req: Request): Promise<Response> {
  const actor = await accessService.authenticate(req.headers.get("authorization"));
  if (!actor) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid API token. Create one in Back Office → Account." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="releasedate"' } },
    );
  }
  const server = createMcpServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export { handler as GET, handler as POST, handler as DELETE };
