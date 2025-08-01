/**
 * Enhanced TypeScript utilities for better inference and stricter types
 */

// ===== UTILITY TYPES =====

/**
 * Make specific properties required while keeping others optional
 */
export type RequireProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional while keeping others required
 */
export type PartialProps<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends (infer U)[]
    ? DeepReadonly<U>[]
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};

/**
 * Extract function parameters as a tuple
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * Extract function return type
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

/**
 * Conditional types for better inference
 */
export type If<C extends boolean, T, F> = C extends true ? T : F;

/**
 * Type-safe keys of an object
 */
export type KeysOfType<T, U> = {
    [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Get the type of array elements
 */
export type ArrayElement<T> = T extends (infer E)[] ? E : never;

/**
 * Branded types for type safety
 */
export type Brand<T, B> = T & { __brand: B };

// ===== STATE MANAGEMENT TYPES =====

/**
 * Enhanced state constraint with better error messages
 */
export type ValidState<T> = T extends object
    ? {} extends T
    ? never // Empty object not allowed
    : T extends any[]
    ? never // Arrays not allowed as top-level state
    : T extends Function
    ? never // Functions not allowed
    : T
    : never;

/**
 * Transaction payload constraint
 */
export type ValidPayload<T> = T extends undefined | null | void
    ? T
    : T extends object | string | number | boolean
    ? T
    : never;

/**
 * Step function with enhanced typing
 */
export type TypedStepFunction<TState extends object, TPayload = unknown> =
    (state: TState, payload: TPayload) => void | Promise<void>;

/**
 * Compensation function with enhanced typing
 */
export type TypedCompensateFunction<TState extends object, TPayload = unknown> =
    (state: TState, payload: TPayload) => void | Promise<void>;

// ===== SELECTOR TYPES =====

/**
 * Enhanced selector type with dependency tracking
 */
export interface TypedSelector<TState extends object, TResult> {
    (state: TState): TResult;
    __selectorBrand: 'TypedSelector';
    __stateBrand: TState;
    __resultBrand: TResult;
}

/**
 * Create a typed selector with compile-time validation
 */
export function createTypedSelector<TState extends object, TResult>(
    selector: (state: TState) => TResult
): TypedSelector<TState, TResult> {
    const typedSelector = selector as TypedSelector<TState, TResult>;
    return typedSelector;
}

/**
 * Infer state type from selector
 */
export type InferSelectorState<T> = T extends TypedSelector<infer TState, any> ? TState : never;

/**
 * Infer result type from selector
 */
export type InferSelectorResult<T> = T extends TypedSelector<any, infer TResult> ? TResult : never;

/**
 * Compose multiple selectors with type safety
 */
export type ComposedSelector<T extends ReadonlyArray<TypedSelector<any, any>>> = {
    [K in keyof T]: T[K] extends TypedSelector<any, infer R> ? R : never;
};

// ===== TRANSACTION TYPES =====

/**
 * Enhanced transaction step with better typing
 */
export interface TypedStep<TState extends object, TPayload = unknown> {
    name: string;
    execute: TypedStepFunction<TState, TPayload>;
    compensate?: TypedCompensateFunction<TState, TPayload>;
    options?: {
        retries?: number;
        timeout?: number;
        priority?: number;
    };
}

/**
 * Transaction builder with enhanced type safety
 */
export interface TypedTransactionBuilder<TState extends object, TPayload = unknown> {
    addStep(step: TypedStep<TState, TPayload>): TypedTransactionBuilder<TState, TPayload>;
    addStep(
        name: string,
        execute: TypedStepFunction<TState, TPayload>,
        compensate?: TypedCompensateFunction<TState, TPayload>,
        options?: TypedStep<TState, TPayload>['options']
    ): TypedTransactionBuilder<TState, TPayload>;
    run(payload: TPayload): Promise<void>;
}

// ===== EVENT TYPES =====

/**
 * Enhanced event type with strict payload typing
 */
export interface TypedSagaEvent<TType extends string, TPayload = unknown> {
    type: TType;
    payload: TPayload;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

/**
 * Event listener with enhanced typing
 */
export type TypedEventListener<TEvent extends TypedSagaEvent<any, any>> =
    (event: TEvent) => void | Promise<void>;

/**
 * Event emitter with type safety
 */
export interface TypedEventEmitter<TEventMap extends Record<string, any>> {
    emit<K extends keyof TEventMap>(
        type: K,
        payload: TEventMap[K]
    ): void;

    on<K extends keyof TEventMap>(
        type: K,
        listener: TypedEventListener<TypedSagaEvent<K & string, TEventMap[K]>>
    ): () => void;
}

// ===== MIDDLEWARE TYPES =====

/**
 * Enhanced middleware with better context typing
 */
export interface TypedMiddlewareContext<TState extends object, TPayload = unknown> {
    readonly state: DeepReadonly<TState>;
    setState(updater: (draft: TState) => void | TState): void;
    getPayload(): TPayload;
    getTransactionName(): string;
    getStepName(): string | null;
    abort(reason?: string): never;
}

/**
 * Typed middleware function
 */
export type TypedMiddleware<TState extends object, TPayload = unknown> =
    (context: TypedMiddlewareContext<TState, TPayload>, next: () => Promise<void>) => Promise<void>;

// ===== TYPE GUARDS =====

/**
 * Type guard for valid state
 */
export function isValidState<T>(value: unknown): value is ValidState<T> {
    return (
        value !== null &&
        value !== undefined &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value !== 'function' &&
        Object.keys(value).length > 0
    );
}

/**
 * Type guard for valid payload
 */
export function isValidPayload<T>(value: unknown): value is ValidPayload<T> {
    return (
        value === undefined ||
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (typeof value === 'object' && value !== null)
    );
}

// ===== ASSERTION FUNCTIONS =====

/**
 * Assert that a value is a valid state
 */
export function assertValidState<T>(value: unknown, message?: string): asserts value is ValidState<T> {
    if (!isValidState(value)) {
        throw new TypeError(message || 'Invalid state: must be a non-empty object');
    }
}

/**
 * Assert that a value is a valid payload
 */
export function assertValidPayload<T>(value: unknown, message?: string): asserts value is ValidPayload<T> {
    if (!isValidPayload(value)) {
        throw new TypeError(message || 'Invalid payload: must be a primitive or object');
    }
}

// ===== BRANDED TYPES FOR DOMAIN SAFETY =====

export type TransactionId = Brand<string, 'TransactionId'>;
export type StepId = Brand<string, 'StepId'>;
export type StateVersion = Brand<number, 'StateVersion'>;
export type EventId = Brand<string, 'EventId'>;

/**
 * Create a branded transaction ID
 */
export function createTransactionId(value: string): TransactionId {
    return value as TransactionId;
}

/**
 * Create a branded step ID
 */
export function createStepId(value: string): StepId {
    return value as StepId;
}

/**
 * Create a branded state version
 */
export function createStateVersion(value: number): StateVersion {
    return value as StateVersion;
}

/**
 * Create a branded event ID
 */
export function createEventId(value: string): EventId {
    return value as EventId;
}

// ===== ADVANCED CONSTRAINT TYPES =====

/**
 * Ensure a type has specific required properties
 */
export type MustHave<T, K extends string> = T & Record<K, unknown>;

/**
 * Ensure a type doesn't have specific properties
 */
export type MustNotHave<T, K extends string> = T & { [P in K]?: never };

/**
 * Constrain object to have only specific keys
 */
export type ExactKeys<T, K extends keyof T> = Pick<T, K> & { [P in Exclude<keyof T, K>]?: never };

/**
 * Type for immutable operations
 */
export type ImmutableOperation<T> = (value: DeepReadonly<T>) => T;

/**
 * Builder pattern constraint
 */
export type Builder<T> = {
    [K in keyof T]-?: (value: T[K]) => Builder<T>;
} & {
    build(): T;
};

// ===== TYPE UTILITIES FOR COMPILE-TIME VALIDATION =====

/**
 * Compile-time check that two types are equal
 */
export type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

/**
 * Compile-time check that a type extends another
 */
export type AssertExtends<T, U> = T extends U ? true : false;

/**
 * Get compile-time error if condition is false
 */
export type Assert<T extends true> = T;

/**
 * Create compile-time tests
 */
export type TypeTests = {
    // Example tests - these will cause compile errors if types are wrong
    stateIsValid: Assert<AssertEqual<ValidState<{ id: string }>, { id: string }>>;
    payloadIsValid: Assert<AssertExtends<string, ValidPayload<string>>>;
    emptyObjectIsInvalid: Assert<AssertEqual<ValidState<{}>, never>>;
    arrayIsInvalidState: Assert<AssertEqual<ValidState<string[]>, never>>;
    functionIsInvalidState: Assert<AssertEqual<ValidState<() => void>, never>>;
};

// ===== CONDITIONAL TYPE HELPERS =====

/**
 * Pick properties of a specific type
 */
export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>;

/**
 * Omit properties of a specific type
 */
export type OmitByType<T, U> = Omit<T, KeysOfType<T, U>>;

/**
 * Make properties nullable
 */
export type Nullable<T> = { [K in keyof T]: T[K] | null };

/**
 * Make properties non-nullable
 */
export type NonNullable<T> = { [K in keyof T]: NonNullable<T[K]> };

/**
 * Function overload helper
 */
export type Overload<T> = T extends {
    (...args: infer A1): infer R1;
    (...args: infer A2): infer R2;
    (...args: infer A3): infer R3;
} ? ((...args: A1) => R1) & ((...args: A2) => R2) & ((...args: A3) => R3)
    : T extends {
        (...args: infer A1): infer R1;
        (...args: infer A2): infer R2;
    } ? ((...args: A1) => R1) & ((...args: A2) => R2)
    : T;