/**
 * Plugin System for Staga
 * Allows extensible architecture through plugins that can hook into lifecycle events
 */

import type { DIContainer } from '../di/Container';
import type { SagaManager } from '../SagaManager';
import type { Store } from '../statekit';
import type { Stream } from '../statekit';
import type { TxEvent } from '../statekit';
import { ErrorManager } from '../ErrorManager';

export interface PluginMetadata {
    name: string;
    version: string;
    description?: string;
    author?: string;
    homepage?: string;
    keywords?: string[];
    dependencies?: string[];
    peerDependencies?: string[];
}

export interface PluginContext<TState extends object = any> {
    container: DIContainer;
    // Legacy saga API (optional in new setups)
    sagaManager?: SagaManager<TState>;
    // New statekit primitives for plugins
    store?: Store<TState>;
    txStream?: Stream<TxEvent>;
    config: Record<string, unknown>;
    logger: PluginLogger;
}

export interface PluginLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

export interface PluginHooks<TState extends object = any> {
    /**
     * Called when the plugin is being installed
     */
    onInstall?(context: PluginContext<TState>): void | Promise<void>;

    /**
     * Called when the plugin is being uninstalled
     */
    onUninstall?(context: PluginContext<TState>): void | Promise<void>;

    /**
     * Called when the Saga system is being initialized
     */
    onInitialize?(context: PluginContext<TState>): void | Promise<void>;

    /**
     * Called when the Saga system is being shut down
     */
    onShutdown?(context: PluginContext<TState>): void | Promise<void>;

    /**
     * Called before a transaction starts
     */
    onBeforeTransaction?(context: PluginContext<TState>, transactionName: string, payload: any): void | Promise<void>;

    /**
     * Called after a transaction completes (success or failure)
     */
    onAfterTransaction?(context: PluginContext<TState>, transactionName: string, success: boolean, error?: Error): void | Promise<void>;

    /**
     * Called when state changes
     */
    onStateChange?(context: PluginContext<TState>, newState: TState, oldState: TState): void | Promise<void>;
}

/**
 * Base plugin interface
 */
export interface StagaPlugin<TState extends object = any> {
    readonly metadata: PluginMetadata;
    readonly hooks?: PluginHooks<TState>;

    /**
     * Configure plugin services in the DI container
     */
    configure?(container: DIContainer): void | Promise<void>;

    /**
     * Validate plugin configuration
     */
    validateConfig?(config: Record<string, unknown>): string[] | undefined;
}

/**
 * Plugin installation status
 */
export type PluginStatus = 'installing' | 'installed' | 'uninstalling' | 'uninstalled' | 'failed';

export interface InstalledPlugin<TState extends object = any> {
    plugin: StagaPlugin<TState>;
    context: PluginContext<TState>;
    status: PluginStatus;
    installTime: number;
    error?: Error;
}

/**
 * Plugin manager for handling plugin lifecycle
 */
export class PluginManager<TState extends object = any> {
    private plugins = new Map<string, InstalledPlugin<TState>>();
    private initializationOrder: string[] = [];
    private errorManager = new ErrorManager();

    constructor(
        private container: DIContainer,
        private sagaManager?: SagaManager<TState>,
        private store?: Store<TState>,
        private txStream?: Stream<TxEvent>
    ) { }

