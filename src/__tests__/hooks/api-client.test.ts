import { beforeEach, describe, expect, it } from 'vitest';

import {
  configureApiClient,
  getApiClientOptions,
  hasConfiguredApiAuthorization,
} from '../../hooks/api-client.js';

describe('api-client auth configuration', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: undefined, headers: undefined });
  });

  it('does not report authorization by default', () => {
    expect(hasConfiguredApiAuthorization()).toBe(false);
    expect(getApiClientOptions()).toEqual({
      baseUrl: undefined,
      headers: undefined,
    });
  });

  it('detects an explicitly configured Authorization header', () => {
    configureApiClient({
      headers: {
        Authorization: 'Bearer secure-token',
      },
    });

    expect(hasConfiguredApiAuthorization()).toBe(true);
    expect(getApiClientOptions().headers).toEqual({
      Authorization: 'Bearer secure-token',
    });
  });
});
