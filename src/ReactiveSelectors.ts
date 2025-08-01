/**
 * Reactive selector system for automatic computed state values
 * Provides observable selectors that automatically update when dependencies change
 */

export type SelectorSubscription = () => void;
export type StateChangeListener<T> = (newValue: T, oldValue: T) => void;

/**
 * Base interface for reactive values
 */
export interface ReactiveValue<T> {
    readonly value: T;
    subscribe(listener: StateChangeListener<T>): SelectorSubscription;
    get(): T;
}

/**
 * Simple observable implementation for reactive values
 */
export class Observable<T> implements ReactiveValue<T> {
    private _value: T;
    private listeners: Set<StateChangeListener<T>> = new Set();

    constructor(initialValue: T) {
        this._value = initialValue;
    }

    get value(): T {
        return this._value;
    }

    get(): T {
        return this._value;
    }

    set(newValue: T): void {
        const oldValue = this._value;
        if (oldValue !== newValue) {
            this._value = newValue;
            this.notifyListeners(newValue, oldValue);
        }
    }

    subscribe(listener: StateChangeListener<T>): SelectorSubscription {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(newValue: T, oldValue: T): void {
        for (const listener of this.listeners) {
            try {
                listener(newValue, oldValue);
            } catch (error) {
                console.error('Reactive selector listener error:', error);
            }
        }
    }
}

/**
 * Reactive selector that automatically updates when its dependencies change
 */
export class ReactiveSelector<TState extends object, TResult> implements ReactiveValue<TResult> {
    private _cachedValue: TResult;
    private _isValid = false;
    private listeners: Set<StateChangeListener<TResult>> = new Set();
    private dependencies: Set<ReactiveValue<any>> = new Set();
    private subscriptions: Set<SelectorSubscription> = new Set();

    constructor(
        private stateSource: ReactiveValue<TState>,
        private selector: (state: TState) => TResult,
        private equalityFn: (a: TResult, b: TResult) => boolean = Object.is
    ) {
        this._cachedValue = this.computeValue();
        this._isValid = true;

        // Subscribe to state changes
        const subscription = this.stateSource.subscribe(() => {
            this.invalidate();
        });
        this.subscriptions.add(subscription);
    }

    get value(): TResult {
        if (!this._isValid) {
            this.recompute();
        }
        return this._cachedValue;
    }

    get(): TResult {
        return this.value;
    }

    subscribe(listener: StateChangeListener<TResult>): SelectorSubscription {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Force recomputation of the selector value
     */
    recompute(): void {
        const newValue = this.computeValue();
        if (!this.equalityFn(this._cachedValue, newValue)) {
            const oldValue = this._cachedValue;
            this._cachedValue = newValue;
            this.notifyListeners(newValue, oldValue);
        }
        this._isValid = true;
    }

    /**
     * Mark selector as needing recomputation
     */
    private invalidate(): void {
        if (this._isValid) {
            this._isValid = false;
            // Schedule recomputation on next access or immediately if there are listeners
            if (this.listeners.size > 0) {
                this.recompute();
            }
        }
    }

    private computeValue(): TResult {
        return this.selector(this.stateSource.value);
    }

    private notifyListeners(newValue: TResult, oldValue: TResult): void {
        for (const listener of this.listeners) {
            try {
                listener(newValue, oldValue);
            } catch (error) {
                console.error('Reactive selector listener error:', error);
            }
        }
    }

    /**
     * Chain another selector transformation
     */
    select<TNext>(
        nextSelector: (value: TResult) => TNext,
        equalityFn?: (a: TNext, b: TNext) => boolean
    ): ReactiveSelector<TState, TNext> {
        const combinedSelector = (state: TState) => nextSelector(this.selector(state));
        return new ReactiveSelector(this.stateSource, combinedSelector, equalityFn);
    }

    /**
     * Clean up subscriptions and listeners
     */
    dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription();
        }
        this.subscriptions.clear();
        this.listeners.clear();
        this.dependencies.clear();
    }
}

/**
 * Computed value that depends on multiple reactive sources
 */
export class ComputedValue<T> implements ReactiveValue<T> {
    private _cachedValue: T;
    private _isValid = false;
    private listeners: Set<StateChangeListener<T>> = new Set();
    private subscriptions: Set<SelectorSubscription> = new Set();

    constructor(
        private dependencies: ReactiveValue<any>[],
        private computeFn: (...values: any[]) => T,
        private equalityFn: (a: T, b: T) => boolean = Object.is
    ) {
        this._cachedValue = this.computeValue();
        this._isValid = true;

        // Subscribe to all dependencies
        for (const dep of dependencies) {
            const subscription = dep.subscribe(() => {
                this.invalidate();
            });
            this.subscriptions.add(subscription);
        }
    }

    get value(): T {
        if (!this._isValid) {
            this.recompute();
        }
        return this._cachedValue;
    }

    get(): T {
        return this.value;
    }

    subscribe(listener: StateChangeListener<T>): SelectorSubscription {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private recompute(): void {
        const newValue = this.computeValue();
        if (!this.equalityFn(this._cachedValue, newValue)) {
            const oldValue = this._cachedValue;
            this._cachedValue = newValue;
            this.notifyListeners(newValue, oldValue);
        }
        this._isValid = true;
    }

    private invalidate(): void {
        if (this._isValid) {
            this._isValid = false;
            if (this.listeners.size > 0) {
                this.recompute();
            }
        }
    }

    private computeValue(): T {
        const values = this.dependencies.map(dep => dep.value);
        return this.computeFn(...values);
    }

    private notifyListeners(newValue: T, oldValue: T): void {
        for (const listener of this.listeners) {
            try {
                listener(newValue, oldValue);
            } catch (error) {
                console.error('Computed value listener error:', error);
            }
        }
    }

    dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription();
        }
        this.subscriptions.clear();
        this.listeners.clear();
    }
}

