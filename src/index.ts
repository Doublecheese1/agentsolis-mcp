#!/usr/bin/env node
/**
 * stdio entry. stdout is reserved for MCP messages. Do not write logs here.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAgentServer } from "./server.js";

const server = createAgentServer();
await server.connect(new StdioServerTransport());
