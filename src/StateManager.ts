

export interface StateManagerOptions {
    maxUndoHistory?: number;
    maxSnapshots?: number;
    autoCleanup?: boolean;
    snapshotInterval?: number; // Create snapshot every N changes for performance
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

    // Performance metrics
    private metrics = {
        totalChanges: 0,
        snapshotCreations: 0,
        undoOperations: 0,
        redoOperations: 0,
        memoryOptimizations: 0
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
        this.undoStack.push(structuredClone(state));
        this.redoStack = [];
    }

    constructor(initialState: TState, options: StateManagerOptions = {}) {
        this.options = {
            maxUndoHistory: options.maxUndoHistory ?? 100,
            maxSnapshots: options.maxSnapshots ?? 20,
            autoCleanup: options.autoCleanup ?? true,
            snapshotInterval: options.snapshotInterval ?? 10
        };

        this.state = structuredClone(initialState);
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
        // Add current state to undo stack
        this.undoStack.push(structuredClone(this.state));
        this.state = structuredClone(newState);
        this.redoStack = [];
        this.changeCount++;
        this.metrics.totalChanges++;

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

    /**
     * Create a snapshot of the current state
     */
    createSnapshot(): void {
        this.snapshots.push(structuredClone(this.state));
    }

    /**
     * Rollback to the last snapshot
     */
    rollbackToLastSnapshot(): void {
        if (this.snapshots.length > 0) {
            this.state = this.snapshots.pop()!;
        }
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
            const prev = this.undoStack.pop()!;
            this.redoStack.push(structuredClone(this.state));
            this.state = prev;
            this.metrics.undoOperations++;
        }
    }

    /**
     * Redo the last undone state change
     */
    redo(): void {
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop()!;
            this.undoStack.push(structuredClone(this.state));
            this.state = next;
            this.metrics.redoOperations++;
        }
    }

    /**
     * Get performance metrics
     */
    getMetrics(): typeof this.metrics & {
        undoStackSize: number;
        redoStackSize: number;
        snapshotCount: number;
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
            memoryEstimate: `~${Math.round((undoSize + redoSize + snapshotSize) * 0.1)}KB estimated`
        };
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