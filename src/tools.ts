import type { McpServer } from '@modelcontextprotocol/server';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ToastApiError } from './clients/toast.js';
import type { ToastDataSource } from './data-source.js';
import {
  InventoryItemSummarySchema,
  LocationSummarySchema,
  MenuItemSummarySchema,
  OperationsOverviewSchema,
  OrderSummarySchema,
  ResultContextSchema,
  resultContext,
} from './types/index.js';

export const OPERATIONS_RESOURCE_URI = 'ui://toast-mcp/operations-overview.html';

const ReadOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const ContextOutput = { context: ResultContextSchema };
const ApiCoverageSchema = z.object({
  name: z.string(),
  basePath: z.string(),
  specVersion: z.string(),
  schemaDialect: z.string(),
  implementationStatus: z.string(),
});
const RestaurantInput = z.object({
  restaurantGuid: z
    .string()
    .optional()
    .describe('Toast restaurant GUID. Defaults to the first configured location.'),
});

function selectedRestaurant(
  source: ToastDataSource,
  restaurantGuid: string | undefined,
): string {
  return restaurantGuid ?? source.defaultRestaurantGuid;
}

function dateRange(startDate?: string, endDate?: string): {
  startDate: string;
  endDate: string;
} {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getTime() - 24 * 60 * 60 * 1_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error('startDate and endDate must be valid ISO 8601 timestamps');
  }
  if (start >= end) throw new Error('startDate must be earlier than endDate');
  if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1_000) {
    throw new Error('Order history ranges cannot exceed 31 days');
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function success(data: Record<string, unknown>, summary: string) {
  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: data,
  };
}

function failure(error: unknown) {
  const requestId = error instanceof ToastApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : 'Unexpected tool error';
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: requestId ? `${message} (Toast request ID: ${requestId})` : message,
      },
    ],
  };
}

interface ApiManifest {
  source: string;
  checkedAt: string;
  contracts: Array<z.infer<typeof ApiCoverageSchema>>;
}

let apiManifestPromise: Promise<ApiManifest> | undefined;

async function loadApiManifest(): Promise<ApiManifest> {
  if (!apiManifestPromise) {
    apiManifestPromise = (async () => {
      const candidates = [
        // Compiled package: dist/src/tools.js -> package/contracts.
        new URL('../../contracts/toast-api-manifest.json', import.meta.url),
        // Source development: src/tools.ts -> repository/contracts.
        new URL('../contracts/toast-api-manifest.json', import.meta.url),
      ];
      for (const candidate of candidates) {
        try {
          return JSON.parse(await readFile(candidate, 'utf8')) as ApiManifest;
        } catch (error) {
          if (candidate === candidates.at(-1)) throw error;
        }
      }
      throw new Error('Toast API manifest was not found');
    })();
  }
  return apiManifestPromise;
}

