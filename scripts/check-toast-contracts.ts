import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

interface ContractEntry {
  name: string;
  url: string;
  specVersion: string;
  sha256: string;
}

interface Manifest {
  checkedAt: string;
  contracts: ContractEntry[];
}

const manifest = JSON.parse(
  await readFile(new URL('../contracts/toast-api-manifest.json', import.meta.url), 'utf8'),
) as Manifest;

let drifted = false;
for (const contract of manifest.contracts) {
  const response = await fetch(contract.url, {
    headers: { 'user-agent': 'toast-mcp-community-contract-check/2.0' },
  });
  if (!response.ok) {
    console.error(`${contract.name}: HTTP ${response.status}`);
    drifted = true;
    continue;
  }
  const body = await response.text();
  const parsed = parse(body) as {
    info?: { version?: string };
  };
  const sha256 = createHash('sha256').update(body).digest('hex');
  const version = parsed.info?.version ?? 'unknown';
  const matches = version === contract.specVersion && sha256 === contract.sha256;
  console.log(
    `${matches ? 'OK' : 'DRIFT'} ${contract.name} ${version} ${sha256.slice(0, 12)}`,
  );
  if (!matches) drifted = true;
}

if (drifted) {
  console.error(
    `Toast contract drift detected against the ${manifest.checkedAt} manifest. Review upstream changes before updating hashes.`,
  );
  process.exitCode = 1;
}
