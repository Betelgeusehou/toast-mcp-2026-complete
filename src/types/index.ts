import { z } from 'zod';

export type DataSourceKind = 'demo' | 'live';
export type VerificationState =
  | 'demo_verified'
  | 'contract_verified_live_unverified';

export interface ResultContext {
  dataSource: DataSourceKind;
  verificationState: VerificationState;
  generatedAt: string;
}

export interface LocationSummary {
  guid: string;
  name: string;
  locationName?: string;
  timeZone?: string;
  currencyCode?: string;
}

export interface OrderItemSummary {
  name: string;
  quantity: number;
}

export interface OrderSummary {
  guid: string;
  displayNumber: string;
  openedDate: string;
  modifiedDate?: string;
  status: string;
  totalAmount: number;
  taxAmount: number;
  voided: boolean;
  items: OrderItemSummary[];
}

export interface MenuItemSummary {
  guid: string;
  name: string;
  groupName: string;
  menuName: string;
  price: number | null;
  sku: string | null;
}

export interface InventoryItemSummary {
  guid: string;
  status: string;
  quantity: number | null;
  multiLocationId: string | null;
}

export interface TopItem {
  name: string;
  quantity: number;
}

export interface OperationsOverview {
  location: LocationSummary;
  period: { startDate: string; endDate: string };
  metrics: {
    orderCount: number;
    grossSales: number;
    averageCheck: number;
    openChecks: number;
    inventoryRisks: number;
  };
  topItems: TopItem[];
  inventory: InventoryItemSummary[];
  recentOrders: OrderSummary[];
}

export const DataSourceKindSchema = z.enum([
  'demo',
  'live',
]);
export const VerificationStateSchema = z.enum([
  'demo_verified',
  'contract_verified_live_unverified',
]);
export const ResultContextSchema = z.object({
  dataSource: DataSourceKindSchema,
  verificationState: VerificationStateSchema,
  generatedAt: z.string(),
});
export const LocationSummarySchema = z.object({
  guid: z.string(),
  name: z.string(),
  locationName: z.string().optional(),
  timeZone: z.string().optional(),
  currencyCode: z.string().optional(),
});
export const OrderItemSummarySchema = z.object({
  name: z.string(),
  quantity: z.number(),
});
export const OrderSummarySchema = z.object({
  guid: z.string(),
  displayNumber: z.string(),
  openedDate: z.string(),
  modifiedDate: z.string().optional(),
  status: z.string(),
  totalAmount: z.number(),
  taxAmount: z.number(),
  voided: z.boolean(),
  items: z.array(OrderItemSummarySchema),
});
export const MenuItemSummarySchema = z.object({
  guid: z.string(),
  name: z.string(),
  groupName: z.string(),
  menuName: z.string(),
  price: z.number().nullable(),
  sku: z.string().nullable(),
});
export const InventoryItemSummarySchema = z.object({
  guid: z.string(),
  status: z.string(),
  quantity: z.number().nullable(),
  multiLocationId: z.string().nullable(),
});
export const TopItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
});
export const OperationsOverviewSchema = z.object({
  location: LocationSummarySchema,
  period: z.object({ startDate: z.string(), endDate: z.string() }),
  metrics: z.object({
    orderCount: z.number().int().nonnegative(),
    grossSales: z.number().nonnegative(),
    averageCheck: z.number().nonnegative(),
    openChecks: z.number().int().nonnegative(),
    inventoryRisks: z.number().int().nonnegative(),
  }),
  topItems: z.array(TopItemSchema),
  inventory: z.array(InventoryItemSummarySchema),
  recentOrders: z.array(OrderSummarySchema),
});

export function resultContext(
  dataSource: DataSourceKind,
  now: Date = new Date(),
): ResultContext {
  return {
    dataSource,
    verificationState:
      dataSource === 'demo'
        ? 'demo_verified'
        : 'contract_verified_live_unverified',
    generatedAt: now.toISOString(),
  };
}
