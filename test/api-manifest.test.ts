import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface Contract {
  name: string;
  url: string;
  basePath: string;
  specVersion: string;
  schemaDialect: string;
  implementationStatus: string;
  sha256: string;
}

describe('Toast API manifest', () => {
  it('catalogs the complete current Toast-hosted public API surface', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL('../contracts/toast-api-manifest.json', import.meta.url),
        'utf8',
      ),
    ) as { checkedAt: string; contracts: Contract[] };

    expect(manifest.checkedAt).toBe('2026-08-28');
    expect(manifest.contracts).toHaveLength(17);
    expect(new Set(manifest.contracts.map(({ name }) => name)).size).toBe(17);
    expect(manifest.contracts.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'Analytics',
        'Credit Cards',
        'Device Details',
        'Menus V3',
        'Packaging',
        'Restaurant Availability',
      ]),
    );
    for (const contract of manifest.contracts) {
      expect(contract.url).toMatch(/^https:\/\/doc\.toasttab\.com\//);
      expect(contract.basePath).toMatch(/^\//);
      expect(contract.specVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(contract.schemaDialect).toMatch(/^(Swagger 2\.0|OpenAPI 3\.0\.[13])$/);
      expect(contract.implementationStatus).toBeTruthy();
      expect(contract.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
