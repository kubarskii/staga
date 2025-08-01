/**
 * Redux-style action creator patterns for type-safe step creation
 * Inspired by Redux Toolkit's createAction and slice patterns
 */

import type { StepFunction, StepOptions } from './types';

/**
 * Step action creator - similar to Redux Toolkit's createAction
 */
export interface StepActionCreator<TState extends object, TPayload> {
    (payload: TPayload): { type: string; payload: TPayload };
    type: string;
    match: (action: { type: string }) => action is { type: string; payload: TPayload };
    execute: StepFunction<TState, TPayload>;
    compensate?: StepFunction<TState, TPayload> | undefined;
    options: Required<StepOptions>;
}

/**
 * Creates a type-safe step action creator
 */
export function createStepAction<TState extends object, TPayload = void>(
    type: string,
    execute: StepFunction<TState, TPayload>,
    compensate?: StepFunction<TState, TPayload>,
    options: StepOptions = {}
): StepActionCreator<TState, TPayload> {
    const defaultOptions: Required<StepOptions> = {
        retries: options.retries ?? 3,
        timeout: options.timeout ?? 30000,
    };

    const actionCreator = (payload: TPayload) => ({
        type,
        payload,
    });

    const creator = actionCreator as StepActionCreator<TState, TPayload>;
    creator.type = type;
    creator.execute = execute;
    creator.compensate = compensate;
    creator.options = defaultOptions;
    creator.match = (action: { type: string }): action is { type: string; payload: TPayload } =>
        action.type === type;

    return creator;
}

/**
 * Creates a step action with no payload
 */
export function createSimpleStepAction<TState extends object>(
    type: string,
    execute: StepFunction<TState, void>,
    compensate?: StepFunction<TState, void>,
    options?: StepOptions
): StepActionCreator<TState, void> {
    return createStepAction(type, execute, compensate, options);
}

/**
 * Step slice creator - inspired by Redux Toolkit's createSlice
 */
export interface StepSlice<TState extends object, TActions extends Record<string, any>> {
    name: string;
    actions: TActions;
    steps: Array<{
        name: string;
        execute: StepFunction<TState, any>;
        compensate?: StepFunction<TState, any> | undefined;
        options: Required<StepOptions>;
    }>;
}

export interface CreateStepSliceOptions<TState extends object> {
    name: string;
    steps: Record<string, StepReducer<TState, any>>;
    defaultOptions?: StepOptions;
}

export type StepReducer<TState extends object, TPayload> = {
    execute: StepFunction<TState, TPayload>;
    compensate?: StepFunction<TState, TPayload> | undefined;
    options?: StepOptions;
};

/**
 * Creates a step slice with multiple related steps
 */
export function createStepSlice<TState extends object>(
    options: CreateStepSliceOptions<TState>
): StepSlice<TState, any> {
    const { name, steps, defaultOptions = {} } = options;

    const actions = {} as any;
    const stepArray: StepSlice<TState, any>['steps'] = [];

    for (const [stepName, stepConfig] of Object.entries(steps)) {
        const fullStepName = `${name}/${stepName}`;
        const stepOptions = { ...defaultOptions, ...stepConfig.options };

        actions[stepName] = createStepAction(
            fullStepName,
            stepConfig.execute,
            stepConfig.compensate,
            stepOptions
        );

        stepArray.push({
            name: fullStepName,
            execute: stepConfig.execute,
            compensate: stepConfig.compensate || undefined,
            options: {
                retries: stepOptions.retries ?? 3,
                timeout: stepOptions.timeout ?? 30000,
            },
        });
    }

    return {
        name,
        actions,
        steps: stepArray,
    };
}

/**
 * Async step action creator for handling promises
 */
