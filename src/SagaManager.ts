/**
 * SagaManager - Simplified main orchestrator for managing sagas, state, and transactions
 * Combines essential functionality without complex orchestration
 */

import type { AnyMiddleware, SagaEventListener, AnySagaEventListener, AnySagaEvent, TransactionOptions } from './types';
import { derived } from './statekit';
import { StateManager, type StateManagerOptions } from './StateManager';
import { Transaction, TransactionBuilder } from './Transaction';
import { SagaEventManager, type SagaEventManagerOptions } from './managers/SagaEventManager';
import { isDebugEnabled } from './utils';

export interface SagaManagerOptions {
    events?: SagaEventManagerOptions;
    state?: StateManagerOptions;
}

export class SagaManager<TState extends object> {
    private eventManager: SagaEventManager;
    private middleware: AnyMiddleware<TState>[] = [];

    // Event Recording and Replay
    private isRecording: boolean = false;
    private recordedEvents: Array<{
        type: string;
        payload: unknown;
        timestamp: number;
        stateSnapshot: TState;
    }> = [];
    private replayInProgress: boolean = false;

    constructor(
        private _stateManager: StateManager<TState>,
        options: SagaManagerOptions = {}
    ) {
        if (isDebugEnabled()) {
            console.log('[SagaManager] Creating SagaManager with options:', options);
        }
        this.eventManager = new SagaEventManager(options.events);

        // Set up recording for state changes
        this._stateManager.subscribe((state) => {
            if (this.isRecording && !this.replayInProgress) {
                this.recordEvent('state:change', state, state);
            }
        });

        // Set up recording for all events
        this.eventManager.getEventStream('*').subscribe((event: import('./types').SagaEvent<unknown>) => {
            if (this.isRecording && !this.replayInProgress) {
                this.recordEvent(`event:${event.type}`, event.payload, this._stateManager.getState());
            }
        });
    }

    // ===== EVENT RECORDING HELPERS =====

    private recordEvent(type: string, payload: unknown, stateSnapshot: TState): void {
        this.recordedEvents.push({
            type,
            payload,
            timestamp: Date.now(),
            stateSnapshot: JSON.parse(JSON.stringify(stateSnapshot)) // Deep clone to preserve snapshot
        });
    }

    // ===== STATIC FACTORY METHODS =====

    /**
     * Create a new SagaManager instance with default state management
     */
    static create<TState extends object>(
        initialState: TState,
        options?: SagaManagerOptions
    ): SagaManager<TState> {
        const stateManager = new StateManager(initialState, options?.state);
        return new SagaManager(stateManager, options);
    }

    /**
     * Create SagaManager with custom StateManager options
     */
    static createWithOptions<TState extends object>(
        initialState: TState,
        stateOptions?: StateManagerOptions,
        sagaOptions?: SagaManagerOptions
    ): SagaManager<TState> {
        const stateManager = new StateManager(initialState, stateOptions);
        return new SagaManager(stateManager, sagaOptions);
    }

    /**
     * Create SagaManager with existing StateManager
     */
    static createWithStateManager<TState extends object>(
        stateManager: StateManager<TState>,
        options?: SagaManagerOptions
    ): SagaManager<TState> {
        return new SagaManager(stateManager, options);
    }

    // ===== PROPERTY ACCESSORS =====

    /**
     * Access to StateManager (mainly for testing)
     */
    public get stateManager(): StateManager<TState> {
        return this._stateManager;
    }

    // ===== TRANSACTION API =====

    /**
     * Create a new transaction builder
     */
    createTransaction<TPayload = unknown>(
        name: string,
        options?: {
            reactiveProxy?: import('./ReactiveStateProxy').ReactiveProxyOptions;
            transaction?: TransactionOptions;
        }
    ): TransactionBuilder<TState, TPayload> {
        return new TransactionBuilder<TState, TPayload>(
            name,
            this._stateManager,
            this.eventManager,
            this.middleware as AnyMiddleware<TState>[],
            options?.reactiveProxy,
            options?.transaction
        );
    }

