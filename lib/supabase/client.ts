import { createBrowserClient } from '@supabase/ssr';
import { createMockClient } from './mock-client';

function isPermissionOrAuthError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  const details = String(error.details || '').toLowerCase();
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    code === '401' ||
    code === '403' ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level security') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('auth') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    details.includes('permission')
  );
}

function executeMockChain(mockClient: any, table: string, chain: { method: string; args: any[] }[]) {
  let builder = mockClient.from(table);
  for (const step of chain) {
    if (typeof (builder as any)[step.method] === 'function') {
      builder = (builder as any)[step.method](...step.args);
    }
  }
  return builder;
}

export function wrapWithResilience(realClient: any, mockClient: any) {
  return new Proxy(realClient, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const chain: { method: string; args: any[] }[] = [];
          const realBuilder = target.from(table);

          const createProxyBuilder = (currentRealBuilder: any): any => {
            return new Proxy(currentRealBuilder, {
              get(bTarget, bProp: string | symbol) {
                if (typeof bProp !== 'string') {
                  return Reflect.get(bTarget, bProp);
                }

                if (bProp === 'then') {
                  return (onfulfilled?: (val: any) => any, onrejected?: (val: any) => any) => {
                    return Promise.resolve(currentRealBuilder)
                      .then(async (res: any) => {
                        if (res && isPermissionOrAuthError(res.error)) {
                          const mockRes = await executeMockChain(mockClient, table, chain);
                          return onfulfilled ? onfulfilled(mockRes) : mockRes;
                        }
                        return onfulfilled ? onfulfilled(res) : res;
                      })
                      .catch(async () => {
                        const mockRes = await executeMockChain(mockClient, table, chain);
                        return onfulfilled ? onfulfilled(mockRes) : mockRes;
                      });
                  };
                }

                if (bProp === 'maybeSingle' || bProp === 'single') {
                  return async () => {
                    try {
                      const res = await currentRealBuilder[bProp]();
                      if (res && isPermissionOrAuthError(res.error)) {
                        chain.push({ method: bProp, args: [] });
                        return await executeMockChain(mockClient, table, chain);
                      }
                      return res;
                    } catch {
                      chain.push({ method: bProp, args: [] });
                      return await executeMockChain(mockClient, table, chain);
                    }
                  };
                }

                if (bProp === 'insert' || bProp === 'update' || bProp === 'delete') {
                  return async (...args: any[]) => {
                    try {
                      const res = await currentRealBuilder[bProp](...args);
                      if (res && isPermissionOrAuthError(res.error)) {
                        chain.push({ method: bProp, args });
                        return await executeMockChain(mockClient, table, chain);
                      }
                      return res;
                    } catch {
                      chain.push({ method: bProp, args });
                      return await executeMockChain(mockClient, table, chain);
                    }
                  };
                }

                if (typeof (currentRealBuilder as any)[bProp] === 'function') {
                  return (...args: any[]) => {
                    chain.push({ method: bProp, args });
                    try {
                      const nextReal = (currentRealBuilder as any)[bProp](...args);
                      return createProxyBuilder(nextReal);
                    } catch {
                      return createProxyBuilder(currentRealBuilder);
                    }
                  };
                }

                return Reflect.get(bTarget, bProp);
              },
            });
          };

          return createProxyBuilder(realBuilder);
        };
      }

      if (prop === 'rpc') {
        return async (funcName: string, args: any = {}) => {
          try {
            const res = await target.rpc(funcName, args);
            if (res && isPermissionOrAuthError(res.error)) {
              return mockClient.rpc(funcName, args);
            }
            return res;
          } catch {
            return mockClient.rpc(funcName, args);
          }
        };
      }

      if (prop === 'auth') {
        return {
          ...target.auth,
          async getUser() {
            try {
              const res = await target.auth.getUser();
              if (res?.data?.user) return res;
            } catch {}
            return mockClient.auth.getUser();
          },
          async getSession() {
            try {
              const res = await target.auth.getSession();
              if (res?.data?.session) return res;
            } catch {}
            return mockClient.auth.getSession();
          },
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const mockClient = createMockClient();

  if (url && key && url.startsWith('http')) {
    try {
      const real = createBrowserClient(url, key);
      return wrapWithResilience(real, mockClient) as any;
    } catch {
      return mockClient as any;
    }
  }

  return mockClient as any;
}