export interface AsyncStepActionCreator<TState extends object, TPayload, TResult> {
    (payload: TPayload): Promise<TResult>;
    type: string;
    pending: string;
    fulfilled: string;
    rejected: string;
    match: {
        pending: (action: { type: string }) => boolean;
        fulfilled: (action: { type: string }) => boolean;
        rejected: (action: { type: string }) => boolean;
    };
    execute: (state: TState, payload: TPayload) => Promise<TResult>;
    compensate?: StepFunction<TState, TPayload> | undefined;
    options: Required<StepOptions>;
}

/**
 * Creates an async step action creator
 */
export function createAsyncStepAction<TState extends object, TPayload, TResult>(
    type: string,
    execute: (state: TState, payload: TPayload) => Promise<TResult>,
    compensate?: StepFunction<TState, TPayload>,
    options: StepOptions = {}
): AsyncStepActionCreator<TState, TPayload, TResult> {
    const pendingType = `${type}/pending`;
    const fulfilledType = `${type}/fulfilled`;
    const rejectedType = `${type}/rejected`;

    const defaultOptions: Required<StepOptions> = {
        retries: options.retries ?? 3,
        timeout: options.timeout ?? 30000,
    };

    const actionCreator = async (_payload: TPayload): Promise<TResult> => {
        // This would be handled by the transaction runner
        throw new Error('Async step action must be run within a transaction');
    };

    const creator = actionCreator as AsyncStepActionCreator<TState, TPayload, TResult>;
    creator.type = type;
    creator.pending = pendingType;
    creator.fulfilled = fulfilledType;
    creator.rejected = rejectedType;
    creator.execute = execute;
    creator.compensate = compensate;
    creator.options = defaultOptions;
    creator.match = {
        pending: (action: { type: string }) => action.type === pendingType,
        fulfilled: (action: { type: string }) => action.type === fulfilledType,
        rejected: (action: { type: string }) => action.type === rejectedType,
    };

    return creator;
}

/**
 * Utility functions for step action creators
 */
export namespace StepActionUtils {
    /**
     * Type guard to check if something is a step action creator
     */
    export function isStepActionCreator<TState extends object, TPayload>(
        obj: any
    ): obj is StepActionCreator<TState, TPayload> {
        return (
            typeof obj === 'function' &&
            typeof obj.type === 'string' &&
            typeof obj.execute === 'function' &&
            typeof obj.match === 'function'
        );
    }

    /**
     * Type guard for async step action creators
     */
    export function isAsyncStepActionCreator<TState extends object, TPayload, TResult>(
        obj: any
    ): obj is AsyncStepActionCreator<TState, TPayload, TResult> {
        return (
            typeof obj === 'function' &&
            typeof obj.type === 'string' &&
            typeof obj.pending === 'string' &&
            typeof obj.fulfilled === 'string' &&
            typeof obj.rejected === 'string' &&
            typeof obj.execute === 'function'
        );
    }

    /**
     * Extracts the payload type from a step action creator
     */
    export type ExtractPayload<T> = T extends StepActionCreator<any, infer P> ? P : never;

    /**
     * Extracts the state type from a step action creator
     */
    export type ExtractState<T> = T extends StepActionCreator<infer S, any> ? S : never;
}

/**
 * Batch step creator for creating multiple related steps
 */
export function createStepBatch<TState extends object>(
    baseName: string,
    defaultOptions?: StepOptions
) {
    return {
        /**
         * Add a simple step to the batch
         */
        addStep<TPayload>(
            name: string,
            execute: StepFunction<TState, TPayload>,
            compensate?: StepFunction<TState, TPayload>,
            options?: StepOptions
        ) {
            return createStepAction(
                `${baseName}/${name}`,
                execute,
                compensate,
                { ...defaultOptions, ...options }
            );
        },

        /**
         * Add an async step to the batch
         */
        addAsyncStep<TPayload, TResult>(
            name: string,
            execute: (state: TState, payload: TPayload) => Promise<TResult>,
            compensate?: StepFunction<TState, TPayload>,
            options?: StepOptions
        ) {
            return createAsyncStepAction(
                `${baseName}/${name}`,
                execute,
                compensate,
                { ...defaultOptions, ...options }
            );
        },
    };
}