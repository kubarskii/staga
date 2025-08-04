import type { EqualityFn, Unsubscribe } from './utils';
import type { Priority, Scheduler } from './scheduler';
import type { StateMiddleware, TxEventMiddleware, SetStateAction } from './middlewares';

export interface StoreOptions<S> {
    initialState: S;
    equality?: EqualityFn<any>;
    scheduler?: Scheduler;
    middlewares?: StateMiddleware<S>[];
    txMiddlewares?: TxEventMiddleware[];
}

type Listener = () => void;

export interface SetStateOptions {
    priority?: Priority;
}

export class Store<S extends object> {
    private state: S;
    private listeners = new Set<Listener>();
    private readonly eq: EqualityFn<any>;
    private scheduler: Scheduler | null;
    private middlewares: StateMiddleware<S>[];
    private txMiddlewares: TxEventMiddleware[];
    private batchDepth = 0;
    private pendingEmit = false;

    constructor(opts: StoreOptions<S>) {
        this.state = opts.initialState;
        this.eq = opts.equality ?? ((a, b) => Object.is(a, b));
        this.scheduler = opts.scheduler ?? null;
        this.middlewares = opts.middlewares ?? [];
        this.txMiddlewares = opts.txMiddlewares ?? [];
    }

    getState(): S {
        return this.state;
    }

    setDraft(recipe: (draft: S) => void, action?: SetStateAction, options?: SetStateOptions) {
        const base = this.state as S;
        const draft = JSON.parse(JSON.stringify(base)) as S;
        recipe(draft);
        this.setStateInternal(draft, action, options);
    }

    setState(
        updater: Partial<S> | ((prev: S) => S | Partial<S>),
        action?: SetStateAction,
        options?: SetStateOptions
    ): void {
        const prev = this.state;
        const nextPartial = typeof updater === 'function' ? (updater as any)(prev) : updater;
        const next: S = (nextPartial as any) === prev ? (nextPartial as S) : ({ ...prev, ...nextPartial } as S);

        this.setStateInternal(next, action, options);
    }

    private setStateInternal(next: S, action?: SetStateAction, options?: SetStateOptions) {
        const prev = this.state;
        if (this.eq(prev, next)) return;

        let effNext = next;
        let effAction = action;
        for (const mw of this.middlewares) {
            if (mw.beforeSetState) {
                const res = mw.beforeSetState(effNext, { action: effAction, prev });
                if (res?.next) effNext = res.next;
                if (res?.action) effAction = res.action;
            }
        }

        if (!this.eq(prev, effNext)) {
            this.state = effNext;
            for (const mw of this.middlewares) {
                mw.afterSetState?.(this.state, { action: effAction, prev });
            }
            this.emit(options?.priority ?? 'immediate');
        }
    }

    // Replace entire state object without merge semantics and always emit
    replaceState(next: S, action?: SetStateAction, options?: SetStateOptions) {
        const prev = this.state;
        let effNext = next;
        let effAction = action;
        for (const mw of this.middlewares) {
            if (mw.beforeSetState) {
                const res = mw.beforeSetState(effNext, { action: effAction, prev });
                if (res?.next) effNext = res.next;
                if (res?.action) effAction = res.action;
            }
        }
        this.state = effNext;
        for (const mw of this.middlewares) {
            mw.afterSetState?.(this.state, { action: effAction, prev });
        }
        this.emit(options?.priority ?? 'immediate');
    }

    subscribe(fn: Listener): Unsubscribe {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit(priority: Priority) {
        if (this.batchDepth > 0) {
            this.pendingEmit = true;
            return;
        }
        const run = () => {
            for (const l of [...this.listeners]) l();
        };
        if (this.scheduler) this.scheduler.schedule(priority, run);
        else run();
    }

    batch<T>(fn: () => T): T {
        this.batchDepth++;
        try {
            return fn();
        } finally {
            this.batchDepth--;
            if (this.batchDepth === 0 && this.pendingEmit) {
                this.pendingEmit = false;
                this.emit('normal');
            }
        }
    }

    _notifyTxEvent(e: any) {
        for (const mw of this.txMiddlewares) mw.onTxEvent?.(e);
    }

    watch<T>(selector: (s: S) => T, cb: (value: T, prev: T) => void, equality: EqualityFn<T> = this.eq): Unsubscribe {
        let prev = selector(this.state);
        const l = () => {
            const next = selector(this.state);
            if (!equality(prev as any, next as any)) {
                const old = prev;
                prev = next;
                cb(next, old);
            }
        };
        return this.subscribe(l);
    }
}


