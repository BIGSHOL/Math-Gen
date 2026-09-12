/** A request deadline, independent of React mount/cleanup and user cancellation. */
export class DeadlineError extends Error {
  readonly status = 408;
  readonly retryable = false;
  constructor(message: string) { super(message); this.name = "DeadlineError"; }
}

export async function withDeadline<T>(work: Promise<T>, ms: number, message: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new DeadlineError(message));
    }, ms);
  });
  try { return await Promise.race([work, deadline]); }
  finally { clearTimeout(timer!); }
}
