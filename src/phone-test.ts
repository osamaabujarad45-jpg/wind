// Pure guard shared with tests. Real builds have no phoneTest config and use normal sign-in.
export type PhoneTest = { role: 'customer' | 'driver' | 'admin'; identifier: string; password: string };

export function phoneTestConfig(value: unknown, apiUrl: string): PhoneTest | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object') throw new Error('Invalid phone test configuration');
  const config = value as Record<string, unknown>;
  const url = new URL(apiUrl);
  if (url.href !== 'http://127.0.0.1:4191/' || typeof config.role !== 'string' || !['customer', 'driver', 'admin'].includes(config.role)
    || typeof config.identifier !== 'string' || !/^05[69]\d{7}$/.test(config.identifier)
    || typeof config.password !== 'string' || config.password.length < 24) {
    throw new Error('Phone test accounts can only use the isolated loopback API');
  }
  return config as PhoneTest;
}
