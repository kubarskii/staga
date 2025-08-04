/**
 * ReactiveStateProxy creates a Proxy wrapper around state that makes every property mutation
 * immediately reactive, triggering state change notifications in real-time.
 */

import type { StateManager } from './StateManager';
import { isDebugEnabled } from './utils';

export interface ReactiveProxyOptions {
    /**
     * Enable deep reactivity for nested objects
     * @default true
     */
    enableDeepReactivity?: boolean;

    /**
     * Debounce notifications to avoid excessive updates
     * @default 0 (no debouncing)
     */
    debounceMs?: number;

    /**
     * Enable logging of state mutations for debugging
     * @default false
     */
    enableLogging?: boolean;
}

export class ReactiveStateProxy<TState extends object> {
    private proxyCache = new WeakMap<object, any>();
    private mutationCount = 0;
    private lastNotification = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private debugMode = false;

    constructor(
        private stateManager: StateManager<TState>,
        private options: ReactiveProxyOptions = {}
    ) {
        this.options = {
            enableDeepReactivity: true,
            debounceMs: 0,
            enableLogging: false,
            ...options
        };
        this.debugMode = isDebugEnabled() || Boolean(this.options.enableLogging);

        if (this.debugMode) {
            console.log('🔍 ReactiveStateProxy created');
        }
    }

    /**
     * Create a reactive proxy for the given state object
     */
    createProxy(state: TState): TState {
        return this.createProxyRecursive(state) as TState;
    }

    private createProxyRecursive<T extends object>(obj: T): T {
        // Return cached proxy if it exists
        if (this.proxyCache.has(obj)) {
            return this.proxyCache.get(obj);
        }

        const proxy = new Proxy(obj, {
            set: (target: any, property: string | symbol, value: any, receiver: any): boolean => {
                const oldValue = target[property];

                // If the value is an object and deep reactivity is enabled, proxy it too
                if (this.options.enableDeepReactivity &&
                    value !== null &&
                    typeof value === 'object' &&
                    !this.proxyCache.has(value)) {
                    value = this.createProxyRecursive(value);
                }

                // Set the value
                const result = Reflect.set(target, property, value, receiver);

                // Only notify if the value actually changed
                if (result && oldValue !== value) {
                    this.mutationCount++;

                    if (this.options.enableLogging) {
                        console.log(`🔄 State mutation: ${String(property)} = ${JSON.stringify(value)} (mutation #${this.mutationCount})`);
                    }

                    // Trigger reactive notification
                    this.notifyStateChange();
                }

                return result;
            },

            get: (target: any, property: string | symbol, receiver: any): any => {
                const value = Reflect.get(target, property, receiver);

                // If getting an object property and deep reactivity is enabled, return a proxy
                if (this.options.enableDeepReactivity &&
                    value !== null &&
                    typeof value === 'object' &&
                    typeof value !== 'function' &&
                    !this.proxyCache.has(value)) {
                    const nestedProxy = this.createProxyRecursive(value);
                    // Don't modify the target - just return the proxy
                    return nestedProxy;
                }

                return value;
            },

            deleteProperty: (target: any, property: string | symbol): boolean => {
                if (property in target) {
                    const result = Reflect.deleteProperty(target, property);
                    if (result) {
                        this.mutationCount++;

                        if (this.options.enableLogging) {
                            console.log(`🗑️ State deletion: ${String(property)} (mutation #${this.mutationCount})`);
                        }

                        this.notifyStateChange();
                    }
                    return result;
                }
                return true;
            },

            defineProperty: (target: any, property: string | symbol, descriptor: PropertyDescriptor): boolean => {
                const result = Reflect.defineProperty(target, property, descriptor);
                if (result) {
                    this.mutationCount++;

                    if (this.options.enableLogging) {
                        console.log(`📝 State property definition: ${String(property)} (mutation #${this.mutationCount})`);
                    }

                    this.notifyStateChange();
                }
                return result;
            }
        });

        // Cache the proxy
        this.proxyCache.set(obj, proxy);
        return proxy;
    }

    private notifyStateChange(): void {
        if (!this.stateManager.running) {
            if (this.debugMode) {
                console.log('⚠️ ReactiveStateProxy: StateManager not running, skipping notification');
            }
            return;
        }

        if (this.options.debounceMs && this.options.debounceMs > 0) {
            // Debounced notification
            if (this.debounceTimer) {
                this.stateManager.unregisterTimer(this.debounceTimer);
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.performNotification();
                if (this.debounceTimer) {
                    this.stateManager.unregisterTimer(this.debounceTimer);
                    this.debounceTimer = null;
                }
            }, this.options.debounceMs);

            this.stateManager.registerTimer(this.debounceTimer);

            if (this.debugMode) {
                console.log(`⏰ ReactiveStateProxy: Created debounce timer (${this.options.debounceMs}ms)`);
            }
        } else {
            // Immediate notification
            this.performNotification();
        }
    }

    private performNotification(): void {
        if (!this.stateManager.running) return;
        this.lastNotification = Date.now();
        // Begin a proxy mutation batch so StateManager emits directly to subscribers
        this.stateManager.beginProxyMutation();
        try {
            this.stateManager.notifyChange();
        } finally {
            // End without immediate commit; final commit occurs at transaction end via setState or explicit commit
            this.stateManager.endProxyMutation(false);
        }

        if (this.options.enableLogging) {
            console.log(`📡 Reactive notification sent (total mutations: ${this.mutationCount})`);
        }
    }

    /**
     * Get statistics about proxy usage
     */
    getStats() {
        return {
            mutationCount: this.mutationCount,
            lastNotification: this.lastNotification,
            cachedProxies: 0 // WeakMap doesn't have size property
        };
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.debugMode) {
            console.log('🔍 ReactiveStateProxy disposing...');
        }

        if (this.debounceTimer) {
            this.stateManager.unregisterTimer(this.debounceTimer);
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;

            if (this.debugMode) {
                console.log('⏰ ReactiveStateProxy: Cleared debounce timer');
            }
        }
        this.proxyCache = new WeakMap();

        if (this.debugMode) {
            console.log('🔍 ReactiveStateProxy disposed');
        }
    }
}