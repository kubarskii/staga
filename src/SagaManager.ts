import type { EventName, EventArgs, Listener, AnyMiddleware, AnyEventListener, SagaEventListener, AnySagaEventListener, AnySagaEvent, TypedEventListener, SagaEvent } from './types';
import { StateManager, type StateManagerOptions } from './StateManager';
import { Transaction, TransactionBuilder } from './Transaction';
import { Observable, ReactiveSelectorFactory, ComputedValue, type ReactiveValue, type ReactiveSelector, deepEqual } from './ReactiveSelectors';
import { CompositionBuilder, TransactionComposer } from './TransactionComposition';
import { EventReplayManager, type RecordedEvent, type EventSession, type ReplayOptions } from './EventReplay';

/**
 * SagaManager is the main orchestrator for managing sagas, state, and transactions
 */
export class SagaManager<TState extends object> {
  private listeners: Record<string, AnyEventListener[]> = {};
  private middleware: AnyMiddleware<TState>[] = [];

  // Redux-style event listeners for better type safety
  private typedListeners: Map<AnySagaEvent['type'] | '*', AnySagaEventListener[]> = new Map();

  // Reactive state management
  private reactiveState: Observable<TState>;
  private selectorFactory: ReactiveSelectorFactory<TState>;

  // Transaction composition
  private compositionBuilder: CompositionBuilder<TState>;

  // Event replay system
  private replayManager: EventReplayManager<unknown>;

  // Interval ID for state change watcher
  private stateWatchInterval: ReturnType<typeof setInterval> | null = null;

  // Expose StateManager for testing without type casting
  public get stateManager(): StateManager<TState> {
    return this._stateManager;
  }

  constructor(private _stateManager: StateManager<TState>) {
    // Initialize reactive state
    this.reactiveState = new Observable(this._stateManager.getState());
    this.selectorFactory = new ReactiveSelectorFactory(this.reactiveState);

    // Initialize composition builder
    this.compositionBuilder = new CompositionBuilder(this._stateManager, this);

    // Initialize event replay
    this.replayManager = new EventReplayManager();

    // Subscribe to state changes to update reactive state
    this.setupStateWatcher();

    // Auto-record events if in development mode
    this.setupEventRecording();
  }

  /**
   * Create a new SagaManager instance with default state management
   */
  static create<TState extends object>(initialState: TState): SagaManager<TState> {
    return new SagaManager(new StateManager(initialState));
  }

  /**
   * Create a new SagaManager instance with custom state management options
   */
  static createWithOptions<TState extends object>(
    initialState: TState,
    options?: StateManagerOptions
  ): SagaManager<TState> {
    return new SagaManager(new StateManager(initialState, options));
  }

  /**
   * Create a SagaManager with a custom state manager implementation
   */
  static createWithStateManager<TState extends object>(
    stateManager: StateManager<TState>
  ): SagaManager<TState> {
    return new SagaManager(stateManager);
  }

  /**
 * Create a transaction builder with automatic payload type inference
 */
  createTransaction<TPayload = unknown>(name: string): TransactionBuilder<TState, TPayload> {
    return new TransactionBuilder<TState, TPayload>(name, this._stateManager, this, this.middleware);
  }

  /**
   * Create a typed transaction with payload inference helper
   */
  createTypedTransaction<TPayload>(name: string): Transaction<TState, TPayload> {
    return new Transaction<TState, TPayload>(name, this._stateManager, this, this.middleware);
  }

  /**
   * Create a transaction with no payload (for simple workflows)
   */
  createVoidTransaction(name: string): Transaction<TState, void> {
    return new Transaction<TState, void>(name, this._stateManager, this, this.middleware);
  }

  /**
   * Add middleware to the saga manager with proper state type inference
   */
  use(middleware: AnyMiddleware<TState>): void {
    this.middleware.push(middleware);
  }

