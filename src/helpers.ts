/**
 * Helper utilities for type-safe state management
 */

import type { StepFunction, StepOptions } from './types';

/**
 * Creates a type-safe step function with state inference
 */
export function createStep<TState extends object, TPayload>(
    name: string,
    execute: StepFunction<TState, TPayload>,
    compensate?: StepFunction<TState, TPayload>,
    options?: StepOptions
) {
    return {
        name,
        execute,
        compensate,
        options: options || {}
    };
}

/**
 * Creates a type-safe state updater function
 */
export function createStateUpdater<TState extends object>(
    updater: (state: TState) => void | Partial<TState>
): (state: TState) => void {
    return (state: TState) => {
        const result = updater(state);
        if (result && typeof result === 'object') {
            Object.assign(state, result);
        }
    };
}

/**
 * Creates a type-safe state validator function
 */
export function createStateValidator<TState extends object>(
    validator: (state: TState) => boolean | string
): (state: TState) => void {
    return (state: TState) => {
        const result = validator(state);
        if (result === false) {
            throw new Error('State validation failed');
        }
        if (typeof result === 'string') {
            throw new Error(result);
        }
    };
}

/**
 * Type guard to check if a value is a valid state object
 */
export function isValidState<TState extends object>(
    value: unknown
): value is TState {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates a type-safe state transformer
 */
export function createStateTransformer<TState extends object, TResult>(
    transformer: (state: TState) => TResult
): (state: TState) => TResult {
    return transformer;
}

/**
 * Helper to create type-safe payload validators
 */
export function createPayloadValidator<TPayload>(
    validator: (payload: unknown) => payload is TPayload
): (payload: unknown) => asserts payload is TPayload {
    return (payload: unknown): asserts payload is TPayload => {
        if (!validator(payload)) {
            throw new Error('Invalid payload type');
        }
    };
}