/**
 * Factory for creating reactive selectors
 */
export class ReactiveSelectorFactory<TState extends object> {
    constructor(private stateSource: ReactiveValue<TState>) { }

    /**
     * Create a reactive selector
     */
    createSelector<TResult>(
        selector: (state: TState) => TResult,
        equalityFn?: (a: TResult, b: TResult) => boolean
    ): ReactiveSelector<TState, TResult> {
        return new ReactiveSelector(this.stateSource, selector, equalityFn);
    }

    /**
     * Create a computed value from multiple selectors
     */
    createComputed<T1, T2, TResult>(
        selector1: ReactiveValue<T1>,
        selector2: ReactiveValue<T2>,
        combiner: (value1: T1, value2: T2) => TResult,
        equalityFn?: (a: TResult, b: TResult) => boolean
    ): ComputedValue<TResult>;
    createComputed<T1, T2, T3, TResult>(
        selector1: ReactiveValue<T1>,
        selector2: ReactiveValue<T2>,
        selector3: ReactiveValue<T3>,
        combiner: (value1: T1, value2: T2, value3: T3) => TResult,
        equalityFn?: (a: TResult, b: TResult) => boolean
    ): ComputedValue<TResult>;
    createComputed<TResult>(
        ...args: any[]
    ): ComputedValue<TResult> {
        if (args.length === 3) {
            // 2-source: [source1, source2, combiner]
            return new ComputedValue([args[0], args[1]], args[2]);
        } else if (args.length === 4) {
            // Check if this is 2-source with equalityFn OR 3-source without equalityFn
            // Simple heuristic: assume 2-source with equalityFn if all first 2 args have .value property
            const hasValueProp = args[0]?.value !== undefined && args[1]?.value !== undefined;
            if (hasValueProp && args[2]?.value === undefined) {
                // 2-source with equalityFn: [source1, source2, combiner, equalityFn]
                return new ComputedValue([args[0], args[1]], args[2], args[3]);
            } else {
                // 3-source: [source1, source2, source3, combiner]
                return new ComputedValue([args[0], args[1], args[2]], args[3]);
            }
        } else if (args.length === 5) {
            // 3-source with equalityFn: [source1, source2, source3, combiner, equalityFn]
            return new ComputedValue([args[0], args[1], args[2]], args[3], args[4]);
        } else {
            throw new Error(`Invalid number of arguments for createComputed: ${args.length}`);
        }
    }

    /**
     * Create a filtered array selector
     */
    createFilteredSelector<TItem>(
        arraySelector: (state: TState) => TItem[],
        predicate: (item: TItem) => boolean
    ): ReactiveSelector<TState, TItem[]> {
        return this.createSelector(state =>
            arraySelector(state).filter(predicate)
        );
    }

    /**
     * Create a mapped array selector
     */
    createMappedSelector<TInput, TOutput>(
        arraySelector: (state: TState) => TInput[],
        mapper: (item: TInput, index: number) => TOutput
    ): ReactiveSelector<TState, TOutput[]> {
        return this.createSelector(state =>
            arraySelector(state).map(mapper)
        );
    }

    /**
     * Create a property selector
     */
    createPropertySelector<K extends keyof TState>(
        property: K
    ): ReactiveSelector<TState, TState[K]> {
        return this.createSelector(state => state[property]);
    }

    /**
     * Create a deep property selector
     */
    createDeepSelector<TResult>(
        path: string,
        defaultValue?: TResult
    ): ReactiveSelector<TState, TResult> {
        return this.createSelector(state => {
            const result = path.split('.').reduce((obj: any, key) => obj?.[key], state);
            return result !== undefined ? result : defaultValue as TResult;
        });
    }
}

/**
 * Utility functions for reactive selectors
 */
export const ReactiveUtils = {
    /**
     * Create an observable from a regular value
     */
    from<T>(value: T): Observable<T> {
        return new Observable(value);
    },

    /**
     * Combine multiple reactive values into one
     */
    combine<T extends readonly ReactiveValue<any>[]>(
        sources: T,
        combiner: (...values: { [K in keyof T]: T[K] extends ReactiveValue<infer U> ? U : never }) => any
    ): ComputedValue<ReturnType<typeof combiner>> {
        return new ComputedValue(
            [...sources],
            (...values) => combiner(...values as any)
        );
    },

    /**
     * Create a selector that debounces changes
     */
    debounce<T>(
        source: ReactiveValue<T>,
        delayMs: number
    ): ReactiveValue<T> {
        const debounced = new Observable(source.value);
        let timeoutId: NodeJS.Timeout | null = null;

        source.subscribe((newValue) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                debounced.set(newValue);
                timeoutId = null;
            }, delayMs);
        });

        return debounced;
    },

    /**
     * Create a selector that only emits distinct values
     */
    distinct<T>(
        source: ReactiveValue<T>,
        equalityFn: (a: T, b: T) => boolean = Object.is
    ): ReactiveValue<T> {
        const distinct = new Observable(source.value);
        let lastValue = source.value;

        source.subscribe((newValue) => {
            if (!equalityFn(lastValue, newValue)) {
                lastValue = newValue;
                distinct.set(newValue);
            }
        });

        return distinct;
    }
};

/**
 * Deep equality function for complex objects
 */
export function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }

    return false;
}