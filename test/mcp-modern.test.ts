import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
} from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { DemoToastDataSource } from '../src/data-source.js';
import { createToastMcpServer } from '../src/server.js';
import { OPERATIONS_RESOURCE_URI } from '../src/tools.js';

const MODERN = '2026-07-28';
const ENVELOPE = {
  [PROTOCOL_VERSION_META_KEY]: MODERN,
  [CLIENT_INFO_META_KEY]: { name: 'toast-mcp-test', version: '1.0.0' },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};

function request(
  method: string,
  params: Record<string, unknown>,
  name?: string,
): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MODERN,
      'mcp-method': method,
      ...(name ? { 'mcp-name': name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: { ...params, _meta: ENVELOPE },
    }),
  });
}

describe('Toast MCP modern transport', () => {
  it('negotiates the 2026-07-28 protocol and returns structured demo output', async () => {
    const handler = createMcpHandler(() =>
      createToastMcpServer(new DemoToastDataSource()),
    );
    const discover = await handler.fetch(request('server/discover', {}));
    expect(discover.status).toBe(200);
    const discovery = (await discover.json()) as {
      result: { supportedVersions: string[] };
    };
    expect(discovery.result.supportedVersions).toEqual([MODERN]);

    const response = await handler.fetch(
      request('tools/call', { name: 'toast_get_verification_status', arguments: {} }, 'toast_get_verification_status'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { structuredContent: { context: { dataSource: string } } };
    };
    expect(body.result.structuredContent.context.dataSource).toBe('demo');
    await handler.close();
  });

  it('advertises the MCP App resource from the overview tool', async () => {
    const handler = createMcpHandler(() =>
      createToastMcpServer(new DemoToastDataSource()),
    );
    const response = await handler.fetch(request('tools/list', {}));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: {
        tools: Array<{
          name: string;
          _meta?: { ui?: { resourceUri?: string } };
        }>;
      };
    };
    const overview = body.result.tools.find(
      (tool) => tool.name === 'toast_show_operations_overview',
    );
    expect(overview?._meta?.ui?.resourceUri).toBe(OPERATIONS_RESOURCE_URI);
    await handler.close();
  });

  it('reports all current Toast-hosted API families with honest coverage states', async () => {
    const handler = createMcpHandler(() =>
      createToastMcpServer(new DemoToastDataSource()),
    );
    const response = await handler.fetch(
      request(
        'tools/call',
        { name: 'toast_get_api_coverage', arguments: {} },
        'toast_get_api_coverage',
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: {
        structuredContent: {
          totalApiFamilies: number;
          apiFamilies: Array<{ name: string; implementationStatus: string }>;
        };
      };
    };
    expect(body.result.structuredContent.totalApiFamilies).toBe(17);
    expect(body.result.structuredContent.apiFamilies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Analytics', implementationStatus: 'catalog-only-separate-access' }),
        expect.objectContaining({ name: 'Menus V3', implementationStatus: 'catalog-only-ordering-partners' }),
        expect.objectContaining({ name: 'Packaging' }),
        expect.objectContaining({ name: 'Restaurant Availability' }),
      ]),
    );
    await handler.close();
  });
});