    /**
     * Install a plugin
     */
    async install(
        plugin: StagaPlugin<TState>,
        config: Record<string, unknown> = {}
    ): Promise<void> {
        const { name, version } = plugin.metadata;

        if (this.plugins.has(name)) {
            throw new PluginError(`Plugin '${name}' is already installed`);
        }

        // Validate configuration
        if (plugin.validateConfig) {
            const errors = plugin.validateConfig(config);
            if (errors && errors.length > 0) {
                throw new PluginError(`Plugin '${name}' configuration is invalid: ${errors.join(', ')}`);
            }
        }

        // Check dependencies
        await this.checkDependencies(plugin);

        // Create plugin context
        const context: PluginContext<TState> = {
            container: this.container,
            sagaManager: this.sagaManager as any,
            store: this.store as any,
            txStream: this.txStream as any,
            config,
            logger: this.createLogger(name)
        };

        const installedPlugin: InstalledPlugin<TState> = {
            plugin,
            context,
            status: 'installing',
            installTime: Date.now()
        };

        this.plugins.set(name, installedPlugin);

        try {
            // Configure DI services
            if (plugin.configure) {
                await plugin.configure(this.container);
            }

            // Call install hook
            if (plugin.hooks?.onInstall) {
                await plugin.hooks.onInstall(context);
            }

            installedPlugin.status = 'installed';
            this.initializationOrder.push(name);

            context.logger.info(`Plugin '${name}' v${version} installed successfully`);
        } catch (error) {
            installedPlugin.status = 'failed';
            installedPlugin.error = error as Error;

            this.errorManager.handleError(
                error as Error,
                { component: 'plugin-manager', operation: 'install' }
            );

            throw new PluginError(`Failed to install plugin '${name}': ${error}`);
        }
    }

    /**
     * Uninstall a plugin
     */
    async uninstall(name: string): Promise<void> {
        if (!name) {
            throw new PluginError('Plugin name is required');
        }

        const installedPlugin = this.plugins.get(name);
        if (!installedPlugin) {
            throw new PluginError(`Plugin '${name}' is not installed`);
        }

        installedPlugin.status = 'uninstalling';

        try {
            // Call uninstall hook
            if (installedPlugin.plugin.hooks?.onUninstall) {
                await installedPlugin.plugin.hooks.onUninstall(installedPlugin.context);
            }

            installedPlugin.status = 'uninstalled';
            this.plugins.delete(name);

            // Remove from initialization order
            const index = this.initializationOrder.indexOf(name);
            if (index >= 0) {
                this.initializationOrder.splice(index, 1);
            }

            installedPlugin.context.logger.info(`Plugin '${name}' uninstalled successfully`);
        } catch (error) {
            installedPlugin.status = 'failed';
            installedPlugin.error = error as Error;

            this.errorManager.handleError(
                error as Error,
                { component: 'plugin-manager', operation: 'uninstall' }
            );

            throw new PluginError(`Failed to uninstall plugin '${name}': ${error}`);
        }
    }

    /**
     * Get installed plugin
     */
    getPlugin(name: string): InstalledPlugin<TState> | undefined {
        return this.plugins.get(name);
    }

