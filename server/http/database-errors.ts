/** Database resource failures are retryable HTTP failures, never a reason to retry an entire handler. */
export function databaseUnavailable(error: unknown) {
  const failure = error as { code?: string; errcode?: number; message?: string };
  return failure.errcode === 5 || ['DB_ACQUIRE_TIMEOUT', '53300', '40P01', '55P03', '57014', '57P01', '08006', 'ECONNREFUSED', 'ECONNRESET']
    .includes(failure.code ?? '') || /timeout exceeded when trying to connect|Connection terminated unexpectedly/i.test(failure.message ?? '');
}
