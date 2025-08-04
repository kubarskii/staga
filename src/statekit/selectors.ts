import type { EqualityFn, Unsubscribe } from './utils';
import type { Store } from './store';

export function createSelector<S, T>(selector: (s: S) => T, equality: EqualityFn<T> = (a, b) => Object.is(a, b)) {
    let hasPrev = false;
    let prevOut: T | undefined;
    return (s: S): T => {
        const out = selector(s);
        if (!hasPrev) {
            prevOut = out;
            hasPrev = true;
            return out;
        }
        if (!equality(prevOut as T, out)) prevOut = out;
        return prevOut as T;
    };
}

export interface Computed<T> {
    get(): T;
    subscribe(cb: (v: T, prev: T) => void): Unsubscribe;
}

export function computed<S extends object, T>(store: Store<S>, selector: (s: S) => T, equality: EqualityFn<T> = (a, b) => Object.is(a, b)): Computed<T> {
    let value = selector(store.getState());
    const subs = new Set<(v: T, p: T) => void>();
    store.watch(selector, (next) => {
        const old = value;
        value = next;
        for (const cb of subs) cb(next, old);
    }, equality);
    return {
        get() { return value; },
        subscribe(cb) {
            subs.add(cb);
            return () => subs.delete(cb);
        }
    };
}


