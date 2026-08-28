import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to a credential-free demo stdio server', () => {
    const config = loadConfig({});
    expect(config.mode).toBe('demo');
    expect(config.transport).toBe('stdio');
    expect(config.toast).toBeUndefined();
  });

  it('rejects incomplete live configuration without echoing secrets', () => {
    expect(() =>
      loadConfig({
        TOAST_MCP_MODE: 'live',
        TOAST_CLIENT_SECRET: 'never-print-this',
      }),
    ).toThrow('Live mode is missing');
    try {
      loadConfig({
        TOAST_MCP_MODE: 'live',
        TOAST_CLIENT_SECRET: 'never-print-this',
      });
    } catch (error) {
      expect(String(error)).not.toContain('never-print-this');
    }
  });

  it('restricts unauthenticated live HTTP mode to loopback', () => {
    expect(() =>
      loadConfig({
        TOAST_MCP_MODE: 'live',
        TOAST_MCP_TRANSPORT: 'http',
        TOAST_MCP_HOST: '0.0.0.0',
        TOAST_MCP_ALLOWED_HOSTS: 'example.com',
        TOAST_MCP_ALLOWED_ORIGINS: 'example.com',
      }),
    ).toThrow('restricted to loopback');
  });
});
