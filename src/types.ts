/**
 * Core types for the Staga library
 */

export type StepFunction<TState extends object, TPayload> = (
    state: TState,
    payload: TPayload
) => void | Promise<void>;

export interface StepOptions {
    retries?: number;
    timeout?: number;
}

export interface TransactionOptions {
    disableAutoRollback?: boolean;
}

export interface SagaStep<TState extends object, TPayload> {
    name: string;
    execute: StepFunction<TState, TPayload>;
    compensate?: StepFunction<TState, TPayload> | undefined;
    retries: number;
    timeout: number;
}

export type MiddlewareContext<TState extends object, TPayload> = {
    transaction: Transaction<TState, TPayload>;
    payload: TPayload;
    getState: () => TState;
    setState: (newState: TState) => void;
};

export type Middleware<TState extends object, TPayload = unknown> = (
    ctx: MiddlewareContext<TState, TPayload>,
    next: () => Promise<void>
) => Promise<void>;

export type AnyMiddleware<TState extends object> = Middleware<TState, unknown>;

// Generic event interfaces with proper payload inference
export interface TransactionStartEvent<TPayload = unknown> {
    type: 'transaction:start';
    transactionName: string;
    payload: TPayload;
    timestamp: number;
}

export interface TransactionSuccessEvent<TPayload = unknown> {
    type: 'transaction:success';
    transactionName: string;
    payload: TPayload;
    duration: number;
    timestamp: number;
}

export interface TransactionFailEvent<TPayload = unknown> {
    type: 'transaction:fail';
    transactionName: string;
    error: Error;
    payload: TPayload;
    duration: number;
    timestamp: number;
}

export interface TransactionCompleteEvent<TPayload = unknown> {
    type: 'transaction:complete';
    transactionName: string;
    payload: TPayload;
    duration: number;
    timestamp: number;
}

export interface StepStartEvent<TPayload = unknown> {
    type: 'step:start';
    stepName: string;
    payload: TPayload;
    timestamp: number;
}

export interface StepSuccessEvent<TPayload = unknown> {
    type: 'step:success';
    stepName: string;
    payload: TPayload;
    duration: number;
    timestamp: number;
}

export interface StepRetryEvent<TPayload = unknown> {
    type: 'step:retry';
    stepName: string;
    payload: TPayload;
    attempt: number;
    lastError: Error;
    timestamp: number;
}

export interface StepRollbackEvent<TPayload = unknown> {
    type: 'step:rollback';
    stepName: string;
    payload: TPayload;
    timestamp: number;
}

export interface TransactionRollbackEvent<TPayload = unknown> {
    type: 'transaction:rollback';
    transactionName: string;
    payload: TPayload;
    timestamp: number;
}

// Redux-style discriminated union for all events with payload inference
export type SagaEvent<TPayload = unknown> =
    | TransactionStartEvent<TPayload>
    | TransactionSuccessEvent<TPayload>
    | TransactionFailEvent<TPayload>
    | TransactionCompleteEvent<TPayload>
    | TransactionRollbackEvent<TPayload>
    | StepStartEvent<TPayload>
    | StepSuccessEvent<TPayload>
    | StepRetryEvent<TPayload>
    | StepRollbackEvent<TPayload>;

// Union of all possible events (for backward compatibility)
export type AnySagaEvent = SagaEvent<any>;

// Generic event map with proper payload inference
export interface EventMap<TPayload = unknown> {
    'transaction:start': [transactionName: string, payload: TPayload];
    'transaction:success': [transactionName: string, payload: TPayload];
    'transaction:fail': [transactionName: string, error: Error];
    'transaction:rollback': [transactionName: string];
    'step:start': [stepName: string, payload: TPayload];
    'step:success': [stepName: string, payload: TPayload];
    'step:retry': [stepName: string, attempt: number];
    'step:rollback': [stepName: string, payload: TPayload];
}

export type EventName = keyof EventMap;
export type EventArgs<T extends EventName, TPayload = unknown> = EventMap<TPayload>[T];
export type Listener<T extends EventName, TPayload = unknown> = (...args: EventArgs<T, TPayload>) => void;

// Redux-style event listener typing with payload inference
export type SagaEventListener<
    T extends AnySagaEvent['type'],
    TPayload = unknown
> = (
    event: Extract<SagaEvent<TPayload>, { type: T }>
) => void;

export type AnySagaEventListener<TPayload = unknown> = (event: SagaEvent<TPayload>) => void;

// Type-safe event listener that infers payload from event type
export type TypedEventListener<TEvent extends AnySagaEvent> = (event: TEvent) => void;
export type AnyEventListener = (...args: unknown[]) => void;

// Forward declaration for Transaction to use in MiddlewareContext
export interface Transaction<TState extends object, TPayload = unknown> {
    name: string;
    addStep(
        name: string,
        execute: StepFunction<TState, TPayload>,
        compensate?: StepFunction<TState, TPayload>,
        options?: StepOptions
    ): Transaction<TState, TPayload>;
    run(payload: TPayload): Promise<void>;
}