    /**
     * Create a typed transaction
     */
    createTypedTransaction<TPayload>(
        name: string,
        options?: {
            reactiveProxy?: import('./ReactiveStateProxy').ReactiveProxyOptions;
            transaction?: TransactionOptions;
        }
    ): Transaction<TState, TPayload> {
        return new Transaction<TState, TPayload>(
            name,
            this._stateManager,
            this.eventManager,
            this.middleware as AnyMiddleware<TState>[],
            options?.reactiveProxy,
            options?.transaction
        );
    }

    /**
     * Create a void transaction (no payload)
     */
    createVoidTransaction(
        name: string,
        options?: {
            reactiveProxy?: import('./ReactiveStateProxy').ReactiveProxyOptions;
            transaction?: TransactionOptions;
        }
    ): Transaction<TState, void> {
        return new Transaction<TState, void>(
            name,
            this._stateManager,
            this.eventManager,
            this.middleware as AnyMiddleware<TState>[],
            options?.reactiveProxy,
            options?.transaction
        );
    }

    /**
     * Add middleware
     */
    use(middleware: AnyMiddleware<TState>): void {
        this.middleware.push(middleware);
    }

    // ===== REACTIVE SELECTOR API =====

    /**
     * Create a reactive selector that automatically updates when state changes
     * Returns a simple BehaviorSubject for straightforward reactivity
     */
    select<TResult>(
        selector: (state: TState) => TResult,
        equalityFn?: (a: TResult, b: TResult) => boolean
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult } {
        return this._stateManager.select(selector, equalityFn);
    }

    /**
     * Create a reactive selector for a specific property
     * Returns a simple BehaviorSubject for straightforward reactivity
     */
    selectProperty<K extends keyof TState>(
        property: K
    ): { get(): TState[K]; subscribe(observer: (value: TState[K]) => void): () => void; readonly value: TState[K] } {
        return this._stateManager.selectProperty(property);
    }

    /**
     * Create a simple computed value from one or two reactive sources
     * Simplified version for common use cases
     */
    computed<T1, TResult>(
        source1: import('./statekit').Signal<T1>,
        combiner: (value1: T1) => TResult
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult };
    computed<T1, T2, TResult>(
        source1: import('./statekit').Signal<T1>,
        source2: import('./statekit').Signal<T2>,
        combiner: (value1: T1, value2: T2) => TResult
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult };
    computed<T1, T2, TResult>(
        source1: import('./statekit').Signal<T1>,
        source2OrCombiner: import('./statekit').Signal<T2> | ((value1: T1) => TResult),
        combiner?: (value1: T1, value2: T2) => TResult
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult } {
        if (typeof source2OrCombiner === 'function') {
            const computeFn = source2OrCombiner;
            const base = derived(() => computeFn(source1.get()));
            return {
                get: () => base.get(),
                subscribe: (observer: (value: TResult) => void) => {
                    try {
                        observer(base.get());
                    } catch (err) {
                        console.error('[SagaManager] Computed observer error:', err);
                    }
                    return base.subscribe(() => {
                        try {
                            observer(base.get());
                        } catch (err) {
                            console.error('[SagaManager] Computed observer error:', err);
                        }
                    });
                },
                get value() { return base.get(); }
            } as any;
        } else {
            const source2 = source2OrCombiner;
            const computeFn = combiner;
            if (!computeFn) throw new Error('Combiner function is required for two-source computed');
            const base = derived(() => computeFn(source1.get(), source2.get()));
            return {
                get: () => base.get(),
                subscribe: (observer: (value: TResult) => void) => {
                    try {
                        observer(base.get());
                    } catch (err) {
                        console.error('[SagaManager] Computed observer error:', err);
                    }
                    return base.subscribe(() => {
                        try {
                            observer(base.get());
                        } catch (err) {
                            console.error('[SagaManager] Computed observer error:', err);
                        }
                    });
                },
                get value() { return base.get(); }
            } as any;
        }
    }

    // ===== STATE API =====

    /**
     * Get current state
     */
    getState(): TState {
        return this._stateManager.getState();
    }

    /**
     * Undo last state change (backward compatibility)
     */
    undo(): TState | null {
        try {
            this._stateManager.undo();
            return this._stateManager.getState();
        } catch {
            return null;
        }
    }

