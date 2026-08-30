import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToastClient } from './clients/toast.js';
import { registerOrdersTools } from './tools/orders.js';
import { registerMenusTools } from './tools/menus.js';
import { registerEmployeesTools } from './tools/employees.js';
import { registerLaborTools } from './tools/labor.js';
import { registerRestaurantTools } from './tools/restaurant.js';
import { registerPaymentsTools } from './tools/payments.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerCustomersTools } from './tools/customers.js';
import { registerReportingTools } from './tools/reporting.js';
import { registerCashTools } from './tools/cash.js';

/**
 * Toast MCP Server - Complete restaurant POS/management platform integration
 */

interface ToastServerConfig {
  apiKey?: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid?: string;
  environment?: 'production' | 'sandbox';
  /** Reuse an existing ToastClient (shares the cached auth token across server instances). */
  client?: ToastClient;
}

/**
 * Tools that mutate the POS. These are untested against live Toast and are
 * disabled unless TOAST_ENABLE_WRITE_TOOLS=true is set explicitly.
 */
const WRITE_TOOLS = new Set([
  'toast_create_order',
  'toast_void_order',
  'toast_add_selections',
  'toast_void_selection',
  'toast_apply_discount',
  'toast_update_order_promised_time',
  'toast_update_item_price',
  'toast_set_item_86',
  'toast_bulk_86_items',
  'toast_create_employee',
  'toast_update_employee',
  'toast_disable_employee',
  'toast_add_payment',
  'toast_refund_payment',
  'toast_void_payment',
  'toast_update_stock_quantity',
  'toast_set_infinite_quantity',
  'toast_bulk_update_stock',
  'toast_create_cash_entry',
  'toast_void_cash_entry',
  'toast_create_cash_deposit',
]);

export class ToastMCPServer {
  private server: Server;
  private client: ToastClient;
  private tools: Map<string, any>;

  constructor(config: ToastServerConfig) {
    this.server = new Server(
      {
        name: 'toast-mcp by PrimeCost (Chris Cusack — chriscusack.net)',
        version: '1.1.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize (or reuse) Toast client
    this.client = config.client || new ToastClient({
      apiKey: config.apiKey || '',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      restaurantGuid: config.restaurantGuid,
      environment: config.environment || 'production',
    });

    // Register all tools from all modules
    this.tools = new Map();
    this.registerAllTools();

    // Set up request handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private registerAllTools() {
    const toolModules = [
      registerOrdersTools(this.client),
      registerMenusTools(this.client),
      registerEmployeesTools(this.client),
      registerLaborTools(this.client),
      registerRestaurantTools(this.client),
      registerPaymentsTools(this.client),
      registerInventoryTools(this.client),
      registerCustomersTools(this.client),
      registerReportingTools(this.client),
      registerCashTools(this.client),
    ];

    const enableWrites = process.env.TOAST_ENABLE_WRITE_TOOLS === 'true';
    let skipped = 0;
    for (const tools of toolModules) {
      for (const tool of tools) {
        if (!enableWrites && WRITE_TOOLS.has(tool.name)) {
          skipped++;
          continue;
        }
        this.tools.set(tool.name, tool);
      }
    }

    console.error(`[Toast MCP] Registered ${this.tools.size} tools${skipped ? ` (${skipped} write tools disabled; set TOAST_ENABLE_WRITE_TOOLS=true to enable)` : ''}`);
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema.shape
            ? {
                type: 'object',
                properties: Object.entries(tool.inputSchema.shape).reduce(
                  (acc, [key, value]: [string, any]) => {
                    acc[key] = {
                      type: value._def?.typeName === 'ZodString' ? 'string' :
                            value._def?.typeName === 'ZodNumber' ? 'number' :
                            value._def?.typeName === 'ZodBoolean' ? 'boolean' :
                            value._def?.typeName === 'ZodArray' ? 'array' :
                            value._def?.typeName === 'ZodObject' ? 'object' :
                            value._def?.typeName === 'ZodEnum' ? 'string' :
                            'string',
                      description: value.description || '',
                      ...(value._def?.typeName === 'ZodEnum' && {
                        enum: value._def.values,
                      }),
                      ...(value.isOptional() && {
                        optional: true,
                      }),
                    };
                    return acc;
                  },
                  {} as Record<string, any>
                ),
                required: Object.entries(tool.inputSchema.shape)
                  .filter(([_, value]: [string, any]) => !value.isOptional())
                  .map(([key]) => key),
              }
            : tool.inputSchema,
        })),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);
      
      if (!tool) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      try {
        // Validate input
        const validatedArgs = tool.inputSchema.parse(request.params.arguments || {});

        // Execute tool
        const result = await tool.handler(validatedArgs);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Toast MCP] Server running on stdio');
  }

  /** Connect this server to an arbitrary MCP transport (e.g. streamable HTTP). */
  async connect(transport: any) {
    await this.server.connect(transport);
  }

  async close() {
    await this.server.close();
  }

  getClient(): ToastClient {
    return this.client;
  }
}

export default ToastMCPServer;
