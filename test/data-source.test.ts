import { describe, expect, it } from 'vitest';
import { DemoToastDataSource } from '../src/data-source.js';

describe('DemoToastDataSource', () => {
  it('returns useful synthetic data and labels it as demo at the tool layer', async () => {
    const source = new DemoToastDataSource();
    const locations = await source.listLocations();
    const items = await source.searchMenu(
      source.defaultRestaurantGuid,
      'burger',
      10,
    );
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1_000);
    const overview = await source.getOperationsOverview(
      source.defaultRestaurantGuid,
      start.toISOString(),
      end.toISOString(),
    );

    expect(locations[0]?.name).toContain('(Demo)');
    expect(items[0]?.name).toBe('Smash Burger');
    expect(overview.metrics.orderCount).toBeGreaterThan(0);
    expect(overview.metrics.grossSales).toBeGreaterThan(0);
    expect(overview.topItems[0]?.name).toBe('Smash Burger');
  });
});