    /**
     * Redo last undone state change (backward compatibility)
     */
    redo(): TState | null {
        try {
            this._stateManager.redo();
            return this._stateManager.getState();
        } catch {
            return null;
        }
    }

    // ===== EVENT API =====

    /**
     * Subscribe to specific typed saga events
     */
    onSagaEvent<T extends AnySagaEvent['type'], TPayload = unknown>(
        eventType: T,
        callback: SagaEventListener<T, TPayload>
    ): () => void {
        return this.eventManager.onSagaEvent(eventType, callback);
    }

    // Legacy adapters removed: on/emit/onEvent

    /**
     * Subscribe to all saga events
     */
    onAnyEvent(callback: AnySagaEventListener): () => void {
        return this.eventManager.onAnyEvent(callback);
    }



    /**
     * Emit a saga event
     */
    emitSagaEvent<TPayload = unknown>(event: import('./types').SagaEvent<TPayload>): void {
        this.eventManager.emitSagaEvent(event);
    }



    // ===== REACTIVE STREAM API =====

    /**
     * Get reactive stream for specific event type
     * Returns a Subject that emits events of the specified type
     */
    onEventStream<T = unknown>(eventType: string): import('./statekit').Stream<import('./types').SagaEvent<T>> {
        return this.eventManager.getEventStream<T>(eventType);
    }

    /**
     * Get reactive stream for all events
     */
    onAllEventsStream(): import('./statekit').Stream<import('./types').SagaEvent<unknown>> {
        return this.eventManager.getEventStream('*');
    }

    // ===== REPLAY API =====

    /**
     * Start recording events for later replay
     */
    startRecording(): void {
        this.isRecording = true;
        this.recordedEvents = []; // Clear previous recordings
        if (isDebugEnabled()) {
            console.log('[SagaManager] Recording started');
        }
    }

    /**
     * Stop recording events
     */
    stopRecording(): void {
        this.isRecording = false;
        if (isDebugEnabled()) {
            console.log(`[SagaManager] Recording stopped. Captured ${this.recordedEvents.length} events`);
        }
    }

    /**
     * Replay all recorded events
     */
    async startReplay(options: { delay?: number } = {}): Promise<void> {
        const delay = options.delay ?? 100;

        if (this.recordedEvents.length === 0) {
            if (isDebugEnabled()) {
                console.log('[SagaManager] No events to replay');
            }
            return;
        }

        this.replayInProgress = true;

        if (isDebugEnabled()) {
            console.log(`[SagaManager] Starting replay of ${this.recordedEvents.length} events`);
        }

        try {
            for (const event of this.recordedEvents) {
                // Add delay to make replay visible
                await new Promise(resolve => setTimeout(resolve, delay));

                if (event.type === 'state:change') {
                    // Replay state change
                    this._stateManager.setState(event.payload as TState);
                } else if (event.type.startsWith('event:')) {
                    // Replay event
                    const eventType = event.type.substring(6); // Remove 'event:' prefix
                    this.eventManager.emitSagaEvent({ type: eventType as any, payload: event.payload, timestamp: Date.now() } as any);
                }

                if (isDebugEnabled()) {
                    console.log(`[SagaManager] Replayed: ${event.type} at ${new Date(event.timestamp).toISOString()}`);
                }
            }
        } finally {
            this.replayInProgress = false;
            if (isDebugEnabled()) {
                console.log('[SagaManager] Replay completed');
            }
        }
    }

    /**
     * Get recorded events (for inspection or export)
     */
    getRecordedEvents() {
        return [...this.recordedEvents]; // Return a copy
    }

    /**
     * Clear recorded events
     */
    clearRecordedEvents(): void {
        this.recordedEvents = [];
        if (isDebugEnabled()) {
            console.log('[SagaManager] Recorded events cleared');
        }
    }

    /**
     * Load and replay events from external source
     */
    async replayEvents(events: Array<{
        type: string;
        payload: unknown;
        timestamp: number;
        stateSnapshot: TState;
    }>): Promise<void> {
        this.recordedEvents = [...events];
        await this.startReplay();
    }

    // ===== LIFECYCLE =====

    /**
     * Dispose and clean up all resources
     */
    async dispose(): Promise<void> {
        this._stateManager.dispose();
        this.eventManager.dispose();
        this.middleware = [];
    }
}