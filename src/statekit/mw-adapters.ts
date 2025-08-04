import type { StateMiddleware, TxEventMiddleware } from './middlewares';

export function createStatePersistenceMiddleware<S extends object>(storageKey: string): StateMiddleware<S> {
    return {
        afterSetState(curr) {
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(storageKey, JSON.stringify(curr));
                }
            } catch {
                // ignore
            }
        },
    };
}

export function createStateLoggingMiddleware<S extends object>(): StateMiddleware<S> {
    return {
        beforeSetState(next, { action, prev }) {
            // eslint-disable-next-line no-console
            console.log('[Statekit] setState(before)', { action, prev, next });
        },
        afterSetState(curr, { action, prev }) {
            // eslint-disable-next-line no-console
            console.log('[Statekit] setState(after)', { action, prev, curr });
        },
    };
}

export function createTxLoggingMiddleware(): TxEventMiddleware {
    return {
        onTxEvent(e) {
            // eslint-disable-next-line no-console
            console.log('[Statekit] tx', e);
        },
    };
}

export function createTxTimingMiddleware(onComplete?: (txId: string, duration: number) => void): TxEventMiddleware {
    const startMap = new Map<string, number>();
    return {
        onTxEvent(e) {
            if (e.type === 'start') startMap.set(e.txId, Date.now());
            if (e.type === 'success' || e.type === 'failed' || e.type === 'cancelled') {
                const s = startMap.get(e.txId);
                if (s) {
                    const d = Date.now() - s;
                    onComplete?.(e.txId, d);
                    startMap.delete(e.txId);
                }
            }
        },
    };
}


