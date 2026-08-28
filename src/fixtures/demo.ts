import type {
  InventoryItemSummary,
  LocationSummary,
  MenuItemSummary,
  OrderSummary,
} from '../types/index.js';

export const DEMO_RESTAURANT_GUID =
  '11111111-1111-4111-8111-111111111111';

export interface DemoSnapshot {
  locations: LocationSummary[];
  orders: OrderSummary[];
  menuItems: MenuItemSummary[];
  inventory: InventoryItemSummary[];
}

function hoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString();
}

export function createDemoSnapshot(now: Date = new Date()): DemoSnapshot {
  return {
    locations: [
      {
        guid: DEMO_RESTAURANT_GUID,
        name: 'Harbor & Hearth (Demo)',
        locationName: 'Downtown',
        timeZone: 'America/New_York',
        currencyCode: 'USD',
      },
    ],
    orders: [
      {
        guid: '22222222-2222-4222-8222-222222222221',
        displayNumber: '1042',
        openedDate: hoursAgo(now, 1.1),
        modifiedDate: hoursAgo(now, 0.8),
        status: 'CLOSED',
        totalAmount: 58.75,
        taxAmount: 4.35,
        voided: false,
        items: [
          { name: 'Smash Burger', quantity: 2 },
          { name: 'Truffle Fries', quantity: 1 },
        ],
      },
      {
        guid: '22222222-2222-4222-8222-222222222222',
        displayNumber: '1043',
        openedDate: hoursAgo(now, 0.7),
        modifiedDate: hoursAgo(now, 0.3),
        status: 'CLOSED',
        totalAmount: 42.5,
        taxAmount: 3.15,
        voided: false,
        items: [
          { name: 'Crispy Chicken Bowl', quantity: 1 },
          { name: 'Cold Brew', quantity: 2 },
        ],
      },
      {
        guid: '22222222-2222-4222-8222-222222222223',
        displayNumber: '1044',
        openedDate: hoursAgo(now, 0.25),
        modifiedDate: hoursAgo(now, 0.1),
        status: 'OPEN',
        totalAmount: 31.25,
        taxAmount: 2.31,
        voided: false,
        items: [
          { name: 'Smash Burger', quantity: 1 },
          { name: 'Sparkling Lemonade', quantity: 1 },
        ],
      },
      {
        guid: '22222222-2222-4222-8222-222222222224',
        displayNumber: '1041',
        openedDate: hoursAgo(now, 2.2),
        modifiedDate: hoursAgo(now, 2),
        status: 'VOIDED',
        totalAmount: 18,
        taxAmount: 1.33,
        voided: true,
        items: [{ name: 'Market Salad', quantity: 1 }],
      },
    ],
    menuItems: [
      {
        guid: '33333333-3333-4333-8333-333333333331',
        name: 'Smash Burger',
        groupName: 'Mains',
        menuName: 'All Day',
        price: 17.5,
        sku: 'BURGER-01',
      },
      {
        guid: '33333333-3333-4333-8333-333333333332',
        name: 'Crispy Chicken Bowl',
        groupName: 'Mains',
        menuName: 'All Day',
        price: 16,
        sku: 'BOWL-02',
      },
      {
        guid: '33333333-3333-4333-8333-333333333333',
        name: 'Market Salad',
        groupName: 'Mains',
        menuName: 'All Day',
        price: 14.5,
        sku: 'SALAD-01',
      },
      {
        guid: '33333333-3333-4333-8333-333333333334',
        name: 'Truffle Fries',
        groupName: 'Sides',
        menuName: 'All Day',
        price: 8.5,
        sku: 'SIDE-03',
      },
      {
        guid: '33333333-3333-4333-8333-333333333335',
        name: 'Cold Brew',
        groupName: 'Drinks',
        menuName: 'All Day',
        price: 5.25,
        sku: 'DRINK-07',
      },
      {
        guid: '33333333-3333-4333-8333-333333333336',
        name: 'Sparkling Lemonade',
        groupName: 'Drinks',
        menuName: 'All Day',
        price: 6,
        sku: 'DRINK-08',
      },
    ],
    inventory: [
      {
        guid: '33333333-3333-4333-8333-333333333331',
        status: 'IN_STOCK',
        quantity: 42,
        multiLocationId: null,
      },
      {
        guid: '33333333-3333-4333-8333-333333333334',
        status: 'QUANTITY',
        quantity: 6,
        multiLocationId: null,
      },
      {
        guid: '33333333-3333-4333-8333-333333333336',
        status: 'OUT_OF_STOCK',
        quantity: 0,
        multiLocationId: null,
      },
    ],
  };
}
