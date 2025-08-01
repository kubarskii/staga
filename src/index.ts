/**
 * Staga - A TypeScript library for managing state transactions with saga pattern
 */

// Core classes
export { StateManager, type StateManagerOptions } from './StateManager';
export { Transaction, TransactionBuilder } from './Transaction';
export { SagaManager } from './SagaManager';
export { TransactionExecutor } from './TransactionExecutor';
export { TransactionRollback } from './TransactionRollback';
export { MiddlewareOrchestrator } from './MiddlewareOrchestrator';

// Reactive selectors
export {
    Observable,
    ReactiveSelector,
    ComputedValue,
    ReactiveSelectorFactory,
    ReactiveUtils,
    deepEqual,
    type ReactiveValue,
    type StateChangeListener,
    type SelectorSubscription
} from './ReactiveSelectors';

// TypeScript enhancements
export {
    createTypedSelector,
    isValidState,
    isValidPayload,
    assertValidState,
    assertValidPayload,
    createTransactionId,
    createStepId,
    createStateVersion,
    createEventId,
    type ValidState,
    type ValidPayload,
    type TypedSelector,
    type TypedStepFunction,
    type TypedCompensateFunction,
    type TypedStep,
    type TransactionId,
    type StepId,
    type StateVersion,
    type EventId,
    type DeepReadonly,
    type Brand
} from './TypeScriptEnhancements';

// Transaction composition
export {
    TransactionComposer,
    CompositionBuilder,
    CompositionPatterns,
    type CompositionStrategy,
    type CompositionOptions,
    type CompositionResult,
    type TransactionDefinition
} from './TransactionComposition';

// Event replay system
export {
    EventRecorder,
    EventReplayer,
    EventReplayManager,
    type RecordedEvent,
    type EventSession,
    type ReplayOptions,
    type ReplayState,
    type EventFilter
} from './EventReplay';

// Types
export type {
    StepFunction,
    StepOptions,
    SagaStep,
    MiddlewareContext,
    Middleware,
    EventName,
    EventArgs,
    Listener,
    SagaEvent,
    SagaEventListener,
    AnySagaEventListener,
    AnySagaEvent,
    TypedEventListener,
    TransactionStartEvent,
    TransactionSuccessEvent,
    TransactionFailEvent,
    TransactionCompleteEvent,
    TransactionRollbackEvent,
    StepStartEvent,
    StepSuccessEvent,
    StepRetryEvent,
    StepRollbackEvent,
} from './types';

// Middleware utilities
export {
    createPersistenceMiddleware,
    loadPersistedState,
    createLoggingMiddleware,
    createTimingMiddleware,
} from './middleware';

// Helper utilities for type-safe development
export {
    createStep,
    createStateUpdater,
    createStateValidator,
    createStateTransformer,
    createPayloadValidator,
    isValidState as isValidStateHelper,
} from './helpers';

// Redux-style action creators and selectors
export {
    createStepAction,
    createSimpleStepAction,
    createStepSlice,
    createAsyncStepAction,
    createStepBatch,
    StepActionUtils,
    type StepActionCreator,
    type AsyncStepActionCreator,
    type StepSlice,
    type StepReducer,
} from './actionCreators';

export {
    createSelector,
    createParameterizedSelector,
    SelectorFactory,
    StateSelectors,
    type Selector,
    type ParameterizedSelector,
    type InferSelectorState,
    type InferSelectorResult,
} from './selectors';

// Type-safe event helpers
export {
    createEvent,
    isEventType,
    matchEvent,
    createEventHandler,
    type ExtractEventPayload,
    type EventMatcher,
} from './eventHelpers';

// Re-export for convenience
export { SagaManager as Staga } from './SagaManager';