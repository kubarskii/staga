import type { EqualityFn, Unsubscribe } from './utils';
import type { Store } from './store';

type SignalSub = () => void;

class SignalNode<T> {
    private value: T;
    private subs = new Set<SignalSub>();
    constructor(v: T) { this.value = v; }
    get(): T { track(this); return this.value; }
    set(v: T) { if (Object.is(this.value, v)) return; this.value = v; for (const s of [...this.subs]) s(); }
    subscribe(fn: SignalSub): Unsubscribe { this.subs.add(fn); return () => this.subs.delete(fn); }
}

let currentCollector: Set<SignalNode<any>> | null = null;
function track(node: SignalNode<any>) { if (currentCollector) currentCollector.add(node); }

export interface Signal<T> { get(): T; set(v: T): void; subscribe(fn: () => void): Unsubscribe; }

export function signal<T>(initial: T): Signal<T> {
    const node = new SignalNode<T>(initial);
    return { get: () => node.get(), set: (v) => node.set(v), subscribe: (fn) => node.subscribe(fn) };
}

export function derived<T>(compute: () => T): Signal<T> {
    let value: T;
    // Track the active dependency subscriptions so we can re-wire them whenever
    // the set of accessed signals changes between computations (dynamic deps).
    const depSubs = new Map<SignalNode<any>, Unsubscribe>();
    const node = new SignalNode<T>(undefined as any);

    const runCompute = () => {
        const nextDeps = new Set<SignalNode<any>>();
        const prev = currentCollector; currentCollector = nextDeps;
        try { value = compute(); } finally { currentCollector = prev; }

        // Unsubscribe from dependencies that are no longer used
        for (const [dep, unsub] of depSubs) {
            if (!nextDeps.has(dep)) {
                unsub();
                depSubs.delete(dep);
            }
        }
        // Subscribe to newly-added dependencies
        for (const dep of nextDeps) {
            if (!depSubs.has(dep)) {
                depSubs.set(dep, dep.subscribe(recompute));
            }
        }

        node.set(value);
    };
    const recompute = () => runCompute();

    runCompute();
    return { get: () => node.get(), set: () => { throw new Error('Cannot set a derived signal'); }, subscribe: (fn) => node.subscribe(fn) };
}

export function selectSignal<S extends object, T>(store: Store<S>, selector: (s: S) => T, equality: EqualityFn<T> = (a, b) => Object.is(a, b)): Signal<T> {
    const sig = signal(selector(store.getState()));
    store.watch(selector, (next) => sig.set(next), equality);
    return sig;
}


