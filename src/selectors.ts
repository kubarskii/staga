/**
 * Redux-style selector patterns for type-safe state access
 * Inspired by Redux Toolkit and Reselect patterns
 */

/**
 * Creates a typed selector function with memoization support
 */
export function createSelector<TState extends object, TResult>(
    selector: (state: TState) => TResult
): (state: TState) => TResult {
    let lastState: TState | undefined;
    let lastResult: TResult;

    return (state: TState): TResult => {
        // Simple memoization - in a real implementation you might want deep equality
        if (state !== lastState) {
            lastState = state;
            lastResult = selector(state);
        }
        return lastResult;
    };
}

/**
 * Creates a parameterized selector with memoization
 */
export function createParameterizedSelector<TState extends object, TParams, TResult>(
    selector: (state: TState, params: TParams) => TResult
): (state: TState, params: TParams) => TResult {
    const cache = new Map<string, TResult>();

    return (state: TState, params: TParams): TResult => {
        const key = JSON.stringify({ state, params });

        if (!cache.has(key)) {
            cache.set(key, selector(state, params));

            // Simple cache cleanup to prevent memory leaks
            if (cache.size > 100) {
                const firstKey = cache.keys().next().value;
                if (firstKey !== undefined) {
                    cache.delete(firstKey);
                }
            }
        }

        return cache.get(key)!;
    };
}

/**
 * Selector factory for common state patterns
 */
export class SelectorFactory {
    /**
     * Creates a selector for a nested property path
     */
    static createPropertySelector<TState extends object, K extends keyof TState>(
        property: K
    ) {
        return createSelector((state: TState) => state[property]);
    }

    /**
     * Creates a selector for deep nested properties
     */
    static createDeepSelector<TState extends object, TResult>(
        path: string,
        defaultValue?: TResult
    ) {
        return createSelector((state: TState): TResult => {
            const result = path.split('.').reduce((obj: any, key) => obj?.[key], state);
            return result !== undefined ? result : defaultValue as TResult;
        });
    }

    /**
     * Creates a filtering selector
     */
    static createFilterSelector<TState extends object, TItem>(
        arraySelector: (state: TState) => TItem[],
        predicate: (item: TItem) => boolean
    ) {
        return createSelector((state: TState) =>
            arraySelector(state).filter(predicate)
        );
    }

    /**
     * Creates a mapping selector
     */
    static createMapSelector<TState extends object, TInput, TOutput>(
        selector: (state: TState) => TInput[],
        mapper: (item: TInput, index: number) => TOutput
    ) {
        return createSelector((state: TState) =>
            selector(state).map(mapper)
        );
    }

    /**
     * Creates a computed selector that derives data from multiple selectors
     */
    static createComputedSelector<TState extends object, T1, T2, TResult>(
        selector1: (state: TState) => T1,
        selector2: (state: TState) => T2,
        combiner: (value1: T1, value2: T2) => TResult
    ) {
        return createSelector((state: TState) =>
            combiner(selector1(state), selector2(state))
        );
    }
}

/**
 * Built-in selectors for StateManager
 */
export class StateSelectors<TState extends object> {
    constructor(private getState: () => TState) { }

    /**
     * Get the current state
     */
    getCurrentState = (): TState => this.getState();

    /**
     * Check if state has a specific property
     */
    hasProperty = (property: keyof TState): boolean => {
        const state = this.getState();
        return property in state;
    };

    /**
     * Get a property value with type safety
     */
    getProperty = <K extends keyof TState>(property: K): TState[K] => {
        return this.getState()[property];
    };

    /**
     * Get multiple properties as an object
     */
    getProperties = <K extends keyof TState>(
        ...properties: K[]
    ): Pick<TState, K> => {
        const state = this.getState();
        const result = {} as Pick<TState, K>;

        for (const prop of properties) {
            result[prop] = state[prop];
        }

        return result;
    };

    /**
     * Create a derived selector
     */
    createDerivedSelector = <TResult>(
        deriveFn: (state: TState) => TResult
    ) => {
        return createSelector(deriveFn);
    };
}

/**
 * Utility types for selector patterns
 */
export type Selector<TState, TResult> = (state: TState) => TResult;
export type ParameterizedSelector<TState, TParams, TResult> = (
    state: TState,
    params: TParams
) => TResult;

export type InferSelectorState<T> = T extends Selector<infer TState, any>
    ? TState
    : never;

export type InferSelectorResult<T> = T extends Selector<any, infer TResult>
    ? TResult
    : never;