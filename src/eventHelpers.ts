/**
 * Event helper utilities for type-safe event creation and handling
 */

import type {
    SagaEvent,
    TransactionStartEvent,
    TransactionSuccessEvent,
    TransactionFailEvent,
    TransactionCompleteEvent,
    StepStartEvent,
    StepSuccessEvent,
    StepRetryEvent,
    StepRollbackEvent
} from './types';

/**
 * Type-safe event creators with payload inference
 */
export const createEvent = {
    /**
     * Create a transaction start event
     */
    transactionStart<TPayload>(
        transactionName: string,
        payload: TPayload
    ): TransactionStartEvent<TPayload> {
        return {
            type: 'transaction:start',
            transactionName,
            payload,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a transaction success event
     */
    transactionSuccess<TPayload>(
        transactionName: string,
        payload: TPayload,
        duration: number
    ): TransactionSuccessEvent<TPayload> {
        return {
            type: 'transaction:success',
            transactionName,
            payload,
            duration,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a transaction fail event
     */
    transactionFail<TPayload>(
        transactionName: string,
        payload: TPayload,
        error: Error,
        duration: number
    ): TransactionFailEvent<TPayload> {
        return {
            type: 'transaction:fail',
            transactionName,
            payload,
            error,
            duration,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a transaction complete event
     */
    transactionComplete<TPayload>(
        transactionName: string,
        payload: TPayload,
        duration: number
    ): TransactionCompleteEvent<TPayload> {
        return {
            type: 'transaction:complete',
            transactionName,
            payload,
            duration,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a step start event
     */
    stepStart<TPayload>(
        stepName: string,
        payload: TPayload
    ): StepStartEvent<TPayload> {
        return {
            type: 'step:start',
            stepName,
            payload,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a step success event
     */
    stepSuccess<TPayload>(
        stepName: string,
        payload: TPayload,
        duration: number
    ): StepSuccessEvent<TPayload> {
        return {
            type: 'step:success',
            stepName,
            payload,
            duration,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a step retry event
     */
    stepRetry<TPayload>(
        stepName: string,
        payload: TPayload,
        attempt: number,
        lastError: Error
    ): StepRetryEvent<TPayload> {
        return {
            type: 'step:retry',
            stepName,
            payload,
            attempt,
            lastError,
            timestamp: Date.now(),
        };
    },

    /**
     * Create a step rollback event
     */
    stepRollback<TPayload>(
        stepName: string,
        payload: TPayload
    ): StepRollbackEvent<TPayload> {
        return {
            type: 'step:rollback',
            stepName,
            payload,
            timestamp: Date.now(),
        };
    },
};

/**
 * Type guards for event types with payload inference
 */
export const isEventType = {
    transactionStart<TPayload>(event: SagaEvent<TPayload>): event is TransactionStartEvent<TPayload> {
        return event.type === 'transaction:start';
    },

    transactionSuccess<TPayload>(event: SagaEvent<TPayload>): event is TransactionSuccessEvent<TPayload> {
        return event.type === 'transaction:success';
    },

    transactionFail<TPayload>(event: SagaEvent<TPayload>): event is TransactionFailEvent<TPayload> {
        return event.type === 'transaction:fail';
    },

    transactionComplete<TPayload>(event: SagaEvent<TPayload>): event is TransactionCompleteEvent<TPayload> {
        return event.type === 'transaction:complete';
    },

    stepStart<TPayload>(event: SagaEvent<TPayload>): event is StepStartEvent<TPayload> {
        return event.type === 'step:start';
    },

    stepSuccess<TPayload>(event: SagaEvent<TPayload>): event is StepSuccessEvent<TPayload> {
        return event.type === 'step:success';
    },

    stepRetry<TPayload>(event: SagaEvent<TPayload>): event is StepRetryEvent<TPayload> {
        return event.type === 'step:retry';
    },

    stepRollback<TPayload>(event: SagaEvent<TPayload>): event is StepRollbackEvent<TPayload> {
        return event.type === 'step:rollback';
    },
};

/**
 * Event matcher interface
 */
export interface EventMatcher<TPayload> {
    onTransactionStart: (callback: (event: TransactionStartEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onTransactionSuccess: (callback: (event: TransactionSuccessEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onTransactionFail: (callback: (event: TransactionFailEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onTransactionComplete: (callback: (event: TransactionCompleteEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onStepStart: (callback: (event: StepStartEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onStepSuccess: (callback: (event: StepSuccessEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onStepRetry: (callback: (event: StepRetryEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onStepRollback: (callback: (event: StepRollbackEvent<TPayload>) => void) => EventMatcher<TPayload>;
    onAny: (callback: (event: SagaEvent<TPayload>) => void) => EventMatcher<TPayload>;
    execute: () => void;
}

/**
 * Event pattern matcher with payload inference
 */
export function matchEvent<TPayload>(
    event: SagaEvent<TPayload>
): EventMatcher<TPayload> {
    const callbacks: Array<() => void> = [];

    const matcher: EventMatcher<TPayload> = {
        onTransactionStart: (callback: (event: TransactionStartEvent<TPayload>) => void) => {
            if (isEventType.transactionStart(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onTransactionSuccess: (callback: (event: TransactionSuccessEvent<TPayload>) => void) => {
            if (isEventType.transactionSuccess(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onTransactionFail: (callback: (event: TransactionFailEvent<TPayload>) => void) => {
            if (isEventType.transactionFail(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onTransactionComplete: (callback: (event: TransactionCompleteEvent<TPayload>) => void) => {
            if (isEventType.transactionComplete(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onStepStart: (callback: (event: StepStartEvent<TPayload>) => void) => {
            if (isEventType.stepStart(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onStepSuccess: (callback: (event: StepSuccessEvent<TPayload>) => void) => {
            if (isEventType.stepSuccess(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onStepRetry: (callback: (event: StepRetryEvent<TPayload>) => void) => {
            if (isEventType.stepRetry(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onStepRollback: (callback: (event: StepRollbackEvent<TPayload>) => void) => {
            if (isEventType.stepRollback(event)) {
                callbacks.push(() => callback(event));
            }
            return matcher;
        },

        onAny: (callback: (event: SagaEvent<TPayload>) => void) => {
            callbacks.push(() => callback(event));
            return matcher;
        },

        execute: () => {
            callbacks.forEach(cb => cb());
        },
    };

    return matcher;
}

/**
 * Utility to extract payload type from event
 */
export type ExtractEventPayload<T> = T extends SagaEvent<infer TPayload> ? TPayload : never;

/**
 * Utility to create type-safe event handlers
 */
export function createEventHandler<TPayload>() {
    return {
        /**
         * Handle transaction events
         */
        transaction: {
            onStart: (callback: (event: TransactionStartEvent<TPayload>) => void) => ({
                type: 'transaction:start' as const,
                callback,
            }),
            onSuccess: (callback: (event: TransactionSuccessEvent<TPayload>) => void) => ({
                type: 'transaction:success' as const,
                callback,
            }),
            onFail: (callback: (event: TransactionFailEvent<TPayload>) => void) => ({
                type: 'transaction:fail' as const,
                callback,
            }),
            onComplete: (callback: (event: TransactionCompleteEvent<TPayload>) => void) => ({
                type: 'transaction:complete' as const,
                callback,
            }),
        },

        /**
         * Handle step events
         */
        step: {
            onStart: (callback: (event: StepStartEvent<TPayload>) => void) => ({
                type: 'step:start' as const,
                callback,
            }),
            onSuccess: (callback: (event: StepSuccessEvent<TPayload>) => void) => ({
                type: 'step:success' as const,
                callback,
            }),
            onRetry: (callback: (event: StepRetryEvent<TPayload>) => void) => ({
                type: 'step:retry' as const,
                callback,
            }),
            onRollback: (callback: (event: StepRollbackEvent<TPayload>) => void) => ({
                type: 'step:rollback' as const,
                callback,
            }),
        },
    };
}