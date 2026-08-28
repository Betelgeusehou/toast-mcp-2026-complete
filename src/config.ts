export type ToastMcpMode = 'demo' | 'live';
export type ToastMcpTransport = 'stdio' | 'http';

export interface AppConfig {
  mode: ToastMcpMode;
  transport: ToastMcpTransport;
  host: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  toast?: {
    accessUrl: string;
    clientId: string;
    clientSecret: string;
    restaurantGuids: string[];
  };
}

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function enumValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  const selected = value ?? fallback;
  if (!allowed.includes(selected as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return selected as T;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? '3000');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('TOAST_MCP_PORT must be an integer between 1 and 65535');
  }
  return parsed;
}

function validateAccessUrl(value: string): string {
  const url = new URL(value);
  const localHttp =
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('TOAST_API_ACCESS_URL must use HTTPS');
  }
  return value.replace(/\/$/, '');
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const mode = enumValue(
    env.TOAST_MCP_MODE,
    ['demo', 'live'] as const,
    'demo',
    'TOAST_MCP_MODE',
  );
  const transport = enumValue(
    env.TOAST_MCP_TRANSPORT,
    ['stdio', 'http'] as const,
    'stdio',
    'TOAST_MCP_TRANSPORT',
  );
  const host = env.TOAST_MCP_HOST?.trim() || '127.0.0.1';
  const allowedHosts = list(env.TOAST_MCP_ALLOWED_HOSTS);
  const allowedOrigins = list(env.TOAST_MCP_ALLOWED_ORIGINS);

  if (
    transport === 'http' &&
    host !== '127.0.0.1' &&
    host !== 'localhost' &&
    (allowedHosts.length === 0 || allowedOrigins.length === 0)
  ) {
    throw new Error(
      'Public HTTP deployments require TOAST_MCP_ALLOWED_HOSTS and TOAST_MCP_ALLOWED_ORIGINS',
    );
  }

  const base: AppConfig = {
    mode,
    transport,
    host,
    port: parsePort(env.TOAST_MCP_PORT),
    allowedHosts,
    allowedOrigins,
  };

  if (mode === 'demo') {
    return base;
  }

  if (
    transport === 'http' &&
    host !== '127.0.0.1' &&
    host !== 'localhost'
  ) {
    throw new Error(
      'Live HTTP mode is restricted to loopback until inbound MCP authentication is configured',
    );
  }

  const accessUrl = env.TOAST_API_ACCESS_URL?.trim();
  const clientId = env.TOAST_CLIENT_ID?.trim();
  const clientSecret = env.TOAST_CLIENT_SECRET?.trim();
  const restaurantGuids = list(
    env.TOAST_RESTAURANT_GUIDS ?? env.TOAST_RESTAURANT_GUID,
  );

  const missing = [
    !accessUrl && 'TOAST_API_ACCESS_URL',
    !clientId && 'TOAST_CLIENT_ID',
    !clientSecret && 'TOAST_CLIENT_SECRET',
    restaurantGuids.length === 0 &&
      'TOAST_RESTAURANT_GUIDS (or TOAST_RESTAURANT_GUID)',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Live mode is missing: ${missing.join(', ')}`);
  }

  for (const restaurantGuid of restaurantGuids) {
    if (!GUID_PATTERN.test(restaurantGuid)) {
      throw new Error(`Invalid Toast restaurant GUID: ${restaurantGuid}`);
    }
  }

  return {
    ...base,
    toast: {
      accessUrl: validateAccessUrl(accessUrl as string),
      clientId: clientId as string,
      clientSecret: clientSecret as string,
      restaurantGuids,
    },
  };
}
