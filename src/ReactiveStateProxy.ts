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
    // Set of proxies we created, so we can recognise them and avoid
    // double-wrapping a value that is already one of our proxies.
    private proxyObjects = new WeakSet<object>();
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
        // If this is already one of our proxies, don't wrap it again
        if (this.proxyObjects.has(obj)) {
            return obj;
        }
        // Return cached proxy if it exists
        if (this.proxyCache.has(obj)) {
            return this.proxyCache.get(obj);
        }

        const proxy = new Proxy(obj, {
            set: (target: any, property: string | symbol, value: any): boolean => {
                const oldValue = target[property];

                // If the value is an object and deep reactivity is enabled, proxy it too
                if (this.options.enableDeepReactivity &&
                    value !== null &&
                    typeof value === 'object' &&
                    !this.proxyCache.has(value)) {
                    value = this.createProxyRecursive(value);
                }

                // Set the value directly on the target. We intentionally do NOT
                // forward `receiver` here: `receiver` is the proxy itself, and
                // passing it would make Reflect.set re-dispatch through the
                // proxy's defineProperty trap, emitting a second notification for
                // the same mutation.
                const result = Reflect.set(target, property, value);

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
                    typeof value !== 'function') {
                    // Already one of our proxies (e.g. stored by the set trap): return as-is
                    if (this.proxyObjects.has(value)) {
                        return value;
                    }
                    // Return the cached proxy (or create one). Reusing the cache means
                    // repeated access to the same nested object yields a stable proxy,
                    // so deep mutations keep triggering reactive notifications.
                    // Don't modify the target - just return the proxy.
                    return this.createProxyRecursive(value);
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

        // Cache the proxy and remember it as one of ours
        this.proxyCache.set(obj, proxy);
        this.proxyObjects.add(proxy);
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
        this.proxyObjects = new WeakSet();

        if (this.debugMode) {
            console.log('🔍 ReactiveStateProxy disposed');
        }
    }
}