  /**
   * Subscribe to events (legacy API) - supports custom events
   * @deprecated Use onEvent() instead for better type safety and payload inference
   */
  on<T extends EventName>(event: T, callback: Listener<T>): () => void;
  on(event: string, callback: (...args: unknown[]) => void): () => void;
  on(event: string, callback: AnyEventListener): () => void {
    console.warn(
      `[Staga] The on() method is deprecated. Use onEvent() for better type safety.`
    );
    const eventKey = String(event);
    if (!this.listeners[eventKey]) {
      this.listeners[eventKey] = [];
    }
    this.listeners[eventKey].push(callback);
    return () => {
      const list = this.listeners[eventKey];
      if (!list) {
        return;
      }
      const index = list.indexOf(callback);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        delete this.listeners[eventKey];
      }
    };
  }

  /**
 * Subscribe to events with Redux-style typing and payload inference
 */
  onEvent<T extends AnySagaEvent['type'], TPayload = unknown>(
    eventType: T,
    callback: SagaEventListener<T, TPayload>
  ): () => void {
    if (!this.typedListeners.has(eventType)) {
      this.typedListeners.set(eventType, []);
    }
    const wrappedCallback: AnySagaEventListener = (event: AnySagaEvent) => {
      if (this.isEventOfType<T, TPayload>(event, eventType)) {
        callback(event);
      }
    };
    const listeners = this.typedListeners.get(eventType)!;
    listeners.push(wrappedCallback);
    return () => {
      const list = this.typedListeners.get(eventType);
      if (!list) {
        return;
      }
      const index = list.indexOf(wrappedCallback);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.typedListeners.delete(eventType);
      }
    };
  }

  /**
   * Subscribe to all events with Redux-style typing
   */
  onAnyEvent(callback: AnySagaEventListener): () => void {
    const key: '*' = '*';
    if (!this.typedListeners.has(key)) {
      this.typedListeners.set(key, []);
    }
    const listeners = this.typedListeners.get(key)!;
    listeners.push(callback);
    return () => {
      const list = this.typedListeners.get(key);
      if (!list) {
        return;
      }
      const index = list.indexOf(callback);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.typedListeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to specific typed events with full type inference
   */
  onTypedEvent<TEvent extends AnySagaEvent>(
    eventType: TEvent['type'],
    callback: TypedEventListener<TEvent>
  ): () => void {
    if (!this.typedListeners.has(eventType)) {
      this.typedListeners.set(eventType, []);
    }
    const wrappedCallback: AnySagaEventListener = (event: AnySagaEvent) => {
      if (this.isEventOfType<TEvent['type']>(event, eventType)) {
        // After narrowing, cast through unknown to satisfy TypeScript
        callback(event as unknown as TEvent);
      }
    };
    const listeners = this.typedListeners.get(eventType)!;
    listeners.push(wrappedCallback);
    return () => {
      const list = this.typedListeners.get(eventType);
      if (!list) {
        return;
      }
      const index = list.indexOf(wrappedCallback);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.typedListeners.delete(eventType);
      }
    };
  }

  private isEventOfType<
    T extends AnySagaEvent['type'],
    TPayload = unknown
  >(
    event: AnySagaEvent,
    type: T
  ): event is Extract<SagaEvent<TPayload>, { type: T }> {
    return event.type === type;
  }

  /**
   * Emit an event to all listeners - supports custom events
   * @deprecated Use emitSagaEvent() for better type safety and unified event handling
   */
  emit<T extends EventName>(event: T, ...args: EventArgs<T>): void;
  emit(event: string, ...args: unknown[]): void;
  emit<T extends EventName>(event: T | string, ...args: EventArgs<T> | unknown[]): void {
    const eventKey = String(event);
    const eventListeners = this.listeners[eventKey];
    if (eventListeners) {
      for (const cb of eventListeners) {
        try {
          cb(...args);
        } catch (error) {
          console.warn(`Event listener error for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Emit a saga event to all Redux-style listeners with proper type safety
   */
  emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void {
    // Emit to Redux-style listeners
    const typeListeners = this.typedListeners.get(event.type);
    if (typeListeners) {
      for (const cb of typeListeners) {
        try {
          cb(event);
        } catch (error) {
          console.warn(`Saga event listener error for ${event.type}:`, error);
        }
      }
    }

    // Emit to "all events" listeners
    const allListeners = this.typedListeners.get('*');
    if (allListeners) {
      for (const cb of allListeners) {
        try {
          cb(event);
        } catch (error) {
          console.warn(`Saga event listener error for ${event.type}:`, error);
        }
      }
    }

    // Also emit to legacy listeners for backward compatibility
    this.emitLegacyEvent(event);
  }

  /**
   * Internal method to emit events to legacy listeners for backward compatibility
   */
  private emitLegacyEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void {
    const legacyListeners = this.listeners[event.type];
    if (legacyListeners) {
      let args: unknown[] = [];

      // Convert Redux-style events to legacy format
      switch (event.type) {
        case 'transaction:start':
          args = [event.transactionName, event.payload];
          break;
        case 'transaction:success':
          args = [event.transactionName, event.payload];
          break;
        case 'transaction:fail':
          args = [event.transactionName, event.error];
          break;
        case 'transaction:rollback':
          args = [event.transactionName];
          break;
        case 'step:start':
          args = [event.stepName, event.payload];
          break;
        case 'step:success':
          args = [event.stepName, event.payload];
          break;
        case 'step:retry':
          args = [event.stepName, event.attempt];
          break;
        case 'step:rollback':
          args = [event.stepName, event.payload];
          break;
        default:
          args = [event];
      }

      for (const cb of legacyListeners) {
        try {
          cb(...args);
        } catch (error) {
          console.warn(`Legacy event listener error for ${event.type}:`, error);
        }
      }
    }
  }

  /**
* Get the current state
*/
  getState(): TState {
    return this._stateManager.getState();
  }

  /**
   * Undo the last state change
   */
  undo(): void {
    this._stateManager.undo();
  }

  /**
   * Redo the last undone state change
   */
  redo(): void {
    this._stateManager.redo();
  }

  /**
   * Get performance metrics from the state manager
   */
  getPerformanceMetrics(): ReturnType<StateManager<TState>['getMetrics']> {
    return this._stateManager.getMetrics();
  }

  /**
   * Setup state change watching for reactive selectors
   */
  private setupStateWatcher(): void {
    // Keep a cloned snapshot to detect deep changes
    let currentState = structuredClone(this._stateManager.getState());

    // Use polling approach for now - in a production system, this could be
    // replaced with proper state change notifications
    const checkForChanges = () => {
      const newState = this._stateManager.getState();
      if (!deepEqual(newState, currentState)) {
        currentState = structuredClone(newState);
        this.reactiveState.set(currentState);
      }
    };

    // Check for changes after transactions and state operations
    this.onAnyEvent(() => {
      setTimeout(checkForChanges, 0);
    });

    // Also check periodically (fallback)
    this.stateWatchInterval = setInterval(checkForChanges, 100);
  }

  /**
   * Clean up resources used by the saga manager
   */
  dispose(): void {
    if (this.stateWatchInterval !== null) {
      clearInterval(this.stateWatchInterval);
      this.stateWatchInterval = null;
    }
  }

  // ===== REACTIVE SELECTOR METHODS =====

  /**
   * Create a reactive selector that automatically updates when state changes
   */
  select<TResult>(
    selector: (state: TState) => TResult,
    equalityFn?: (a: TResult, b: TResult) => boolean
  ): ReactiveSelector<TState, TResult> {
    return this.selectorFactory.createSelector(selector, equalityFn);
  }

  /**
   * Create a computed value from two reactive sources
   */
  computed<T1, T2, TResult>(
    source1: ReactiveValue<T1>,
    source2: ReactiveValue<T2>,
    combiner: (value1: T1, value2: T2) => TResult,
    equalityFn?: (a: TResult, b: TResult) => boolean
  ): ComputedValue<TResult> {
    return this.selectorFactory.createComputed(source1, source2, combiner, equalityFn);
  }

  /**
   * Create a computed value from three reactive sources
   */
  computed3<T1, T2, T3, TResult>(
    source1: ReactiveValue<T1>,
    source2: ReactiveValue<T2>,
    source3: ReactiveValue<T3>,
    combiner: (value1: T1, value2: T2, value3: T3) => TResult,
    equalityFn?: (a: TResult, b: TResult) => boolean
  ): ComputedValue<TResult> {
    return this.selectorFactory.createComputed(source1, source2, source3, combiner, equalityFn);
  }

  /**
   * Create a computed value from multiple reactive sources (type-safe alternative)
   */
  combineLatest<T extends readonly ReactiveValue<any>[]>(
    sources: T,
    combiner: (...values: { [K in keyof T]: T[K] extends ReactiveValue<infer U> ? U : never }) => any,
    equalityFn?: (a: any, b: any) => boolean
  ): ComputedValue<ReturnType<typeof combiner>> {
    return new ComputedValue(
      [...sources],
      (
        ...values: { [K in keyof T]: T[K] extends ReactiveValue<infer U> ? U : never }
      ) => combiner(...values),
      equalityFn
    );
  }

  /**
   * Create a reactive selector for a specific property
   */
  selectProperty<K extends keyof TState>(
    property: K
  ): ReactiveSelector<TState, TState[K]> {
    return this.selectorFactory.createPropertySelector(property);
  }

  /**
   * Create a reactive selector for deep property access
   */
  selectDeep<TResult>(
    path: string,
    defaultValue?: TResult
  ): ReactiveSelector<TState, TResult> {
    return this.selectorFactory.createDeepSelector(path, defaultValue);
  }

  /**
   * Create a reactive filtered array selector
   */
  selectFiltered<TItem>(
    arraySelector: (state: TState) => TItem[],
    predicate: (item: TItem) => boolean
  ): ReactiveSelector<TState, TItem[]> {
    return this.selectorFactory.createFilteredSelector(arraySelector, predicate);
  }

  /**
   * Create a reactive mapped array selector
   */
  selectMapped<TInput, TOutput>(
    arraySelector: (state: TState) => TInput[],
    mapper: (item: TInput, index: number) => TOutput
  ): ReactiveSelector<TState, TOutput[]> {
    return this.selectorFactory.createMappedSelector(arraySelector, mapper);
  }

  /**
   * Get the reactive state source for advanced usage
   */
  getReactiveState(): ReactiveValue<TState> {
    return this.reactiveState;
  }

  // ===== TRANSACTION COMPOSITION METHODS =====

  /**
   * Create a transaction composer for complex workflows
   */
  createComposer<TPayload = unknown>(name: string): TransactionComposer<TState, TPayload> {
    return this.compositionBuilder.createComposer<TPayload>(name);
  }

  /**
   * Create a sequential composition
   */
  composeSequential<TPayload = unknown>(
    name: string,
    transactions: Transaction<TState, TPayload>[]
  ): TransactionComposer<TState, TPayload> {
    return this.compositionBuilder.sequential(name, transactions);
  }

  /**
   * Create a parallel composition
   */
  composeParallel<TPayload = unknown>(
    name: string,
    transactions: Transaction<TState, TPayload>[]
  ): TransactionComposer<TState, TPayload> {
    return this.compositionBuilder.parallel(name, transactions);
  }

  /**
   * Create a conditional composition
   */
  composeConditional<TPayload = unknown>(
    name: string,
    transaction: Transaction<TState, TPayload>,
    condition: (state: TState, payload: TPayload) => boolean | Promise<boolean>
  ): TransactionComposer<TState, TPayload> {
    return this.compositionBuilder.conditional(name, transaction, condition);
  }

  /**
   * Create a composition with fallback
   */
  composeWithFallback<TPayload = unknown>(
    name: string,
    primaryTransaction: Transaction<TState, TPayload>,
    fallbackTransaction: Transaction<TState, TPayload>
  ): TransactionComposer<TState, TPayload> {
    return this.compositionBuilder.withFallback(name, primaryTransaction, fallbackTransaction);
  }

  // ===== EVENT REPLAY METHODS =====

  /**
   * Start recording events for replay
   */
  startRecording(sessionMetadata?: Record<string, unknown>): string {
    return this.replayManager.getRecorder().startRecording(sessionMetadata);
  }

  /**
   * Stop recording events
   */
  stopRecording(): EventSession | null {
    return this.replayManager.getRecorder().stopRecording();
  }

  /**
   * Get recorded events
   */
  getRecordedEvents(filter?: {
    eventTypes?: string[];
    timeRange?: { start: number; end: number };
  }): RecordedEvent<unknown>[] {
    return this.replayManager.getRecorder().getRecordedEvents(filter);
  }

  /**
   * Export recorded events
   */
  exportRecording(): string {
    return this.replayManager.getRecorder().exportEvents();
  }

  /**
   * Import and load events for replay
   */
  importRecording(jsonData: string): void {
    const { events } = this.replayManager.getRecorder().importEvents(jsonData);
    this.replayManager.getReplayer().loadEvents(events);
  }

  /**
   * Start replaying events
   */
  async startReplay(options?: ReplayOptions): Promise<void> {
    return this.replayManager.getReplayer().startReplay(options);
  }

  /**
   * Get replay manager for advanced usage
   */
  getReplayManager(): EventReplayManager<unknown> {
    return this.replayManager;
  }

  /**
   * Setup event recording
   */
  private setupEventRecording(): void {
    // Auto-record all saga events if in development mode or browser environment
    const isBrowser = typeof window !== 'undefined';
    const isDevelopment = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
      (isBrowser && (window.location.hostname === 'localhost' || window.location.protocol === 'file:'));

    if (isDevelopment || isBrowser) {
      this.onAnyEvent((event) => {
        // Only record if there's an active recording session
        if (this.replayManager.getRecorder().getIsRecording()) {
          this.replayManager.getRecorder().recordEvent(event, {
            tags: ['auto-recorded']
          });
        }
      });
    }
  }

}