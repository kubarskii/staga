/**
 * Unified Dependency Injection Container for Staga
 * Combines simple container with enhanced decorator support
 * Provides type-safe dependency resolution with lifecycle management
 */

export type LifecycleScope = 'singleton' | 'transient' | 'scoped';

export interface ServiceRegistration<T = unknown> {
    key: string;
    factory: (...deps: unknown[]) => T;
    dependencies: string[];
    scope: LifecycleScope;
    instance?: T;
    metadata?: Record<string, unknown> | undefined;
}

export interface ContainerOptions {
    enableCircularDependencyDetection?: boolean;
    maxResolutionDepth?: number;
    enableLogging?: boolean;
}

/**
 * Lightweight, type-safe dependency injection container
 */
export class DIContainer {
    private registrations = new Map<string, ServiceRegistration>();
    private singletonInstances = new Map<string, any>();
    private scopedInstances = new Map<string, any>();
    private resolutionStack: string[] = [];
    private options: Required<ContainerOptions>;

    constructor(options: ContainerOptions = {}) {
        this.options = {
            enableCircularDependencyDetection: true,
            maxResolutionDepth: 50,
            enableLogging: false,
            ...options
        };
    }

    /**
     * Register a service with factory function
     */
    register<T>(
        key: string,
        factory: (...deps: unknown[]) => T,
        options: {
            dependencies?: string[];
            scope?: LifecycleScope;
            metadata?: Record<string, unknown>;
        } = {}
    ): this {
        const registration: ServiceRegistration<T> = {
            key,
            factory,
            dependencies: options.dependencies || [],
            scope: options.scope || 'singleton',
            metadata: options.metadata
        };

        this.registrations.set(key, registration);

        if (this.options.enableLogging) {
            console.log(`[DI] Registered service: ${key} (${registration.scope})`);
        }

        return this;
    }

    /**
     * Register a singleton instance
     */
    registerInstance<T>(key: string, instance: T, metadata?: Record<string, unknown>): this {
        this.singletonInstances.set(key, instance);

        const registration: ServiceRegistration<T> = {
            key,
            factory: () => instance,
            dependencies: [],
            scope: 'singleton',
            instance,
            metadata
        };

        this.registrations.set(key, registration);

        if (this.options.enableLogging) {
            console.log(`[DI] Registered instance: ${key}`);
        }

        return this;
    }

    /**
     * Register a factory that returns a value
     */
    registerValue<T>(key: string, value: T, metadata?: Record<string, unknown>): this {
        return this.registerInstance(key, value, metadata);
    }

    /**
     * Resolve a service by key with full type safety
     */
    resolve<T>(key: string): T {
        try {
            return this.resolveInternal<T>(key);
        } catch (error) {
            throw new DependencyResolutionError(
                `Failed to resolve dependency '${key}': ${error instanceof Error ? error.message : error}`,
                key,
                [...this.resolutionStack]
            );
        } finally {
            this.resolutionStack = [];
        }
    }

    /**
     * Try to resolve a service, returning undefined if not found
     */
    tryResolve<T>(key: string): T | undefined {
        try {
            return this.resolve<T>(key);
        } catch {
            return undefined;
        }
    }

    /**
     * Check if a service is registered
     */
    isRegistered(key: string): boolean {
        return this.registrations.has(key);
    }

    /**
     * Get all registered service keys
     */
    getRegisteredKeys(): string[] {
        return Array.from(this.registrations.keys());
    }

    /**
     * Get service registration metadata
     */
    getRegistration(key: string): ServiceRegistration | undefined {
        return this.registrations.get(key);
    }

    /**
     * Create a child container with inherited registrations
     */
    createChildContainer(): DIContainer {
        const child = new DIContainer(this.options);

        // Copy registrations
        for (const [key, registration] of this.registrations) {
            child.registrations.set(key, { ...registration });
        }

        // Copy singleton instances
        for (const [key, instance] of this.singletonInstances) {
            child.singletonInstances.set(key, instance);
        }

        return child;
    }

    /**
     * Clear all registrations and instances
     */
    clear(): void {
        this.registrations.clear();
        this.singletonInstances.clear();
        this.scopedInstances.clear();
        this.resolutionStack = [];
    }

    /**
     * Begin a new scope for scoped dependencies
     */
    beginScope(): void {
        this.scopedInstances.clear();
    }

    /**
     * End the current scope and cleanup scoped instances
     */
    endScope(): void {
        // Call dispose on scoped instances if they have it
        for (const instance of this.scopedInstances.values()) {
            if (instance && typeof instance.dispose === 'function') {
                try {
                    instance.dispose();
                } catch (error) {
                    console.warn('[DI] Error disposing scoped instance:', error);
                }
            }
        }
        this.scopedInstances.clear();
    }

