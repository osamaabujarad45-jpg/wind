type Category = 'http_request_failed' | 'postgres_idle_connection_failed' | 'committed_effect_failed'
  | 'outbox_worker_failed' | 'email_provider_failed' | 'account_command_failed' | 'maintenance_failed' | 'firebase_maintenance_failed' | 'presence_maintenance_failed' | 'shutdown_failed';

/** Error objects are untrusted: PostgreSQL detail/message/where can contain entire private rows. */
export function logServerError(category: Category, error?: unknown, context: { correlationId?: string; httpStatus?: number; operatorAction?: 'cannot_change_self' | 'Verify phone ownership' } = {}) {
  const failure = error as { code?: unknown; errcode?: unknown } | null;
  const sqlstate = typeof failure?.code === 'string' && /^[0-9A-Z]{5}$/.test(failure.code) ? failure.code : undefined;
  const code = typeof failure?.code === 'string' && ['ERR_SQLITE_ERROR','DB_ACQUIRE_TIMEOUT','DB_TRANSACTION_ABORTED',
    'ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','ENOTFOUND','EAI_AGAIN','ERR_STREAM_PREMATURE_CLOSE'].includes(failure.code) ? failure.code : undefined;
  const sqliteCode = typeof failure?.errcode === 'number' && Number.isInteger(failure.errcode) && failure.errcode >= 0 && failure.errcode <= 65535 ? failure.errcode : undefined;
  const correlationId = typeof context.correlationId === 'string' && /^[a-f0-9-]{36}$/.test(context.correlationId) ? context.correlationId : undefined;
  const httpStatus = Number.isInteger(context.httpStatus) && context.httpStatus! >= 100 && context.httpStatus! <= 599 ? context.httpStatus : undefined;
  // Fixed operator hints preserve CLI usability. These are never copied from an error message.
  const operatorAction = failure?.code === 'OPERATOR_REQUEST_PROOF_REQUIRED' ? 'Verify request ownership'
    : failure?.code === 'OPERATOR_PHONE_PROOF_REQUIRED' ? 'Verify phone ownership'
    : ['cannot_change_self','Verify phone ownership'].includes(context.operatorAction ?? '') ? context.operatorAction : undefined;
  console.error(JSON.stringify({ category, sqlstate, code, sqliteCode, correlationId, httpStatus, operatorAction }));
}
