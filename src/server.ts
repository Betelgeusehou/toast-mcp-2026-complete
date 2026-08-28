import { readFile } from 'node:fs/promises';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { AppConfig } from './config.js';
import type { ToastDataSource } from './data-source.js';
import { OPERATIONS_RESOURCE_URI, registerToastTools } from './tools.js';

const APP_MIME_TYPE = 'text/html;profile=mcp-app';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

interface HttpHandlerRuntime {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

function requestHostname(value: string): string | undefined {
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return undefined;
  }
}

function validateHttpRequest(
  request: Request,
  allowedHosts: string[],
  allowedOrigins: string[],
): Response | undefined {
  const host = requestHostname(request.headers.get('host') ?? '');
  if (!host || !allowedHosts.includes(host)) {
    return new Response('Invalid Host header', { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin) {
    let originHost: string | undefined;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      return new Response('Invalid Origin header', { status: 403 });
    }
    if (!allowedOrigins.includes(originHost)) {
      return new Response('Origin is not allowed', { status: 403 });
    }
  }
  return undefined;
}

async function operationsAppHtml(): Promise<string> {
  return readFile(new URL('../ui/operations/index.html', import.meta.url), 'utf8');
}

export function createToastMcpServer(source: ToastDataSource): McpServer {
  const server = new McpServer(
    {
      name: 'toast-mcp-community',
      title: 'Toast MCP Community Edition',
      version: '2.0.0-beta.1',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  registerToastTools(server, source);
  server.registerResource(
    'Toast operations overview app',
    OPERATIONS_RESOURCE_URI,
    {
      title: 'Toast Operations Overview',
      description:
        'Interactive, privacy-safe operations overview for the toast_show_operations_overview tool.',
      mimeType: APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
          },
        },
      },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: APP_MIME_TYPE,
          text: await operationsAppHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  return server;
}

export function createToastHttpHandler(
  source: ToastDataSource,
  config: AppConfig,
): { fetch: (request: Request) => Promise<Response>; handler: HttpHandlerRuntime } {
  const handler = createMcpHandler(() => createToastMcpServer(source), {
    onerror: (error) => console.error('[Toast MCP]', error),
  });
  const allowedHosts =
    config.allowedHosts.length > 0
      ? config.allowedHosts
      : LOCAL_HOSTS;
  const allowedOrigins =
    config.allowedOrigins.length > 0
      ? config.allowedOrigins
      : LOCAL_HOSTS;
  const fetch = async (request: Request): Promise<Response> => {
    const rejected = validateHttpRequest(request, allowedHosts, allowedOrigins);
    if (rejected) return rejected;
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return handler.fetch(request);
    if (request.method !== 'GET') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET' },
      });
    }
    if (url.pathname === '/') {
      return Response.json({
        service: 'Toast MCP Community Edition',
        version: '2.0.0-beta.1',
        mode: source.kind,
        mcpEndpoint: '/mcp',
        verification:
          source.kind === 'demo'
            ? 'demo_verified'
            : 'contract_verified_live_unverified',
      });
    }
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'toast-mcp-community',
        version: '2.0.0-beta.1',
        mode: source.kind,
      });
    }
    return new Response('Not found', { status: 404 });
  };

  return { fetch, handler };
}
