export type SetStateAction = { type?: string; payload?: unknown } | string | undefined;

export interface StateMiddlewareAPI<S> {
    getState(): S;
    setState(next: S, meta: { action?: SetStateAction; prev: S }): void;
}

export interface StateMiddleware<S> {
    beforeSetState?(
        next: S,
        meta: { action?: SetStateAction; prev: S }
    ): void | { next?: S; action?: SetStateAction };
    afterSetState?(curr: S, meta: { action?: SetStateAction; prev: S }): void;
}

export interface TxEventMiddleware {
    onTxEvent?(e: TxEvent): void;
}

// forward type
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