    /**
     * Get container statistics
     */
    getStats(): {
        totalRegistrations: number;
        singletonInstances: number;
        scopedInstances: number;
        registrationsByScope: Record<LifecycleScope, number>;
    } {
        const registrationsByScope: Record<LifecycleScope, number> = {
            singleton: 0,
            transient: 0,
            scoped: 0
        };

        for (const registration of this.registrations.values()) {
            registrationsByScope[registration.scope]++;
        }

        return {
            totalRegistrations: this.registrations.size,
            singletonInstances: this.singletonInstances.size,
            scopedInstances: this.scopedInstances.size,
            registrationsByScope
        };
    }

    // ===== PRIVATE METHODS =====

    private resolveInternal<T>(key: string): T {
        // Check resolution depth
        if (this.resolutionStack.length > this.options.maxResolutionDepth) {
            throw new Error(`Maximum resolution depth exceeded (${this.options.maxResolutionDepth})`);
        }

        // Check for circular dependencies
        if (this.options.enableCircularDependencyDetection && this.resolutionStack.includes(key)) {
            throw new CircularDependencyError(key, [...this.resolutionStack, key]);
        }

        this.resolutionStack.push(key);

        try {
            const registration = this.registrations.get(key);
            if (!registration) {
                throw new Error(`Service '${key}' is not registered`);
            }

            return this.createInstance(registration) as T;
        } finally {
            this.resolutionStack.pop();
        }
    }

    private createInstance<T>(registration: ServiceRegistration<T>): T {
        switch (registration.scope) {
            case 'singleton':
                return this.getSingletonInstance(registration);

            case 'scoped':
                return this.getScopedInstance(registration);

            case 'transient':
                return this.createTransientInstance(registration);

            default:
                throw new Error(`Unknown scope: ${registration.scope}`);
        }
    }

    private getSingletonInstance<T>(registration: ServiceRegistration<T>): T {
        let instance = this.singletonInstances.get(registration.key);

        if (instance === undefined) {
            instance = this.createTransientInstance(registration);
            this.singletonInstances.set(registration.key, instance);
        }

        return instance;
    }

    private getScopedInstance<T>(registration: ServiceRegistration<T>): T {
        let instance = this.scopedInstances.get(registration.key);

        if (instance === undefined) {
            instance = this.createTransientInstance(registration);
            this.scopedInstances.set(registration.key, instance);
        }

        return instance;
    }

    private createTransientInstance<T>(registration: ServiceRegistration<T>): T {
        // Resolve dependencies
        const dependencies = registration.dependencies.map(dep => this.resolveInternal(dep));

        // Create instance
        const instance = registration.factory(...dependencies);

        if (this.options.enableLogging) {
            console.log(`[DI] Created instance: ${registration.key} (${registration.scope})`);
        }

        return instance;
    }
}

/**
 * Error thrown when dependency resolution fails
 */
export class DependencyResolutionError extends Error {
    constructor(
        message: string,
        public readonly dependencyKey: string,
        public readonly resolutionStack: string[]
    ) {
        super(message);
        this.name = 'DependencyResolutionError';
    }
}

/**
 * Error thrown when circular dependency is detected
 */
export class CircularDependencyError extends Error {
    constructor(
        public readonly dependencyKey: string,
        public readonly circularPath: string[]
    ) {
        super(`Circular dependency detected: ${circularPath.join(' -> ')}`);
        this.name = 'CircularDependencyError';
    }
}

/**
 * Decorator for marking injectable services
 */
// Type for constructor functions
type Constructor<T = unknown> = new (...args: unknown[]) => T;

// Type for constructor with metadata
interface ConstructorWithMetadata extends Constructor {
    __injectable_key?: string;
}

export function Injectable(key?: string) {
    return function <T extends Constructor>(constructor: T): T {
        // Store metadata for automatic registration
        (constructor as ConstructorWithMetadata).__injectable_key = key || constructor.name;
        return constructor;
    };
}

/**
 * Simple dependency injection marker (without reflect-metadata)
 */
// Type for constructor with injection metadata
interface ConstructorWithInjectMetadata extends Constructor {
    __injection_keys?: Record<number, string>;
}

export function Inject(key: string) {
    return function (target: ConstructorWithInjectMetadata, _propertyKey: string | symbol | undefined, parameterIndex: number) {
        const injectionKeys = target.__injection_keys || {};
        injectionKeys[parameterIndex] = key;
        target.__injection_keys = injectionKeys;
    };
}

