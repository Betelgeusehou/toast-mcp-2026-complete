# Security policy

## Supported version

Security fixes target the latest Community Edition 2 beta on `main`. The archived `legacy/v1` implementation is retained for history and is not supported.

## Reporting a vulnerability

Do not open a public issue containing credentials, restaurant data, guest information, payment data, or a working exploit. Use GitHub's private vulnerability reporting for this repository when available. If it is unavailable, open a minimal issue asking the maintainer to enable a private reporting channel; do not include the sensitive details.

Include the affected commit, impact, reproduction conditions, and a suggested mitigation if known. Redact access URLs, tokens, client IDs, client secrets, restaurant GUIDs, Toast request IDs tied to customer incidents, and all customer data.

## Deployment boundaries

- Demo mode is the only mode verified without external Toast access.
- Live credentials must come from Toast and should remain in customer-controlled infrastructure.
- Live Streamable HTTP transport is restricted to loopback until inbound MCP authorization is implemented.
- Public demo deployments must set explicit Host and Origin allowlists and should add transport authentication at the edge.
- Never commit `.env` files or send credentials in GitHub issues, logs, prompts, or screenshots.
- Use a dedicated least-privilege Toast API account and only the scopes required by enabled tools.
- Treat order payloads and Analytics guest-payment data as sensitive even when this server minimizes them.

## Current intentional limitations

The active server exposes read-only tools. Write endpoints, webhook receivers, public live hosting, and Analytics guest-payment tools remain disabled until they have explicit authorization, audit, idempotency, signature-verification, and data-retention designs.
