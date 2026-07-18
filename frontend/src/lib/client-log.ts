type ClientLogContext = Record<string, unknown>;

function writeClientLog(level: 'error' | 'warn', message: string, context?: ClientLogContext): void {
  const payload = context ? [message, context] : [message];
  if (level === 'error') {
    console.error(...payload);
    return;
  }
  console.warn(...payload);
}

export function logClientError(message: string, error?: unknown, context?: ClientLogContext): void {
  writeClientLog('error', message, { ...(context ?? {}), error });
}

export function logClientWarning(message: string, context?: ClientLogContext): void {
  writeClientLog('warn', message, context);
}
