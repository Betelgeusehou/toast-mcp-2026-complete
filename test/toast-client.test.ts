import { describe, expect, it, vi } from 'vitest';
import { ToastClient } from '../src/clients/toast.js';

describe('ToastClient', () => {
  it('uses current nested auth, caches the token, and scopes location reads', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/authentication/v1/authentication/login')) {
        return new Response(
          JSON.stringify({
            token: {
              accessToken: 'test-access-token',
              expiresIn: 86_400,
              tokenType: 'bearer',
            },
            status: 'SUCCESS',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ guid: '11111111-1111-4111-8111-111111111111' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const client = new ToastClient({
      accessUrl: 'https://provisioned.example.test',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImpl,
    });
    const restaurantGuid = '11111111-1111-4111-8111-111111111111';

    await client.getRestaurant(restaurantGuid);
    await client.getRestaurant(restaurantGuid);

    expect(calls.filter((call) => call.url.includes('/authentication/'))).toHaveLength(1);
    const authBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(authBody).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      userAccessType: 'TOAST_MACHINE_CLIENT',
    });
    const locationCall = calls.find((call) => call.url.includes('/restaurants/v1/'));
    const headers = new Headers(locationCall?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-access-token');
    expect(headers.get('Toast-Restaurant-External-ID')).toBe(restaurantGuid);
  });
});
