#!/usr/bin/env node

import { createServer as nodeCreateServer } from 'node:http';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.js';
import { createDataSource } from './data-source.js';
import { createToastHttpHandler, createToastMcpServer } from './server.js';

const MAX_HTTP_BODY_BYTES = 1_048_576;

interface HttpIncoming {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  once(event: 'aborted', callback: () => void): void;
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>;
}

interface HttpOutgoing {
  statusCode: number;
  headersSent: boolean;
  writableEnded: boolean;
  once(event: 'close' | 'drain', callback: () => void): void;
  setHeader(name: string, value: string): void;
  write(chunk: Uint8Array): boolean;
  end(chunk?: string): void;
}

interface HttpServer {
  listen(port: number, host: string, callback: () => void): void;
  close(callback: (error?: Error) => void): void;
}

const createHttpServer = nodeCreateServer as unknown as (
  callback: (request: HttpIncoming, response: HttpOutgoing) => void,
) => HttpServer;

async function requestBody(request: HttpIncoming): Promise<ArrayBuffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += bytes.length;
    if (size > MAX_HTTP_BODY_BYTES) {
      throw new Error('HTTP request body exceeds 1 MB');
    }
    chunks.push(bytes);
  }
  return size > 0
    ? (Uint8Array.from(Buffer.concat(chunks, size)).buffer as ArrayBuffer)
    : undefined;
}

async function toWebRequest(
  request: HttpIncoming,
  signal: AbortSignal,
): Promise<Request> {
  const host = request.headers.host ?? '127.0.0.1';
  const url = new URL(request.url ?? '/', `http://${host}`);
  const body = await requestBody(request);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return new Request(url, {
    method: request.method ?? 'POST',
    headers,
    ...(body ? { body } : {}),
    signal,
  });
}

async function sendWebResponse(
  response: Response,
  outgoing: HttpOutgoing,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  if (!response.body) {
    outgoing.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!outgoing.write(value)) {
        await new Promise<void>((resolve) => outgoing.once('drain', resolve));
      }
    }
    outgoing.end();
  } finally {
    reader.releaseLock();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const source = createDataSource(config);

  console.error(
    `[Toast MCP] Starting v2 in ${source.kind} mode over ${config.transport}`,
  );

  if (config.transport === 'stdio') {
    const handle = serveStdio(() => createToastMcpServer(source), {
      onerror: (error) => console.error('[Toast MCP]', error),
    });
    const close = async () => {
      await handle.close();
      process.exit(0);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    return;
  }

  const { fetch, handler } = createToastHttpHandler(source, config);
  const nodeServer = createHttpServer((request, response) => {
    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort());
    response.once('close', () => {
      if (!response.writableEnded) abortController.abort();
    });
    void (async () => {
      try {
        await sendWebResponse(
          await fetch(await toWebRequest(request, abortController.signal)),
          response,
        );
      } catch (error) {
        if (!response.headersSent) {
          response.statusCode =
            error instanceof Error && error.message.includes('exceeds 1 MB')
              ? 413
              : 500;
          response.setHeader('content-type', 'application/json');
        }
        if (!response.writableEnded) {
          response.end(JSON.stringify({ error: 'HTTP request failed' }));
        }
      }
    })();
  });
  nodeServer.listen(config.port, config.host, () => {
    console.error(
      `[Toast MCP] MCP endpoint listening at http://${config.host}:${config.port}/mcp`,
    );
  });
  const close = async () => {
    await handler.close();
    await new Promise<void>((resolve, reject) => {
      nodeServer.close((error) => (error ? reject(error) : resolve()));
    });
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Toast MCP] Fatal: ${message}`);
  process.exitCode = 1;
});
