export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(scope: string): Logger {
  return {
    info(message, meta) {
      write("INFO", scope, message, meta);
    },
    warn(message, meta) {
      write("WARN", scope, message, meta);
    },
    error(message, meta) {
      write("ERROR", scope, message, meta);
    }
  };
}

function write(level: string, scope: string, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    scope,
    message,
    ...(meta ? { meta } : {})
  };

  console.log(JSON.stringify(payload));
}