export function registerToastTools(
  server: McpServer,
  source: ToastDataSource,
): void {
  server.registerTool(
    'toast_get_verification_status',
    {
      title: 'Get Toast MCP verification status',
      description:
        'Explains whether this server is using safe demo data or customer-supplied live Toast credentials, and what has been verified.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        ...ContextOutput,
        mode: z.enum(['demo', 'live']),
        readyForLiveData: z.boolean(),
        contractBaseline: z.string(),
        safety: z.object({
          readOnly: z.literal(true),
          guestPiiExcluded: z.literal(true),
          credentialsReturnedToModel: z.literal(false),
        }),
      }),
      annotations: { ...ReadOnlyAnnotations, openWorldHint: false },
    },
    async () => {
      const output = {
        context: resultContext(source.kind),
        mode: source.kind,
        readyForLiveData: source.kind === 'live',
        contractBaseline: 'Official Toast public OpenAPI specifications, checked 2026-08-28',
        safety: {
          readOnly: true as const,
          guestPiiExcluded: true as const,
          credentialsReturnedToModel: false as const,
        },
      };
      return success(
        output,
        source.kind === 'demo'
          ? 'Demo mode is active. Results are synthetic and safe to explore.'
          : 'Live mode is configured. Contracts are verified; maintainer live certification is still pending.',
      );
    },
  );

  server.registerTool(
    'toast_get_api_coverage',
    {
      title: 'Get Toast API coverage',
      description:
        'Lists every current Toast-hosted public API family and distinguishes implemented read coverage from catalog-only APIs that require Toast access and validation.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        ...ContextOutput,
        source: z.string(),
        checkedAt: z.string(),
        totalApiFamilies: z.number().int().nonnegative(),
        apiFamilies: z.array(ApiCoverageSchema),
      }),
      annotations: { ...ReadOnlyAnnotations, openWorldHint: false },
    },
    async () => {
      try {
        const manifest = await loadApiManifest();
        const apiFamilies = manifest.contracts.map(
          ({ name, basePath, specVersion, schemaDialect, implementationStatus }) => ({
            name,
            basePath,
            specVersion,
            schemaDialect,
            implementationStatus,
          }),
        );
        return success(
          {
            context: resultContext(source.kind),
            source: manifest.source,
            checkedAt: manifest.checkedAt,
            totalApiFamilies: apiFamilies.length,
            apiFamilies,
          },
          `Cataloged ${apiFamilies.length} official Toast-hosted API families; statuses distinguish implemented coverage from access-dependent roadmap items.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_list_locations',
    {
      title: 'List configured Toast locations',
      description:
        'Lists the demo restaurant or the explicitly configured live Toast restaurant locations.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        ...ContextOutput,
        locations: z.array(LocationSummarySchema),
      }),
      annotations: ReadOnlyAnnotations,
    },
    async (_args, context) => {
      try {
        const locations = await source.listLocations(context.mcpReq.signal);
        return success(
          { context: resultContext(source.kind), locations },
          `Found ${locations.length} configured Toast location${locations.length === 1 ? '' : 's'}.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_find_orders',
    {
      title: 'Find Toast orders',
      description:
        'Returns privacy-minimized order summaries for an ISO 8601 time range of at most 31 days.',
      inputSchema: z.object({
        restaurantGuid: RestaurantInput.shape.restaurantGuid,
        startDate: z.string().optional().describe('ISO 8601 timestamp; defaults to 24 hours ago.'),
        endDate: z.string().optional().describe('ISO 8601 timestamp; defaults to now.'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      outputSchema: z.object({
        ...ContextOutput,
        restaurantGuid: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        orders: z.array(OrderSummarySchema),
      }),
      annotations: ReadOnlyAnnotations,
    },
    async ({ restaurantGuid, startDate, endDate, limit }, context) => {
      try {
        const guid = selectedRestaurant(source, restaurantGuid);
        const range = dateRange(startDate, endDate);
        const orders = await source.findOrders(
          guid,
          range.startDate,
          range.endDate,
          limit,
          context.mcpReq.signal,
        );
        return success(
          {
            context: resultContext(source.kind),
            restaurantGuid: guid,
            ...range,
            orders,
          },
          `Found ${orders.length} privacy-minimized order summar${orders.length === 1 ? 'y' : 'ies'}.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_get_order',
    {
      title: 'Get a Toast order summary',
      description:
        'Gets one order by Toast GUID, excluding customer identity, contact, delivery, and payment-card fields.',
      inputSchema: z.object({
        restaurantGuid: RestaurantInput.shape.restaurantGuid,
        orderGuid: z.string().min(1).describe('Toast order GUID.'),
      }),
      outputSchema: z.object({
        ...ContextOutput,
        restaurantGuid: z.string(),
        order: OrderSummarySchema.nullable(),
      }),
      annotations: ReadOnlyAnnotations,
    },
    async ({ restaurantGuid, orderGuid }, context) => {
      try {
        const guid = selectedRestaurant(source, restaurantGuid);
        const order = await source.getOrder(
          guid,
          orderGuid,
          context.mcpReq.signal,
        );
        return success(
          {
            context: resultContext(source.kind),
            restaurantGuid: guid,
            order,
          },
          order ? `Order ${order.displayNumber} was found.` : 'No order matched that GUID.',
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_search_menu',
    {
      title: 'Search a Toast menu',
      description:
        'Searches resolved Toast Menus V2 item names, groups, menus, PLUs, and SKUs.',
      inputSchema: z.object({
        restaurantGuid: RestaurantInput.shape.restaurantGuid,
        query: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      outputSchema: z.object({
        ...ContextOutput,
        restaurantGuid: z.string(),
        items: z.array(MenuItemSummarySchema),
      }),
      annotations: ReadOnlyAnnotations,
    },
    async ({ restaurantGuid, query, limit }, context) => {
      try {
        const guid = selectedRestaurant(source, restaurantGuid);
        const items = await source.searchMenu(
          guid,
          query,
          limit,
          context.mcpReq.signal,
        );
        return success(
          {
            context: resultContext(source.kind),
            restaurantGuid: guid,
            items,
          },
          `Found ${items.length} matching menu item${items.length === 1 ? '' : 's'}.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_get_inventory',
    {
      title: 'Get Toast inventory risks',
      description:
        'Reads Toast Stock API inventory. Live responses normally contain OUT_OF_STOCK and QUANTITY items only.',
      inputSchema: z.object({
        restaurantGuid: RestaurantInput.shape.restaurantGuid,
        status: z
          .string()
          .optional()
          .describe('Optional current or future Toast stock status. Unknown values are preserved.'),
      }),
      outputSchema: z.object({
        ...ContextOutput,
        restaurantGuid: z.string(),
        inventory: z.array(InventoryItemSummarySchema),
      }),
      annotations: ReadOnlyAnnotations,
    },
    async ({ restaurantGuid, status }, context) => {
      try {
        const guid = selectedRestaurant(source, restaurantGuid);
        const inventory = await source.getInventory(
          guid,
          status,
          context.mcpReq.signal,
        );
        return success(
          {
            context: resultContext(source.kind),
            restaurantGuid: guid,
            inventory,
          },
          `Found ${inventory.length} inventory record${inventory.length === 1 ? '' : 's'}.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'toast_show_operations_overview',
    {
      title: 'Show Toast operations overview',
      description:
        'Builds a privacy-safe sales and inventory overview and renders an interactive MCP App when supported.',
      inputSchema: z.object({
        restaurantGuid: RestaurantInput.shape.restaurantGuid,
        startDate: z.string().optional().describe('ISO 8601 timestamp; defaults to 24 hours ago.'),
        endDate: z.string().optional().describe('ISO 8601 timestamp; defaults to now.'),
      }),
      outputSchema: z.object({
        ...ContextOutput,
        overview: OperationsOverviewSchema,
      }),
      annotations: ReadOnlyAnnotations,
      _meta: {
        ui: {
          resourceUri: OPERATIONS_RESOURCE_URI,
          visibility: ['model', 'app'],
        },
        'openai/outputTemplate': OPERATIONS_RESOURCE_URI,
        'openai/toolInvocation/invoking': 'Loading Toast operations…',
        'openai/toolInvocation/invoked': 'Toast operations ready',
      },
    },
    async ({ restaurantGuid, startDate, endDate }, context) => {
      try {
        const guid = selectedRestaurant(source, restaurantGuid);
        const range = dateRange(startDate, endDate);
        const overview = await source.getOperationsOverview(
          guid,
          range.startDate,
          range.endDate,
          context.mcpReq.signal,
        );
        return success(
          { context: resultContext(source.kind), overview },
          `${overview.location.name}: ${overview.metrics.orderCount} orders, $${overview.metrics.grossSales.toFixed(2)} gross sales, and ${overview.metrics.inventoryRisks} inventory risks.`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
}
