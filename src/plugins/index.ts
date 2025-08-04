/**
 * Plugin System exports
 */

// Core plugin system
export {
    PluginManager,
    BasePlugin,
    PluginError,
    type StagaPlugin,
    type PluginMetadata,
    type PluginContext,
    type PluginHooks,
    type PluginLogger,
    type PluginStatus,
    type InstalledPlugin
} from './PluginSystem';

// Example plugins
export {
    LoggingPlugin,
    LoggingService,
    type LoggingConfig,
    type LogLevel,
    type LogEntry
} from './examples/LoggingPlugin';

export {
    MetricsPlugin,
    MetricsService,
    type MetricsConfig,
    type TransactionMetrics,
    type StateMetrics,
    type PerformanceMetrics,
    type MetricEvent
} from './examples/MetricsPlugin';

export {
    PersistencePlugin,
    PersistenceService,
    LocalStorageAdapter,
    SessionStorageAdapter,
    FileStorageAdapter,
    type PersistenceConfig,
    type StorageAdapter,
    type PersistedState,
    type StateHistory
} from './examples/PersistencePlugin';