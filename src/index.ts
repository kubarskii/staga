/**
 * Staga - A TypeScript library for managing state transactions with saga pattern
 * Simplified and streamlined for better maintainability
 */

// ===== CORE CLASSES =====
export { StateManager, type StateManagerOptions } from './StateManager';
export { Transaction, TransactionBuilder } from './Transaction';
export { SagaManager, type SagaManagerOptions } from './SagaManager';
export { MiddlewareOrchestrator } from './MiddlewareOrchestrator';

// ===== REACTIVE SYSTEM =====
// Subject/BehaviorSubject removed from public API; use statekit.Stream

// ===== STATE MANAGEMENT =====
export {
    ReactiveStateProxy,
    type ReactiveProxyOptions
} from './ReactiveStateProxy';

// ===== EVENT SYSTEM =====
export {
    SagaEventManager,
    type SagaEventManagerOptions
} from './managers/SagaEventManager';

export {
    UnifiedEventManager,
    type UnifiedEventManagerOptions
} from './managers/UnifiedEventManager';

// ===== EVENT REPLAY =====
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

// ===== DEPENDENCY INJECTION =====
export {
    DIContainer,
    DependencyResolutionError,
    CircularDependencyError,
    Injectable,
    Inject,
    autoRegister,
    // Enhanced decorators
    InjectableEnhanced,
    InjectEnhanced,
    Singleton,
    Transient,
    Scoped,
    InjectProperty,
    autoRegisterEnhanced,
    // Types
    type ServiceRegistration,
    type LifecycleScope,
    type ContainerOptions,
    type InjectableOptions,
    type InjectOptions
} from './di';

// ===== PLUGINS =====
export {
    PluginManager,
    type StagaPlugin,
    type PluginMetadata,
    type PluginHooks
} from './plugins';

// ===== MIDDLEWARE =====
export {
    createPersistenceMiddleware,
    loadPersistedState,
    createLoggingMiddleware,
    createTimingMiddleware
} from './middleware';

// ===== ERROR MANAGEMENT =====
export {
    ErrorManager,
    ConsoleErrorHandler,
    ErrorSeverity,
    type ErrorContext,
    type StructuredError,
    type ErrorHandler
} from './ErrorManager';

// ===== UTILITIES =====
export {
    deepEqual,
    shallowEqual,
    getNestedProperty,
    createMemoizedSelector,
    isEventOfType,
    safeStringify,
    debounce,
    SubscriptionManager,
    isDebugEnabled
} from './utils';

// ===== TYPES =====
export type {
    SagaStep,
    StepFunction,
    StepOptions,
    MiddlewareContext,
    Middleware,
    AnyMiddleware,
    // Event types
    SagaEvent,
    AnySagaEvent,
    TransactionStartEvent,
    TransactionSuccessEvent,
    TransactionFailEvent,
    TransactionCompleteEvent,
    StepStartEvent,
    StepSuccessEvent,
    StepRetryEvent,
    StepRollbackEvent,
    TransactionRollbackEvent,
    // Event listeners
    EventName,
    EventArgs,
    Listener,
    SagaEventListener,
    AnySagaEventListener,
    TypedEventListener,
    AnyEventListener
} from './types';

// ===== VERSION =====
export const VERSION = '1.0.0';

// ===== STATEKIT (NEW API) =====
export * from './statekit';
export type { Transaction as SKTransaction } from './statekit';
export { createTransaction as createSKTransaction } from './statekit';