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
    let deps = new Set<SignalNode<any>>();
    const node = new SignalNode<T>(undefined as any);

    const recompute = () => {
        for (const _ of deps) {/* noop to keep reference */ }
        deps.clear();
        const prev = currentCollector; currentCollector = deps;
        try { value = compute(); } finally { currentCollector = prev; }
        node.set(value);
    };

    const runInitial = () => {
        deps.clear();
        const prev = currentCollector; currentCollector = deps;
        try { value = compute(); } finally { currentCollector = prev; }
        for (const d of deps) d.subscribe(recompute);
        node.set(value);
    };

    runInitial();
    return { get: () => node.get(), set: () => { throw new Error('Cannot set a derived signal'); }, subscribe: (fn) => node.subscribe(fn) };
}

export function selectSignal<S extends object, T>(store: Store<S>, selector: (s: S) => T, equality: EqualityFn<T> = (a, b) => Object.is(a, b)): Signal<T> {
    const sig = signal(selector(store.getState()));
    store.watch(selector, (next) => sig.set(next), equality);
    return sig;
}


