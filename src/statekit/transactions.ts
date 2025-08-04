import { Stream } from './streams';
import type { Store } from './store';

export type TxContext<S extends object> = {
    store: Store<S>;
    bag: Record<string, unknown>;
    signal: AbortSignal;
};

export type TxStep<S extends object> = {
    name: string;
    do: (ctx: TxContext<S>) => Promise<any> | any;
    compensate?: (ctx: TxContext<S>, resultOfDo?: any) => Promise<void> | void;
    retry?: number;
    timeoutMs?: number;
};

export type TxEvent =
    | { type: 'start'; txId: string }
    | { type: 'step:start'; txId: string; step: string; attempt: number }
    | { type: 'step:success'; txId: string; step: string; result: unknown }
    | { type: 'step:retry'; txId: string; step: string; attempt: number; error: unknown }
    | { type: 'step:failed'; txId: string; step: string; error: unknown }
    | { type: 'compensating'; txId: string; step: string }
    | { type: 'compensated'; txId: string; step: string }
    | { type: 'success'; txId: string }
    | { type: 'failed'; txId: string; error: unknown }
    | { type: 'cancelled'; txId: string };

export interface Transaction {
    id: string;
    events: Stream<TxEvent>;
    run(): Promise<void>;
    cancel(): void;
}

let _txCounter = 0;

function withTimeout<T>(p: Promise<T>, ms?: number, signal?: AbortSignal): Promise<T> {
    if (!ms) return p;
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); }
        );
        if (signal) {
            const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
            if (signal.aborted) onAbort();
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

export function createTransaction<S extends object>(store: Store<S>, steps: TxStep<S>[], abortController: AbortController = new AbortController()): Transaction {
    const id = `tx_${Date.now()}_${++_txCounter}`;
    const events = new Stream<TxEvent>();
    const ctx: TxContext<S> = { store, bag: Object.create(null), signal: abortController.signal };

    const emitTx = (e: TxEvent) => { events.next(e); (store as any)._notifyTxEvent?.(e); };

    const run = async () => {
        emitTx({ type: 'start', txId: id });
        const done: { step: TxStep<S>; result: any }[] = [];
        try {
            for (const step of steps) {
                let attempt = 0;
                const retries = step.retry ?? 0;
                while (true) {
                    if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                    attempt++;
                    emitTx({ type: 'step:start', txId: id, step: step.name, attempt });
                    try {
                        const result = await withTimeout(Promise.resolve(step.do(ctx)), step.timeoutMs, ctx.signal);
                        done.push({ step, result });
                        emitTx({ type: 'step:success', txId: id, step: step.name, result });
                        break;
                    } catch (err) {
                        if (attempt <= retries) {
                            emitTx({ type: 'step:retry', txId: id, step: step.name, attempt, error: err });
                            continue;
                        } else {
                            emitTx({ type: 'step:failed', txId: id, step: step.name, error: err });
                            throw err;
                        }
                    }
                }
            }
            emitTx({ type: 'success', txId: id });
        } catch (error) {
            for (let i = done.length - 1; i >= 0; i--) {
                const item = done[i];
                if (!item) continue;
                const { step, result } = item;
                if (typeof step.compensate === 'function') {
                    try {
                        emitTx({ type: 'compensating', txId: id, step: step.name });
                        await Promise.resolve(step.compensate(ctx, result));
                        emitTx({ type: 'compensated', txId: id, step: step.name });
                    } catch { }
                }
            }
            if (ctx.signal.aborted) emitTx({ type: 'cancelled', txId: id });
            else { emitTx({ type: 'failed', txId: id, error }); throw error; }
        }
    };

    return { id, events, run, cancel() { abortController.abort(); } };
}


