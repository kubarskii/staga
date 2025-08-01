import type { Middleware } from './types';

/**
 * Creates a persistence middleware that saves state to localStorage after each transaction
 * with proper state type inference
 */
export function createPersistenceMiddleware<TState extends object>(
    storageKey: string
): Middleware<TState, unknown> {
    return async (ctx, next) => {
        await next();
        try {
            const state: TState = ctx.getState();
            localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (err) {
            console.error("[Persistence] Failed to save state:", err);
        }
    };
}

/**
 * Load persisted state from localStorage or return default state
 */
export function loadPersistedState<TState extends object>(
    storageKey: string,
    defaultState: TState
): TState {
    try {
        const saved = localStorage.getItem(storageKey);
        return saved ? JSON.parse(saved) : defaultState;
    } catch {
        return defaultState;
    }
}

/**
 * Creates a logging middleware that logs transaction and step events
 * with proper state type inference
 */
export function createLoggingMiddleware<TState extends object>(): Middleware<TState, unknown> {
    return async (ctx, next) => {
        console.log(`[Staga] Starting transaction: ${ctx.transaction.name}`);
        const startTime = Date.now();

        try {
            await next();
            const duration = Date.now() - startTime;
            console.log(`[Staga] Transaction completed: ${ctx.transaction.name} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[Staga] Transaction failed: ${ctx.transaction.name} (${duration}ms)`, error);
            throw error;
        }
    };
}

/**
 * Creates a timing middleware that measures transaction execution time
 * with proper state type inference
 */
export function createTimingMiddleware<TState extends object>(
    onComplete?: (transactionName: string, duration: number, state?: TState) => void
): Middleware<TState, unknown> {
    return async (ctx, next) => {
        const startTime = Date.now();

        try {
            await next();
            const duration = Date.now() - startTime;
            const state: TState = ctx.getState();
            onComplete?.(ctx.transaction.name, duration, state);
        } catch (error) {
            const duration = Date.now() - startTime;
            const state: TState = ctx.getState();
            onComplete?.(ctx.transaction.name, duration, state);
            throw error;
        }
    };
}