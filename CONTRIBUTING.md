# Contributing

Thank you for helping make the Toast MCP Community Edition accurate and useful.

## Before opening a change

1. Confirm the operation in Toast's official API reference or developer guide.
2. Search existing issues and pull requests.
3. State whether your evidence is contract-only, demo-tested, sandbox-tested, or production-observed.
4. Remove credentials, restaurant identifiers, guest information, payment data, and proprietary payloads.

## Local checks

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run package:check
```

`npm run contract:check` accesses Toast's public specification files and requires network access.

## Adding an API tool

Every proposed tool should include:

- the official API family, operation, specification version, and documentation link;
- required Toast scope and eligible integration types;
- location or management-group context;
- endpoint-specific pagination and rate-limit behavior;
- a PII and payment-data classification;
- synthetic demo fixtures;
- structured output plus text fallback;
- unit and MCP protocol tests;
- behavior for unknown fields and enum values;
- an honest verification state.

Read tools must declare MCP read-only annotations. Write tools are out of scope until the project has approval UX, stable external-ID rules, idempotency, audit receipts, read-back verification, and a documented rollback strategy.

## Updating Toast contracts

Do not update a version or hash merely to make the scheduled job green. Review the upstream diff, classify the change, update normalizers and tests when needed, then update `contracts/toast-api-manifest.json` with the new official response hash and check date.

The official set contains Swagger 2.0 and OpenAPI 3.0.x documents. Preserve the declared schema dialect.

## Live validation

Live validation is especially valuable, but never submit credentials or raw customer payloads. Share a redacted description of:

- integration type and relevant scopes;
- sandbox or production environment;
- endpoint, status code, and non-sensitive headers;
- observed pagination, rate limiting, or error behavior;
- whether the result agrees with the pinned contract.

Production observations should not be presented as a universal contract unless Toast's official documentation also supports them.