// ===== ENHANCED DECORATOR SUPPORT =====

// Lightweight metadata storage (avoids reflect-metadata dependency)
const metadataStore = new WeakMap<object, Record<string, unknown>>();

function setMetadata(key: string, value: unknown, target: object): void {
    let metadata = metadataStore.get(target);
    if (!metadata) {
        metadata = {};
        metadataStore.set(target, metadata);
    }
    metadata[key] = value;
}

function getMetadata(key: string, target: object): unknown {
    const metadata = metadataStore.get(target);
    return metadata ? metadata[key] : undefined;
}

export interface InjectableOptions {
    key?: string;
    scope?: LifecycleScope;
    factory?: (...deps: unknown[]) => unknown;
}

export interface InjectOptions {
    key: string;
    optional?: boolean;
}

/**
 * Enhanced Injectable decorator with more options
 */
export function InjectableEnhanced(options?: string | InjectableOptions) {
    return function <T extends Constructor>(constructor: T): T {
        let metadata: InjectableOptions;

        if (typeof options === 'string') {
            metadata = { key: options };
        } else {
            metadata = {
                key: constructor.name,
                scope: 'singleton',
                ...options
            };
        }

        setMetadata('injectable', metadata, constructor);
        return constructor;
    };
}

/**
 * Enhanced Inject decorator with optional dependencies
 */
export function InjectEnhanced(keyOrOptions: string | InjectOptions) {
    return function (target: Constructor, _propertyKey: string | symbol | undefined, parameterIndex: number) {
        const options: InjectOptions = typeof keyOrOptions === 'string'
            ? { key: keyOrOptions }
            : keyOrOptions;

        const existingInjects = (getMetadata('inject', target) as Array<InjectOptions | undefined>) || [];
        existingInjects[parameterIndex] = options;
        setMetadata('inject', existingInjects, target);
    };
}

/**
 * Decorator shortcuts for common scopes
 */
export function Singleton(key?: string) {
    return InjectableEnhanced({ ...(key ? { key } : {}), scope: 'singleton' });
}

export function Transient(key?: string) {
    return InjectableEnhanced({ ...(key ? { key } : {}), scope: 'transient' });
}

export function Scoped(key?: string) {
    return InjectableEnhanced({ ...(key ? { key } : {}), scope: 'scoped' });
}

/**
 * Property injection decorator
 */
export function InjectProperty(key: string) {
    return function (target: object, propertyKey: string) {
        const properties = (getMetadata('inject-properties', target.constructor) as Array<{ propertyKey: string; key: string }>) || [];
        properties.push({ propertyKey, key });
        setMetadata('inject-properties', properties, target.constructor);
    };
}

/**
 * Enhanced auto-registration with metadata support
 */
export function autoRegisterEnhanced(container: DIContainer, services: Constructor[]): void {
    for (const serviceClass of services) {
        const metadata = getMetadata('injectable', serviceClass) as InjectableOptions | undefined;

        if (metadata) {
            const { key, scope, factory } = metadata;
            const injectMetadata = (getMetadata('inject', serviceClass) as Array<InjectOptions | undefined>) || [];

            // Get dependencies from inject metadata
            const dependencies = injectMetadata
                .filter((inject: InjectOptions | undefined): inject is InjectOptions => inject !== undefined && !inject.optional)
                .map((inject: InjectOptions) => inject.key);

            const serviceFactory = factory || ((...deps: unknown[]) => {
                const instance = new serviceClass(...deps);

                // Handle property injection
                const properties = (getMetadata('inject-properties', serviceClass) as Array<{ propertyKey: string; key: string }>) || [];
                for (const prop of properties) {
                    try {
                        (instance as Record<string, unknown>)[prop.propertyKey] = container.resolve(prop.key);
                    } catch (error) {
                        // Property injection failures are non-fatal
                        console.warn(`Failed to inject property ${prop.propertyKey}:`, error);
                    }
                }

                return instance;
            });

            if (key) {
                container.register(key, serviceFactory, { 
                    dependencies, 
                    scope: scope || 'singleton' 
                });
            }
        }
    }
}

/**
 * Auto-register services marked with @Injectable
 */
export function autoRegister(container: DIContainer, services: ConstructorWithMetadata[]): void {
    for (const serviceClass of services) {
        const key = serviceClass.__injectable_key;
        if (key) {
            const injectionKeys = (serviceClass as ConstructorWithInjectMetadata).__injection_keys || {};
            const dependencies = Object.values(injectionKeys);

            container.register(
                key,
                (...deps: unknown[]) => new serviceClass(...deps),
                { dependencies }
            );
        }
    }
}