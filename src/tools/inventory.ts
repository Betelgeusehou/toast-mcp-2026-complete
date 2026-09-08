import { z } from 'zod';
import { ToastClient } from '../clients/toast.js';

type InventoryStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'QUANTITY';

interface MenuItemInventory {
  guid?: string;
  multiLocationId?: string;
  itemGuidValidity?: string;
  status: InventoryStatus;
  quantity?: number | null;
  versionId?: string;
}

const restaurantConfig = (restaurantGuid: string) => ({
  params: { restaurantGuid },
});

async function updateInventory(
  client: ToastClient,
  restaurantGuid: string,
  updates: Array<{ guid: string; status: InventoryStatus; quantity?: number }>
) {
  return client.put<MenuItemInventory[]>(
    '/stock/v1/inventory/update',
    updates,
    restaurantConfig(restaurantGuid)
  );
}

/**
 * Inventory Management Tools backed by Toast's official Stock API.
 */
export function registerInventoryTools(client: ToastClient) {
  return [
    {
      name: 'toast_get_stock_item',
      description: 'Get Stock API inventory information for a specific menu item',
      inputSchema: z.object({
        itemGuid: z.string().describe('Toast menu item GUID'),
        restaurantGuid: z.string().optional(),
      }),
      handler: async (args: { itemGuid: string; restaurantGuid?: string }) => {
        const restaurantGuid = args.restaurantGuid || client.getRestaurantGuid();
        const items = await client.post<MenuItemInventory[]>(
          '/stock/v1/inventory',
          [{ guid: args.itemGuid }],
          restaurantConfig(restaurantGuid)
        );
        return { stockItem: items[0] || null };
      },
    },
    {
      name: 'toast_update_stock_quantity',
      description: 'Set a menu item to limited-stock mode with a remaining quantity greater than zero',
      inputSchema: z.object({
        itemGuid: z.string().describe('Toast menu item GUID'),
        quantity: z.number().positive().describe('Remaining quantity; must be greater than zero'),
        restaurantGuid: z.string().optional(),
      }),
      handler: async (args: { itemGuid: string; quantity: number; restaurantGuid?: string }) => {
        const restaurantGuid = args.restaurantGuid || client.getRestaurantGuid();
        const result = await updateInventory(client, restaurantGuid, [{
          guid: args.itemGuid,
          status: 'QUANTITY',
          quantity: args.quantity,
        }]);
        return { success: true, itemGuid: args.itemGuid, status: 'QUANTITY', quantity: args.quantity, result };
      },
    },
    {
      name: 'toast_set_infinite_quantity',
      description: 'Mark an item as fully in stock. Set infinite=true; use the quantity or 86 tools for other states.',
      inputSchema: z.object({
        itemGuid: z.string().describe('Toast menu item GUID'),
        infinite: z.boolean().describe('Must be true to set status to IN_STOCK'),
        restaurantGuid: z.string().optional(),
      }),
      handler: async (args: { itemGuid: string; infinite: boolean; restaurantGuid?: string }) => {
        if (!args.infinite) {
          throw new Error('infinite=false is ambiguous in the Toast Stock API. Use toast_update_stock_quantity or toast_set_item_86 instead.');
        }
        const restaurantGuid = args.restaurantGuid || client.getRestaurantGuid();
        const result = await updateInventory(client, restaurantGuid, [{
          guid: args.itemGuid,
          status: 'IN_STOCK',
        }]);
        return { success: true, itemGuid: args.itemGuid, status: 'IN_STOCK', result };
      },
    },
    {
      name: 'toast_list_low_stock_items',
      description: 'List Stock API items that are out of stock or at/below a quantity threshold',
      inputSchema: z.object({
        threshold: z.number().nonnegative().optional().describe('Quantity threshold; defaults to 0'),
        restaurantGuid: z.string().optional(),
      }),
      handler: async (args: { threshold?: number; restaurantGuid?: string }) => {
        const restaurantGuid = args.restaurantGuid || client.getRestaurantGuid();
        const threshold = args.threshold ?? 0;
        const items = await client.get<MenuItemInventory[]>(
          '/stock/v1/inventory',
          { restaurantGuid }
        );
        const lowStock = items.filter(item =>
          item.status === 'OUT_OF_STOCK' ||
          (item.status === 'QUANTITY' && (item.quantity ?? 0) <= threshold)
        );
        return { items: lowStock, count: lowStock.length, threshold };
      },
    },
    {
      name: 'toast_bulk_update_stock',
      description: 'Set limited-stock quantities for multiple menu items in one Stock API request',
      inputSchema: z.object({
        updates: z.array(z.object({
          itemGuid: z.string().describe('Toast menu item GUID'),
          quantity: z.number().positive().describe('Remaining quantity; must be greater than zero'),
        })).min(1).max(100),
        restaurantGuid: z.string().optional(),
      }),
      handler: async (args: { updates: Array<{ itemGuid: string; quantity: number }>; restaurantGuid?: string }) => {
        const restaurantGuid = args.restaurantGuid || client.getRestaurantGuid();
        const payload = args.updates.map(update => ({
          guid: update.itemGuid,
          status: 'QUANTITY' as const,
          quantity: update.quantity,
        }));
        const result = await updateInventory(client, restaurantGuid, payload);
        return { success: true, updatedCount: args.updates.length, result };
      },
    },
  ];
}
