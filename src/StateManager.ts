
import type { Observer, Subscription } from './BehaviorSubject';
import { deepEqual, shallowEqual, getNestedProperty, SubscriptionManager, isDebugEnabled } from './utils';
import { Store, type EqualityFn, Stream, selectSignal } from './statekit';
import type { Signal } from './statekit';

export interface StateManagerOptions {
    maxUndoHistory?: number;
    maxSnapshots?: number;
    autoCleanup?: boolean;
    snapshotInterval?: number; // Create snapshot every N changes for performance
    clone?: <T>(value: T) => T;
    // Custom equality function for change detection
    equalityFn?: <T>(a: T, b: T) => boolean;
}

/**
 * StateManager handles state management with undo/redo functionality and snapshots
 * Now includes performance optimizations like configurable limits and metrics
 */
export class StateManager<TState extends object> {
    private state: TState;
    private snapshots: TState[] = [];
    private undoStack: TState[] = [];
    private redoStack: TState[] = [];
    private options: Required<StateManagerOptions>;
    private changeCount = 0;

    // Reactive updates are driven by statekit.Store
    private subscriptionManager = new SubscriptionManager();
    private stateStream = new Stream<TState>();

    // Running state tracking
    private isRunning = false;
    private activeTimers = new Set<NodeJS.Timeout>();
    private debugMode = false;
    // statekit store as core engine
    private store: Store<TState> | null = null;
    private storeUnsub: (() => void) | null = null;
    private proxyMutationDepth = 0;

    // Performance metrics
    private metrics = {
        totalChanges: 0,
        snapshotCreations: 0,
        undoOperations: 0,
        redoOperations: 0,
        memoryOptimizations: 0,
        immediateNotifications: 0
    };

    // Expose read-only access to internal state for testing
    public get undoStackLength(): number {
        return this.undoStack.length;
    }

    public get redoStackLength(): number {
        return this.redoStack.length;
    }

    public get snapshotsLength(): number {
        return this.snapshots.length;
    }

    // For backward compatibility - expose snapshots for testing
    public get snapshotsList(): TState[] {
        return [...this.snapshots];
    }

    /**
     * Add a state to the undo stack (for internal use by transactions)
     */
    public addToUndoStack(state: TState): void {
        this.undoStack.push(this.options.clone(state));
        this.redoStack = [];
    }

    constructor(initialState: TState, options: StateManagerOptions = {}) {
        this.options = {
            maxUndoHistory: options.maxUndoHistory ?? 100,
            maxSnapshots: options.maxSnapshots ?? 20,
            autoCleanup: options.autoCleanup ?? true,
            snapshotInterval: options.snapshotInterval ?? 10,
            clone: options.clone ?? (this.defaultClone.bind(this)),
            equalityFn: options.equalityFn ?? this.defaultEquals.bind(this)
        };

        this.state = this.options.clone(initialState);
        this.isRunning = true;
        this.debugMode = isDebugEnabled();

        if (this.debugMode) {
            console.log('🏁 StateManager started');
        }

        // Reactive updates powered by statekit.Store

        // Initialize statekit store as the underlying notifier
        this.store = new Store<TState>({
            initialState: this.state,
            // Use identity equality for store-level updates so proxy mutations can be propagated
            equality: ((a: unknown, b: unknown) => Object.is(a, b)) as unknown as EqualityFn<unknown>
        });
        this.storeUnsub = this.store.subscribe(() => {
            if (!this.store) return;
            // Sync internal state; subscribers are notified in subscribe()
            this.state = this.store.getState();
            this.stateStream.next(this.state);
            this.metrics.immediateNotifications++;
        });
    }

    // ValueSignal is a small adapter to provide `.value` and value-based subscribe semantics
    private toValueSignal<T>(sig: import('./statekit').Signal<T>): { get(): T; subscribe(observer: (value: T) => void): () => void; readonly value: T } {
        return {
            get: () => sig.get(),
            subscribe: (observer: (value: T) => void) => {
                // immediate emit
                try { observer(sig.get()); } catch { }
                return sig.subscribe(() => {
                    try { observer(sig.get()); } catch { }
                });
            },
            get value() { return sig.get(); }
        };
    }

    /**
     * Get the current state
     */
    getState(): TState {
        return this.state;
    }

    /**
     * Set new state and add current state to undo stack
     */
    setState(newState: TState): void {
        const clonedNewState = this.options.clone(newState);

        // Optimized equality check: shallow first, then deep if needed
        const hasChanged = !shallowEqual(this.state, clonedNewState) &&
            !this.options.equalityFn(this.state, clonedNewState);

        if (hasChanged) {
            // Add current state to undo stack
            this.undoStack.push(this.options.clone(this.state));
            this.redoStack = [];
            this.changeCount++;
            this.metrics.totalChanges++;

            // Apply via statekit store to drive notifications
            if (this.store) {
                this.store.setState(() => clonedNewState);
            } else {
                this.state = clonedNewState;
                this.stateStream.next(this.state);
                this.metrics.immediateNotifications++;
            }

            // Create snapshot periodically for performance
            if (this.changeCount >= this.options.snapshotInterval) {
                this.createSnapshot();
                this.changeCount = 0;
                this.metrics.snapshotCreations++;
            }

            // Auto cleanup if enabled
            if (this.options.autoCleanup) {
                this.performCleanup();
            }
        }
    }

