import { ToastClient } from './clients/toast.js';
import type { AppConfig } from './config.js';
import { createDemoSnapshot, DEMO_RESTAURANT_GUID } from './fixtures/demo.js';
import type {
  DataSourceKind,
  InventoryItemSummary,
  LocationSummary,
  MenuItemSummary,
  OperationsOverview,
  OrderItemSummary,
  OrderSummary,
} from './types/index.js';

export interface ToastDataSource {
  readonly kind: DataSourceKind;
  readonly defaultRestaurantGuid: string;
  listLocations(signal?: AbortSignal): Promise<LocationSummary[]>;
  findOrders(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<OrderSummary[]>;
  getOrder(
    restaurantGuid: string,
    orderGuid: string,
    signal?: AbortSignal,
  ): Promise<OrderSummary | null>;
  searchMenu(
    restaurantGuid: string,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<MenuItemSummary[]>;
  getInventory(
    restaurantGuid: string,
    status?: string,
    signal?: AbortSignal,
  ): Promise<InventoryItemSummary[]>;
  getOperationsOverview(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<OperationsOverview>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compact<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => value !== undefined);
}

function orderItem(raw: unknown): OrderItemSummary | undefined {
  const selection = record(raw);
  const name = text(selection.displayName) || text(record(selection.item).name);
  if (!name) return undefined;
  return { name, quantity: number(selection.quantity, 1) };
}

function normalizeOrder(raw: unknown): OrderSummary | undefined {
  const order = record(raw);
  const checks = array(order.checks).map(record);
  const firstCheck = checks[0] ?? {};
  const guid = text(order.guid);
  if (!guid) return undefined;
  const voided = checks.length > 0 && checks.every((check) => bool(check.voided));
  const items = compact(
    checks.flatMap((check) => array(check.selections).map(orderItem)),
  );
  const modifiedDate = optionalText(order.modifiedDate);
  const status = voided
    ? 'VOIDED'
    : text(firstCheck.paymentStatus, text(order.status, 'UNKNOWN'));
  return {
    guid,
    displayNumber: text(firstCheck.displayNumber, guid.slice(0, 8)),
    openedDate: text(order.openedDate, text(firstCheck.openedDate)),
    ...(modifiedDate ? { modifiedDate } : {}),
    status,
    totalAmount: checks.reduce(
      (sum, check) => sum + number(check.totalAmount),
      0,
    ),
    taxAmount: checks.reduce((sum, check) => sum + number(check.taxAmount), 0),
    voided,
    items,
  };
}

function normalizeLocation(raw: unknown, fallbackGuid: string): LocationSummary {
  const restaurant = record(raw);
  const general = record(restaurant.general);
  const locationName = optionalText(general.locationName);
  const timeZone = optionalText(general.timeZone);
  const currencyCode = optionalText(general.currencyCode);
  return {
    guid: text(restaurant.guid, fallbackGuid),
    name: text(general.name, `Toast location ${fallbackGuid.slice(0, 8)}`),
    ...(locationName ? { locationName } : {}),
    ...(timeZone ? { timeZone } : {}),
    ...(currencyCode ? { currencyCode } : {}),
  };
}

function collectMenuGroups(
  rawGroups: unknown,
  menuName: string,
  inheritedGroupName = 'Ungrouped',
): MenuItemSummary[] {
  return array(rawGroups).flatMap((rawGroup) => {
    const group = record(rawGroup);
    const groupName = text(group.name, inheritedGroupName);
    const items = compact(
      array(group.menuItems).map((rawItem): MenuItemSummary | undefined => {
        const item = record(rawItem);
        const guid = text(item.guid);
        const name = text(item.name);
        if (!guid || !name) return undefined;
        return {
          guid,
          name,
          groupName,
          menuName,
          price: nullableNumber(item.price),
          sku: nullableText(item.sku ?? item.plu),
        };
      }),
    );
    return [
      ...items,
      ...collectMenuGroups(group.menuGroups, menuName, groupName),
    ];
  });
}

function normalizeMenus(raw: unknown): MenuItemSummary[] {
  const restaurant = record(raw);
  return array(restaurant.menus).flatMap((rawMenu) => {
    const menu = record(rawMenu);
    return collectMenuGroups(menu.menuGroups, text(menu.name, 'Menu'));
  });
}

function normalizeInventory(raw: unknown): InventoryItemSummary[] {
  return compact(
    array(raw).map((rawItem): InventoryItemSummary | undefined => {
      const item = record(rawItem);
      const guid = text(item.guid);
      if (!guid) return undefined;
      return {
        guid,
        status: text(item.status, 'UNKNOWN'),
        quantity: nullableNumber(item.quantity),
        multiLocationId: nullableText(item.multiLocationId),
      };
    }),
  );
}

async function buildOverview(
  source: ToastDataSource,
  restaurantGuid: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<OperationsOverview> {
  const [locations, orders, inventory] = await Promise.all([
    source.listLocations(signal),
    source.findOrders(restaurantGuid, startDate, endDate, 100, signal),
    source.getInventory(restaurantGuid, undefined, signal),
  ]);
  const location = locations.find((entry) => entry.guid === restaurantGuid);
  if (!location) throw new Error(`Restaurant is not configured: ${restaurantGuid}`);

  const activeOrders = orders.filter((order) => !order.voided);
  const grossSales = activeOrders.reduce(
    (sum, order) => sum + order.totalAmount,
    0,
  );
  const itemCounts = new Map<string, number>();
  for (const order of activeOrders) {
    for (const item of order.items) {
      itemCounts.set(item.name, (itemCounts.get(item.name) ?? 0) + item.quantity);
    }
  }

  return {
    location,
    period: { startDate, endDate },
    metrics: {
      orderCount: activeOrders.length,
      grossSales: Number(grossSales.toFixed(2)),
      averageCheck:
        activeOrders.length === 0
          ? 0
          : Number((grossSales / activeOrders.length).toFixed(2)),
      openChecks: activeOrders.filter((order) => order.status === 'OPEN').length,
      inventoryRisks: inventory.filter((item) => item.status !== 'IN_STOCK')
        .length,
    },
    topItems: [...itemCounts.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .slice(0, 5),
    inventory,
    recentOrders: [...orders]
      .sort((a, b) => b.openedDate.localeCompare(a.openedDate))
      .slice(0, 10),
  };
}

export class DemoToastDataSource implements ToastDataSource {
  readonly kind = 'demo' as const;
  readonly defaultRestaurantGuid = DEMO_RESTAURANT_GUID;

  async listLocations(): Promise<LocationSummary[]> {
    return createDemoSnapshot().locations;
  }

  async findOrders(
    _restaurantGuid: string,
    startDate: string,
    endDate: string,
    limit: number,
  ): Promise<OrderSummary[]> {
    const start = Date.parse(startDate);
    const end = Date.parse(endDate);
    return createDemoSnapshot().orders
      .filter((order) => {
        const opened = Date.parse(order.openedDate);
        return opened >= start && opened <= end;
      })
      .slice(0, limit);
  }

  async getOrder(
    _restaurantGuid: string,
    orderGuid: string,
  ): Promise<OrderSummary | null> {
    return (
      createDemoSnapshot().orders.find((order) => order.guid === orderGuid) ?? null
    );
  }

  async searchMenu(
    _restaurantGuid: string,
    query: string,
    limit: number,
  ): Promise<MenuItemSummary[]> {
    const normalized = query.trim().toLocaleLowerCase();
    return createDemoSnapshot()
      .menuItems.filter((item) =>
        [item.name, item.groupName, item.menuName, item.sku ?? ''].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
      )
      .slice(0, limit);
  }

  async getInventory(
    _restaurantGuid: string,
    status?: string,
  ): Promise<InventoryItemSummary[]> {
    const inventory = createDemoSnapshot().inventory;
    return status ? inventory.filter((item) => item.status === status) : inventory;
  }

  async getOperationsOverview(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<OperationsOverview> {
    return buildOverview(this, restaurantGuid, startDate, endDate, signal);
  }
}

export class LiveToastDataSource implements ToastDataSource {
  readonly kind = 'live' as const;
  readonly defaultRestaurantGuid: string;
  private readonly menuCache = new Map<
    string,
    { expiresAt: number; items: MenuItemSummary[] }
  >();

  constructor(
    private readonly client: ToastClient,
    private readonly restaurantGuids: string[],
  ) {
    const firstGuid = restaurantGuids[0];
    if (!firstGuid) throw new Error('At least one restaurant GUID is required');
    this.defaultRestaurantGuid = firstGuid;
  }

  async listLocations(signal?: AbortSignal): Promise<LocationSummary[]> {
    return Promise.all(
      this.restaurantGuids.map(async (guid) =>
        normalizeLocation(await this.client.getRestaurant(guid, signal), guid),
      ),
    );
  }

  async findOrders(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<OrderSummary[]> {
    this.assertRestaurant(restaurantGuid);
    const raw = await this.client.findOrders(
      restaurantGuid,
      startDate,
      endDate,
      1,
      Math.min(100, limit),
      signal,
    );
    return compact(array(raw).map(normalizeOrder)).slice(0, limit);
  }

  async getOrder(
    restaurantGuid: string,
    orderGuid: string,
    signal?: AbortSignal,
  ): Promise<OrderSummary | null> {
    this.assertRestaurant(restaurantGuid);
    return normalizeOrder(await this.client.getOrder(restaurantGuid, orderGuid, signal)) ?? null;
  }

  async searchMenu(
    restaurantGuid: string,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<MenuItemSummary[]> {
    this.assertRestaurant(restaurantGuid);
    let cached = this.menuCache.get(restaurantGuid);
    if (!cached || cached.expiresAt < Date.now()) {
      const items = normalizeMenus(await this.client.getMenus(restaurantGuid, signal));
      cached = { items, expiresAt: Date.now() + 5 * 60_000 };
      this.menuCache.set(restaurantGuid, cached);
    }
    const normalized = query.trim().toLocaleLowerCase();
    return cached.items
      .filter((item) =>
        [item.name, item.groupName, item.menuName, item.sku ?? ''].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
      )
      .slice(0, limit);
  }

  async getInventory(
    restaurantGuid: string,
    status?: string,
    signal?: AbortSignal,
  ): Promise<InventoryItemSummary[]> {
    this.assertRestaurant(restaurantGuid);
    return normalizeInventory(
      await this.client.getInventory(restaurantGuid, status, signal),
    );
  }

  async getOperationsOverview(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<OperationsOverview> {
    this.assertRestaurant(restaurantGuid);
    return buildOverview(this, restaurantGuid, startDate, endDate, signal);
  }

  private assertRestaurant(restaurantGuid: string): void {
    if (!this.restaurantGuids.includes(restaurantGuid)) {
      throw new Error(`Restaurant is not configured: ${restaurantGuid}`);
    }
  }
}

export function createDataSource(config: AppConfig): ToastDataSource {
  if (config.mode === 'demo') return new DemoToastDataSource();
  if (!config.toast) throw new Error('Toast live configuration is missing');
  return new LiveToastDataSource(
    new ToastClient({
      accessUrl: config.toast.accessUrl,
      clientId: config.toast.clientId,
      clientSecret: config.toast.clientSecret,
    }),
    config.toast.restaurantGuids,
  );
}
