export type HydrationToolCallContext = {
  slotId: string;
  question: string;
  toolId: string;
  params?: Record<string, unknown>;
};

export interface HydrationSearchMiddleware {
  beforeToolCall?(context: HydrationToolCallContext): Promise<void> | void;
  afterToolCall?(
    context: HydrationToolCallContext,
    result: { recordCount: number; payload?: unknown },
  ): Promise<void> | void;
  onToolError?(context: HydrationToolCallContext, error: unknown): Promise<void> | void;
}

export async function runHydrationToolWithMiddleware<T>(
  middleware: HydrationSearchMiddleware | undefined,
  context: HydrationToolCallContext,
  runner: () => Promise<T>,
  resultSummary: (result: T) => { recordCount: number; payload?: unknown },
): Promise<T> {
  await middleware?.beforeToolCall?.(context);
  try {
    const result = await runner();
    await middleware?.afterToolCall?.(context, resultSummary(result));
    return result;
  } catch (error) {
    await middleware?.onToolError?.(context, error);
    throw error;
  }
}