    /**
     * Create a snapshot of the current state
     */
    createSnapshot(): void {
        this.snapshots.push(this.options.clone(this.state));
    }

    /**
     * Discard the last snapshot without altering state
     */
    discardLastSnapshot(): void {
        if (this.snapshots.length > 0) {
            this.snapshots.pop();
        }
    }

    /**
     * Undo the last state change
     */
    undo(): void {
        if (this.undoStack.length > 0) {
            const prev = this.undoStack.pop();
            if (prev) {
                // Push current state to redo stack for future redo
                this.redoStack.push(this.options.clone(this.state));
                this.state = prev;
                this.metrics.undoOperations++;

                // Notify subscribers immediately
                this.stateStream.next(this.state);
                this.metrics.immediateNotifications++;
            }
        }
    }

    /**
     * Redo the last undone state change
     */
    redo(): void {
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop();
            if (next) {
                // Push current state to undo stack so we can undo the redo
                this.undoStack.push(this.options.clone(this.state));
                this.state = next;
                this.metrics.redoOperations++;

                // Subscribers will be notified through store subscription path
                this.metrics.immediateNotifications++;
            }
        }
    }

    /**
     * Get performance metrics including reactivity stats
     */
    getMetrics(): typeof this.metrics & {
        undoStackSize: number;
        redoStackSize: number;
        snapshotCount: number;
        activeSubscriptions: number;
        memoryEstimate: string;
    } {
        const undoSize = this.undoStack.length;
        const redoSize = this.redoStack.length;
        const snapshotSize = this.snapshots.length;

        return {
            ...this.metrics,
            undoStackSize: undoSize,
            redoStackSize: redoSize,
            snapshotCount: snapshotSize,
            activeSubscriptions: this.subscriptionManager.getActiveCount(),
            memoryEstimate: `~${Math.round((undoSize + redoSize + snapshotSize) * 0.1)}KB estimated`
        };
    }

    /**
     * Subscribe to state changes with immediate notification
     */
    subscribe(observer: Observer<TState>): Subscription {
        // Emit current state immediately and then on stream updates
        try { observer(this.state); } catch { }
        const unsubscribe = this.stateStream.subscribe(() => {
            try { observer(this.state); } catch { }
        });
        this.subscriptionManager.add(unsubscribe);
        return () => {
            unsubscribe();
            this.subscriptionManager.remove(unsubscribe);
        };
    }

    /**
     * Notify subscribers of state changes (for cases where state was mutated directly)
     */
    notifyChange(): void {
        if (!this.isRunning) {
            if (this.debugMode) {
                console.log('⚠️ StateManager not running, skipping notification');
            }
            return;
        }
        if (this.proxyMutationDepth > 0) {
            // During proxy mutation, emit directly to subscribers without changing identity
            this.stateStream.next(this.state);
            this.metrics.immediateNotifications++;
            return;
        }
        // Outside proxy mutation, sync through store for signals/selectors
        if (this.store) {
            this.store.replaceState(this.options.clone(this.state));
        } else {
            this.stateStream.next(this.state);
            this.metrics.immediateNotifications++;
        }
    }

    /** Begin a mutation session driven by ReactiveStateProxy */
    beginProxyMutation(): void {
        this.proxyMutationDepth++;
    }

    /** End a mutation session; optionally commit to store */
    endProxyMutation(commit: boolean = true): void {
        if (this.proxyMutationDepth > 0) this.proxyMutationDepth--;
        if (commit) this.commitProxyMutations();
    }

    /** Replace store state to propagate final proxy mutations to signals/selectors */
    commitProxyMutations(): void {
        if (!this.store) return;
        this.store.replaceState(this.options.clone(this.state));
    }

    /**
     * Check if StateManager is running
     */
    get running(): boolean {
        return this.isRunning;
    }

    /**
     * Stop the StateManager and clean up resources
     */
    stop(): void {
        if (this.debugMode) {
            console.log('🛑 Stopping StateManager...');
            console.log(`📊 Active timers before cleanup: ${this.activeTimers.size}`);
        }

        this.isRunning = false;

        // Clear all active timers
        for (const timer of this.activeTimers) {
            clearTimeout(timer);
            if (this.debugMode) {
                console.log('⏰ Cleared timer:', timer);
            }
        }
        this.activeTimers.clear();

        // No subject to complete
        this.subscriptionManager.unsubscribeAll();

        // Dispose statekit store subscription
        if (this.storeUnsub) {
            this.storeUnsub();
            this.storeUnsub = null;
        }

        if (this.debugMode) {
            console.log('🏁 StateManager stopped');
        }
    }

    /**
     * Register a timer for tracking
     */
    registerTimer(timer: NodeJS.Timeout): void {
        this.activeTimers.add(timer);
        if (this.debugMode) {
            console.log(`⏰ Registered timer, total active: ${this.activeTimers.size}`);
        }
    }

    /**
     * Unregister a timer
     */
    unregisterTimer(timer: NodeJS.Timeout): void {
        this.activeTimers.delete(timer);
        if (this.debugMode) {
            console.log(`⏰ Unregistered timer, total active: ${this.activeTimers.size}`);
        }
    }

    /**
     * Get debug information about running state
     */
    getDebugInfo(): { isRunning: boolean; activeTimers: number; subscriptions: number } {
        return {
            isRunning: this.isRunning,
            activeTimers: this.activeTimers.size,
            subscriptions: this.subscriptionManager.getActiveCount()
        };
    }

    /**
     * Create a reactive selector that automatically updates
     */
    select<TResult>(
        selector: (state: TState) => TResult,
        equalityFn?: (a: TResult, b: TResult) => boolean
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult } {
        const eq = equalityFn ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b));
        const sig = selectSignal(this.store as Store<TState>, selector, eq) as Signal<TResult>;
        return this.toValueSignal(sig);
    }

    /**
     * Create a property selector with automatic updates
     */
    selectProperty<K extends keyof TState>(property: K): { get(): TState[K]; subscribe(observer: (value: TState[K]) => void): () => void; readonly value: TState[K] } {
        return this.select(state => state[property]);
    }

    /**
     * Create a deep path selector (e.g., "user.profile.name")
     */
    selectPath<TResult>(path: string, defaultValue: TResult): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult };
    selectPath<TResult>(path: string): { get(): TResult | undefined; subscribe(observer: (value: TResult | undefined) => void): () => void; readonly value: TResult | undefined };
    selectPath<TResult>(path: string, defaultValue?: TResult): { get(): TResult | undefined; subscribe(observer: (value: TResult | undefined) => void): () => void; readonly value: TResult | undefined } {
        return this.select(state => {
            return getNestedProperty<TResult>(state, path, defaultValue);
        });
    }

    /**
     * Combine multiple selectors into one reactive value
     */
    combine<T1, T2, TResult>(
        selector1: (state: TState) => T1,
        selector2: (state: TState) => T2,
        combiner: (val1: T1, val2: T2) => TResult
    ): { get(): TResult; subscribe(observer: (value: TResult) => void): () => void; readonly value: TResult } {
        return this.select(state =>
            combiner(selector1(state), selector2(state))
        );
    }

    /**
     * Rollback to the last snapshot with immediate notification
     */
    rollbackToLastSnapshot(): void {
        if (this.snapshots.length > 0) {
            const snapshot = this.snapshots.pop();
            if (snapshot) {
                this.state = snapshot;

                this.stateStream.next(this.state);
                this.metrics.immediateNotifications++;
            }
        }
    }

    /**
     * Dispose and clean up all subscriptions
     */
    dispose(): void {
        // Clean up all subscriptions using subscription manager
        this.subscriptionManager.dispose();

        // No subject to complete

        // Dispose statekit store subscription
        if (this.storeUnsub) {
            this.storeUnsub();
            this.storeUnsub = null;
        }

        // Clear state history
        this.undoStack = [];
        this.redoStack = [];
        this.snapshots = [];
    }

    /**
     * Default equality function with deep comparison
     */
    private defaultEquals<T>(a: T, b: T): boolean {
        return deepEqual(a, b);
    }

    /**
     * Default deep clone that preserves undefined values in arrays and objects
     */
    private defaultClone<T>(value: T): T {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            const source = value as unknown as any[];
            const cloneArr = new Array(source.length) as any[];
            for (let i = 0; i < source.length; i++) {
                // Preserve explicit undefined entries
                cloneArr[i] = this.defaultClone(source[i] as any);
            }
            return cloneArr as unknown as T;
        }
        const sourceObj = value as unknown as Record<string, unknown>;
        const cloneObj: Record<string, unknown> = {};
        for (const key of Object.keys(sourceObj)) {
            cloneObj[key] = this.defaultClone(sourceObj[key] as any);
        }
        return cloneObj as unknown as T;
    }

    /**
     * Clean up old data to manage memory usage
     */
    private performCleanup(): void {
        // Limit undo stack size
        if (this.undoStack.length > this.options.maxUndoHistory) {
            this.undoStack = this.undoStack.slice(-this.options.maxUndoHistory);
            this.metrics.memoryOptimizations++;
        }

        // Limit snapshots
        if (this.snapshots.length > this.options.maxSnapshots) {
            this.snapshots = this.snapshots.slice(-this.options.maxSnapshots);
            this.metrics.memoryOptimizations++;
        }

        // Limit redo stack (shouldn't grow too large but just in case)
        if (this.redoStack.length > this.options.maxUndoHistory) {
            this.redoStack = this.redoStack.slice(-this.options.maxUndoHistory);
            this.metrics.memoryOptimizations++;
        }
    }
}