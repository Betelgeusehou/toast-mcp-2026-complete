# Toast MCP Community Edition

[![CI](https://github.com/BusyBee3333/toast-mcp-2026-complete/actions/workflows/ci.yml/badge.svg)](https://github.com/BusyBee3333/toast-mcp-2026-complete/actions/workflows/ci.yml)
[![Toast contract drift](https://github.com/BusyBee3333/toast-mcp-2026-complete/actions/workflows/toast-contract-drift.yml/badge.svg)](https://github.com/BusyBee3333/toast-mcp-2026-complete/actions/workflows/toast-contract-drift.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An unofficial, read-only Model Context Protocol server for exploring Toast restaurant operations. It runs immediately with realistic synthetic data, provides a modern MCP App dashboard, and can use customer-supplied Toast credentials when they are available.

> **Current status: public beta.** Demo behavior and official API contracts are verified. Live Toast behavior is not maintainer-verified because this project does not yet have Toast sandbox or production access. The server reports that boundary in every tool response instead of presenting contract coverage as live certification.

This repository is not affiliated with or endorsed by Toast, Inc. Toast is a trademark of its respective owner.

## Why this edition exists

The original repository advertised dozens of write tools against API shapes that no longer matched Toast's published contracts. Community Edition 2 preserves that work in [`legacy/v1`](legacy/v1) and replaces the active server with a smaller, supportable foundation:

- safe demo mode with no account or credentials required;
- eight focused, read-only MCP tools;
- privacy-minimized order output with guest and card data excluded;
- an interactive MCP App operations overview;
- current MCP server and app SDKs with structured tool output;
- configurable Toast-provisioned access URLs and current machine-client authentication;
- token reuse, endpoint pacing, retry handling, and `Retry-After` support;
- a pinned catalog of all 17 current Toast-hosted public API families;
- weekly automated drift checks against Toast's official OpenAPI files.

## Try it without Toast access

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/BusyBee3333/toast-mcp-2026-complete.git
cd toast-mcp-2026-complete
npm ci
npm run build
```

Demo mode is the default:

```bash
npm start
```

To connect a desktop MCP client, point it at the built entry point. Replace the path below with the absolute path to your clone:

```json
{
  "mcpServers": {
    "toast-community": {
      "command": "node",
      "args": ["/absolute/path/to/toast-mcp-2026-complete/dist/src/main.js"],
      "env": {
        "TOAST_MCP_MODE": "demo"
      }
    }
  }
}
```

For local Streamable HTTP transport:

```bash
TOAST_MCP_TRANSPORT=http npm start
curl http://127.0.0.1:3000/health
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`. HTTP binds to loopback by default.

## Tools

| Tool | Purpose |
| --- | --- |
| `toast_get_verification_status` | States whether data is synthetic or live and what has actually been verified. |
| `toast_get_api_coverage` | Lists all current Toast-hosted API families and their implementation status. |
| `toast_list_locations` | Lists the explicitly configured restaurant locations. |
| `toast_find_orders` | Returns privacy-minimized orders for an ISO 8601 range of up to 31 days. |
| `toast_get_order` | Gets a privacy-minimized order summary by Toast GUID. |
| `toast_search_menu` | Searches resolved Menus V2 items, groups, names, PLUs, and SKUs. |
| `toast_get_inventory` | Reads current Stock API inventory risks and preserves unknown status values. |
| `toast_show_operations_overview` | Returns metrics and an interactive MCP App operations dashboard. |

Every successful tool returns both `structuredContent` and a text fallback. Each payload includes:

- `dataSource`: `demo` or `live`;
- `verificationState`: `demo_verified` or `contract_verified_live_unverified`;
- `generatedAt`: an ISO 8601 timestamp.

## Live mode: bring your own Toast access

Toast does not publish one universal production or sandbox hostname. Toast provisions an API Access URL and credentials for an approved integration or eligible customer account. Do not infer or hard-code an unofficial hostname.

```bash
export TOAST_MCP_MODE=live
export TOAST_API_ACCESS_URL="https://your-toast-provisioned-access-url"
export TOAST_CLIENT_ID="..."
export TOAST_CLIENT_SECRET="..."
export TOAST_RESTAURANT_GUIDS="location-guid-1,location-guid-2"
npm start
```

The server sends the current login request to:

```text
{TOAST_API_ACCESS_URL}/authentication/v1/authentication/login
```

It reads `token.accessToken` and `token.expiresIn`, shares one cached token across configured locations, refreshes it with single-flight protection, and sends `Toast-Restaurant-External-ID` on location-scoped calls.

Live HTTP mode is intentionally restricted to loopback until the project has an inbound MCP authorization design. Credentials are read from environment variables, are never returned to the model, and should be supplied through your own secret manager in production.

### Toast access paths

- **Standard API access:** self-service, production-only, read-only, and limited to eligible restaurant accounts. Standard access uses Menus V2, not Menus V3.
- **Partner or custom integration:** Toast-provisioned scopes, sandbox access, certification, and production approval.
- **Analytics API access:** separate credentials and eligibility. It is not assumed to share the operational API account.

Customers should run live mode inside infrastructure they control. The maintainer does not need to collect customer client secrets to demonstrate or support this project.

## Official Toast API coverage

The catalog below was checked against Toast's official OpenAPI responses on **August 28, 2026**. Versions are `info.version` values, which are separate from URL versions.

| API family | Base path | Spec | Community Edition status |
| --- | --- | ---: | --- |
| Authentication | `/authentication/v1` | 1.0.0 | Implemented infrastructure |
| Orders | `/orders/v2` | 2.9.5 | Implemented read subset |
| Menus V2 | `/menus/v2` | 2.4.1 | Implemented read subset |
| Restaurants | `/restaurants/v1` | 1.0.0 | Implemented read subset |
| Stock | `/stock/v1` | 1.0.0 | Implemented read subset |
| Partners | `/partners/v1` | 1.0.2 | Catalog only; scope-aware discovery is next |
| Analytics | `/era/v1` | 1.0.0 | Catalog only; requires separate access |
| Cash Management | `/cashmgmt/v1` | 1.1.0 | Catalog only |
| Configuration | `/config/v2` | 2.5.0 | Catalog only |
| Credit Cards | `/ccpartner/v1` | 1.0.0 | Catalog only; partner write surface |
| Device Details | `/device-details/v1` | 1.0.0 | Catalog only |
| Kitchen | `/kitchen/v1` | 1.0.2 | Catalog only |
| Labor | `/labor/v1` | 1.9.0 | Catalog only |
| Menus V3 | `/menus/v3` | 3.4.1 | Catalog only; ordering partners only |
| Order Management Configuration | `/ordermgmt-config/v1` | 1.0.1 | Catalog only |
| Packaging | `/packaging/v1` | 1.0.0 | Catalog only |
| Restaurant Availability | `/restaurant-availability/v1` | 1.0.1 | Catalog only |

`catalog only` means the official contract is tracked and drift-checked; it does **not** mean the API has an exposed MCP tool or has been tested with live Toast data.

Menus V3 is not a blanket replacement for Menus V2. Toast directs ordering partners to V3, while non-ordering and Standard API integrations should continue using V2. The server will only activate V3 for the appropriate integration type and granted scope.

Toast's gift card, loyalty, and tender specifications are outbound integration contracts hosted by the integrator. They are not Toast-hosted REST APIs that this MCP can simply call, so they are intentionally excluded from the 17-family count.

### August 2026 update check

Toast's public developer update feed currently lists one August 2026 API change: on August 11, Analytics guest-payment results added `cardLast4Digits`, `cardType`, and `paymentAccountReference`. This server catalogs Analytics but does not expose guest-payment reporting because it requires separate access and includes sensitive payment-related data.

Other recently introduced surfaces are still included: Device Details became generally available July 7, and Kitchen item-fulfillment export was announced June 30. The manifest tracks the complete current reference surface rather than only entries dated in August.

Toast changed its compatibility policy on July 20, 2026 so adding enum values is no longer considered breaking. Live response normalization therefore preserves unknown fields and enum values instead of rejecting them.

## Safety and data handling

- All active tools are read-only and declare MCP read-only annotations.
- Order summaries exclude guest identity, contact, delivery, and payment-card fields.
- No customer or card data is stored by this server.
- Synthetic demo records are visibly labeled and cannot be confused with a live restaurant.
- Toast request IDs are retained in normalized errors for support, but credentials are not logged.
- Only safe GET requests are retried; write APIs are not exposed.
- Host and Origin validation protect local HTTP mode from basic DNS-rebinding and cross-origin requests.
- Public live HTTP deployment is refused until inbound MCP authentication is configured.

See [SECURITY.md](SECURITY.md) for reporting and deployment guidance.

## Contract and quality gates

```bash
npm run typecheck
npm test
npm run build
npm run contract:check
npm run package:check
```

The pinned manifest is [`contracts/toast-api-manifest.json`](contracts/toast-api-manifest.json). A scheduled GitHub workflow downloads each official specification, checks its version and SHA-256 hash, and opens an actionable failure when Toast changes a contract. Hash changes are never accepted automatically.

The official specifications mix Swagger 2.0 with OpenAPI 3.0.x. Packaging is OpenAPI 3.0.3 and Stock is OpenAPI 3.0.1; the remainder are currently Swagger 2.0. Future code generation must normalize those dialects rather than assuming one schema format.

## What still requires Toast access

No amount of public-contract work can replace these gates:

- validate authentication, response shapes, pagination headers, and rate-limit headers in Toast sandbox;
- confirm exact scopes returned for real connected restaurants;
- certify Menus V3 behavior with an ordering-partner account;
- validate Analytics job creation, polling, and seven-day report expiry with separate credentials;
- exercise webhooks, signature verification, retry behavior, and large payload handling;
- pass Toast's partner review, security review, certification, and production approval where applicable.

Until those gates are completed, the accurate release label is **contract-verified and live-unverified**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contribution is live validation from someone with legitimate Toast sandbox or production access who can share redacted behavior, never credentials or restaurant data.

When proposing a new tool, include the official operation, required scope, integration type, pagination behavior, rate limit, PII classification, demo fixture, tests, and read/write risk. Write tools will require a separate approval and audit design.

## Primary sources

- [Toast API reference](https://doc.toasttab.com/openapi/)
- [Toast developer updates](https://api-updates.toasttab.com/)
- [Authentication guide](https://doc.toasttab.com/doc/devguide/authentication.html)
- [API environments](https://doc.toasttab.com/doc/devguide/apiEnvironments.html)
- [API integration types](https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html)
- [API scopes](https://doc.toasttab.com/doc/devguide/apiScopes.html)
- [Menus V2 and V3 comparison](https://doc.toasttab.com/doc/devguide/apiComparingMenusAPIV2AndV3.html)
- [Rate limiting](https://doc.toasttab.com/doc/devguide/apiRateLimiting.html)
- [Pagination](https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html)
- [Deprecations](https://doc.toasttab.com/doc/devguide/apiDeprecatedApiFunctions.html)

## License

MIT. See [LICENSE](LICENSE).
