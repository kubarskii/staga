/**
 * Shared utility functions to eliminate code duplication across modules
 */

/**
 * Deep equality comparison with type safety
 */
export function deepEqual<T>(a: T, b: T): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
        }
        return true;
    }

    return false;
}

/**
 * Optimized shallow equality check (fast path for most cases)
 */
export function shallowEqual<T>(a: T, b: T): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) {
        return false;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
    }

    return true;
}

/**
 * Get nested property with type safety
 */
export function getNestedProperty<T = unknown>(
    obj: object,
    path: string,
    defaultValue?: T
): T | undefined {
    const result = path.split('.').reduce((current: unknown, key) =>
        (current && typeof current === 'object') ? (current as Record<string, unknown>)[key] : undefined, obj);
    return result !== undefined ? (result as T) : defaultValue;
}

/**
 * Create memoized selector with proper typing
 */
export function createMemoizedSelector<TState, TResult>(
    selector: (state: TState) => TResult,
    equalityFn: (a: TResult, b: TResult) => boolean = Object.is
): (state: TState) => TResult {
    let lastState: TState | undefined;
    let lastResult: TResult;
    let hasResult = false;

    return (state: TState): TResult => {
        if (!hasResult || state !== lastState) {
            const newResult = selector(state);
            if (!hasResult || !equalityFn(lastResult, newResult)) {
                lastResult = newResult;
                hasResult = true;
            }
            lastState = state;
        }
        return lastResult;
    };
}

/**
 * Type-safe event type checking
 */
export function isEventOfType<TEventType extends string, TPayload = unknown>(
    event: { type: string; payload?: unknown },
    eventType: TEventType
): event is { type: TEventType; payload: TPayload } {
    return event.type === eventType;
}

/**
 * Safe JSON stringify that handles circular references
 */
export function safeStringify(obj: unknown, space?: number): string {
    const seen = new WeakSet();

    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);
        }
        return value;
    }, space);
}

/**
 * Create a debounced function with proper cleanup
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): T & { cancel: () => void } {
    let timeoutId: NodeJS.Timeout | null = null;

    const debounced = ((...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            func(...args);
        }, wait);
    }) as T & { cancel: () => void };

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Subscription management utility
 */
export class SubscriptionManager {
    private subscriptions = new Set<() => void>();

    add(subscription: () => void): void {
        this.subscriptions.add(subscription);
    }

    remove(subscription: () => void): void {
        this.subscriptions.delete(subscription);
    }

    dispose(): void {
        this.subscriptions.forEach(sub => {
            try {
                sub();
            } catch (error) {
                console.warn('Error disposing subscription:', error);
            }
        });
        this.subscriptions.clear();
    }

    get size(): number {
        return this.subscriptions.size;
    }

    getActiveCount(): number {
        return this.subscriptions.size;
    }

    unsubscribeAll(): void {
        this.dispose();
    }
}

/**
 * Browser-safe environment variable check
 */
export function isDebugEnabled(): boolean {
    // Check Node.js environment
    if (typeof process !== 'undefined' && process.env?.STAGA_DEBUG === 'true') {
        return true;
    }
    // Check browser environment (window.STAGA_DEBUG)
    if (typeof window !== 'undefined' && (window as Window & { STAGA_DEBUG?: boolean }).STAGA_DEBUG === true) {
        return true;
    }
    return false;
}