    /**
     * Get all installed plugins
     */
    getAllPlugins(): InstalledPlugin<TState>[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Check if plugin is installed
     */
    isInstalled(name: string): boolean {
        const plugin = this.plugins.get(name);
        return plugin?.status === 'installed';
    }

    /**
     * Initialize all plugins
     */
    async initialize(): Promise<void> {
        for (const name of this.initializationOrder) {
            if (!name) continue;

            const installedPlugin = this.plugins.get(name);
            if (installedPlugin?.plugin.hooks?.onInitialize) {
                try {
                    await installedPlugin.plugin.hooks.onInitialize(installedPlugin.context);
                    installedPlugin.context.logger.debug(`Plugin '${name}' initialized`);
                } catch (error) {
                    this.errorManager.handleError(
                        error as Error,
                        { component: 'plugin-manager', operation: 'initialize' }
                    );
                }
            }
        }
    }

    /**
     * Shutdown all plugins
     */
    async shutdown(): Promise<void> {
        // Shutdown in reverse order
        for (let i = this.initializationOrder.length - 1; i >= 0; i--) {
            const name = this.initializationOrder[i];
            if (!name) continue;

            const installedPlugin = this.plugins.get(name);
            if (installedPlugin?.plugin.hooks?.onShutdown) {
                try {
                    await installedPlugin.plugin.hooks.onShutdown(installedPlugin.context);
                    installedPlugin.context.logger.debug(`Plugin '${name}' shutdown`);
                } catch (error) {
                    this.errorManager.handleError(
                        error as Error,
                        { component: 'plugin-manager', operation: 'shutdown' }
                    );
                }
            }
        }
    }

    /**
     * Execute hook for all plugins
     */
    async executeHook<K extends keyof PluginHooks<TState>>(
        hookName: K,
        ...args: Parameters<NonNullable<PluginHooks<TState>[K]>>
    ): Promise<void> {
        for (const name of this.initializationOrder) {
            if (!name) continue;

            const installedPlugin = this.plugins.get(name);
            const hook = installedPlugin?.plugin.hooks?.[hookName];

            if (hook) {
                try {
                    await (hook as (...args: unknown[]) => unknown)(...args);
                } catch (error) {
                    this.errorManager.handleError(
                        error as Error,
                        {
                            component: 'plugin-manager',
                            operation: `hook-${hookName}`,
                            metadata: { pluginName: name }
                        }
                    );
                }
            }
        }
    }

    /**
     * Get plugin statistics
     */
    getStats(): {
        totalPlugins: number;
        installedPlugins: number;
        failedPlugins: number;
        pluginsByStatus: Record<PluginStatus, number>;
    } {
        const pluginsByStatus: Record<PluginStatus, number> = {
            installing: 0,
            installed: 0,
            uninstalling: 0,
            uninstalled: 0,
            failed: 0
        };

        let installedCount = 0;
        let failedCount = 0;

        for (const plugin of this.plugins.values()) {
            pluginsByStatus[plugin.status]++;

            if (plugin.status === 'installed') installedCount++;
            if (plugin.status === 'failed') failedCount++;
        }

        return {
            totalPlugins: this.plugins.size,
            installedPlugins: installedCount,
            failedPlugins: failedCount,
            pluginsByStatus
        };
    }

    // ===== PRIVATE METHODS =====

    private async checkDependencies(plugin: StagaPlugin<TState>): Promise<void> {
        const { dependencies = [], peerDependencies = [] } = plugin.metadata;

        // Check plugin dependencies
        for (const dep of dependencies) {
            if (dep && !this.isInstalled(dep)) {
                throw new PluginError(`Plugin '${plugin.metadata.name}' requires '${dep}' to be installed`);
            }
        }

        // Check peer dependencies (warnings only)
        for (const peerDep of peerDependencies) {
            if (peerDep && !this.isInstalled(peerDep)) {
                console.warn(`Plugin '${plugin.metadata.name}' recommends '${peerDep}' to be installed`);
            }
        }
    }

    private createLogger(pluginName: string): PluginLogger {
        return {
            debug: (message: string, ...args: any[]) => {
                console.debug(`[Plugin:${pluginName}] ${message}`, ...args);
            },
            info: (message: string, ...args: any[]) => {
                console.info(`[Plugin:${pluginName}] ${message}`, ...args);
            },
            warn: (message: string, ...args: any[]) => {
                console.warn(`[Plugin:${pluginName}] ${message}`, ...args);
            },
            error: (message: string, ...args: any[]) => {
                console.error(`[Plugin:${pluginName}] ${message}`, ...args);
            }
        };
    }
}

/**
 * Factory to create PluginManager from either SagaManager (legacy) or statekit Store/txStream (new)
 */
export function createPluginManager<TState extends object>(
    container: DIContainer,
    opts:
        | { sagaManager: SagaManager<TState> }
        | { store: Store<TState>; txStream?: Stream<TxEvent> }
): PluginManager<TState> {
    if ('sagaManager' in opts) {
        return new PluginManager<TState>(container, opts.sagaManager);
    }
    return new PluginManager<TState>(container, undefined, opts.store, opts.txStream);
}

/**
 * Plugin-specific error
 */
export class PluginError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginError';
    }
}

/**
 * Base class for creating plugins
 */
export abstract class BasePlugin<TState extends object = any> implements StagaPlugin<TState> {
    abstract readonly metadata: PluginMetadata;

    readonly hooks?: PluginHooks<TState>;

    configure?(container: DIContainer): void | Promise<void>;

    validateConfig?(config: Record<string, unknown>): string[] | undefined;

    /**
     * Protected method to set hooks - allows cleaner inheritance
     */
    protected setHooks(hooks: PluginHooks<TState>): void {
        (this as any).hooks = hooks;
    }
}