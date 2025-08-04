/**
 * Unified Dependency Injection exports
 * All functionality now available from Container.ts
 */

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
} from './Container';