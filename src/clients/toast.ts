import { z } from 'zod';

export interface ToastClientConfig {
  accessUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RequestOptions {
  restaurantGuid?: string | undefined;
  query?: Record<string, string | number | undefined> | undefined;
  signal?: AbortSignal | undefined;
}

const LoginResponseSchema = z.looseObject({
  token: z.looseObject({
    accessToken: z.string().min(1),
    expiresIn: z.number().positive(),
  }),
});

export class ToastApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ToastApiError';
  }
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Request aborted'));
      },
      { once: true },
    );
  });
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(4_000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
}

async function safeErrorMessage(response: Response): Promise<string> {
  const fallback = `Toast API request failed with HTTP ${response.status}`;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const candidate = body.message ?? body.error ?? body.code;
    return typeof candidate === 'string' ? `${fallback}: ${candidate}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Minimal read-only client for the current public Toast contracts.
 * The provisioned API Access URL is configuration; Toast does not publish a
 * universal production hostname for integrations.
 */
export class ToastClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private accessToken: string | undefined;
  private accessTokenExpiresAt = 0;
  private tokenPromise: Promise<string> | undefined;
  private pacingQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(private readonly config: ToastClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  async getRestaurant(restaurantGuid: string, signal?: AbortSignal): Promise<unknown> {
    return this.get(
      `/restaurants/v1/restaurants/${encodeURIComponent(restaurantGuid)}`,
      { restaurantGuid, signal },
    );
  }

  async findOrders(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    page = 1,
    pageSize = 100,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.get('/orders/v2/ordersBulk', {
      restaurantGuid,
      query: { startDate, endDate, page, pageSize },
      signal,
    });
  }

  async getOrder(
    restaurantGuid: string,
    orderGuid: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.get(`/orders/v2/orders/${encodeURIComponent(orderGuid)}`, {
      restaurantGuid,
      signal,
    });
  }

  async getMenus(restaurantGuid: string, signal?: AbortSignal): Promise<unknown> {
    return this.get('/menus/v2/menus', { restaurantGuid, signal });
  }

  async getMenuMetadata(
    restaurantGuid: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.get('/menus/v2/metadata', { restaurantGuid, signal });
  }

  async getInventory(
    restaurantGuid: string,
    status?: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.get('/stock/v1/inventory', {
      restaurantGuid,
      query: { status },
      signal,
    });
  }

  private async get(path: string, options: RequestOptions): Promise<unknown> {
    const url = new URL(`${this.config.accessUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.pace(path, options.signal);
      const token = await this.getAccessToken(options.signal);
      const headers = new Headers({
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      });
      if (options.restaurantGuid) {
        headers.set('Toast-Restaurant-External-ID', options.restaurantGuid);
      }

      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: combinedSignal(options.signal, this.timeoutMs),
      });

      if (response.status === 401 && attempt === 0) {
        this.clearToken();
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await abortableDelay(retryDelay(response, attempt), options.signal);
        continue;
      }
      if (!response.ok) {
        throw new ToastApiError(
          await safeErrorMessage(response),
          response.status,
          response.headers.get('toast-request-id') ??
            response.headers.get('x-request-id') ??
            undefined,
        );
      }
      if (response.status === 204) return null;
      return response.json() as Promise<unknown>;
    }

    throw new ToastApiError('Toast API request failed after retries', 503);
  }

  private async getAccessToken(signal?: AbortSignal): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 5 * 60_000) {
      return this.accessToken;
    }
    if (!this.tokenPromise) {
      this.tokenPromise = this.login(signal).finally(() => {
        this.tokenPromise = undefined;
      });
    }
    return this.tokenPromise;
  }

  private async login(signal?: AbortSignal): Promise<string> {
    const response = await this.fetchImpl(
      `${this.config.accessUrl}/authentication/v1/authentication/login`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
          userAccessType: 'TOAST_MACHINE_CLIENT',
        }),
        signal: combinedSignal(signal, this.timeoutMs),
      },
    );
    if (!response.ok) {
      throw new ToastApiError(
        await safeErrorMessage(response),
        response.status,
        response.headers.get('toast-request-id') ?? undefined,
      );
    }
    const parsed = LoginResponseSchema.parse(await response.json());
    this.accessToken = parsed.token.accessToken;
    this.accessTokenExpiresAt = Date.now() + parsed.token.expiresIn * 1_000;
    return this.accessToken;
  }

  private clearToken(): void {
    this.accessToken = undefined;
    this.accessTokenExpiresAt = 0;
  }

  private async pace(path: string, signal?: AbortSignal): Promise<void> {
    const minimumInterval =
      path === '/menus/v2/menus' ? 1_000 : path.includes('ordersBulk') ? 200 : 50;
    const turn = this.pacingQueue.then(async () => {
      const delay = Math.max(0, this.nextRequestAt - Date.now());
      await abortableDelay(delay, signal);
      this.nextRequestAt = Date.now() + minimumInterval;
    });
    this.pacingQueue = turn.catch(() => undefined);
    await turn;
  }
}
