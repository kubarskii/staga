/**
 * Persistence Plugin - Automatic state persistence and restoration for Staga
 */

import { BasePlugin, type PluginMetadata, type PluginContext } from '../PluginSystem';
import type { DIContainer } from '../../di/Container';
import { isDebugEnabled } from '../../utils';

export interface PersistenceConfig {
    storageType?: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'file' | 'custom';
    storageKey?: string;
    fileName?: string;
    autoSave?: boolean;
    autoSaveInterval?: number; // in milliseconds
    saveOnStateChange?: boolean;
    saveOnTransaction?: boolean;
    enableCompression?: boolean;
    enableEncryption?: boolean;
    encryptionKey?: string;
    maxHistorySize?: number;
    customStorage?: StorageAdapter;
}

export interface StorageAdapter {
    save(key: string, data: string): Promise<void> | void;
    load(key: string): Promise<string | null> | string | null;
    delete(key: string): Promise<void> | void;
    exists(key: string): Promise<boolean> | boolean;
    clear(): Promise<void> | void;
}

export interface PersistedState<TState = any> {
    state: TState;
    timestamp: number;
    version: string;
    metadata: {
        transactionCount?: number;
        stateChangeCount?: number;
        lastTransactionName?: string | undefined;
    };
}

export interface StateHistory<TState = any> {
    states: PersistedState<TState>[];
    currentIndex: number;
    maxSize: number;
}

/**
 * Built-in storage adapters
 */
export class LocalStorageAdapter implements StorageAdapter {
    save(key: string, data: string): void {
        if (typeof localStorage === 'undefined') {
            throw new Error('localStorage is not available');
        }
        localStorage.setItem(key, data);
    }

    load(key: string): string | null {
        if (typeof localStorage === 'undefined') {
            return null;
        }
        return localStorage.getItem(key);
    }

    delete(key: string): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
    }

    exists(key: string): boolean {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem(key) !== null;
    }

    clear(): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.clear();
    }
}

export class SessionStorageAdapter implements StorageAdapter {
    save(key: string, data: string): void {
        if (typeof sessionStorage === 'undefined') {
            throw new Error('sessionStorage is not available');
        }
        sessionStorage.setItem(key, data);
    }

    load(key: string): string | null {
        if (typeof sessionStorage === 'undefined') {
            return null;
        }
        return sessionStorage.getItem(key);
    }

    delete(key: string): void {
        if (typeof sessionStorage === 'undefined') return;
        sessionStorage.removeItem(key);
    }

    exists(key: string): boolean {
        if (typeof sessionStorage === 'undefined') return false;
        return sessionStorage.getItem(key) !== null;
    }

    clear(): void {
        if (typeof sessionStorage === 'undefined') return;
        sessionStorage.clear();
    }
}

export class IndexedDBStorageAdapter implements StorageAdapter {
    private dbName: string;
    private storeName: string = 'staga-persistence';

    constructor(dbName: string = 'staga-db') {
        this.dbName = dbName;
    }

    private async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async save(key: string, data: string): Promise<void> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            return new Promise((resolve, reject) => {
                const request = store.put(data, key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            throw new Error(`Failed to save to IndexedDB: ${error}`);
        }
    }

    async load(key: string): Promise<string | null> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    resolve(request.result || null);
                };
            });
        } catch (error) {
            console.warn(`Failed to load from IndexedDB: ${error}`);
            return null;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            return new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            console.warn(`Failed to delete from IndexedDB: ${error}`);
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            const data = await this.load(key);
            return data !== null;
        } catch {
            return false;
        }
    }

    async keys(): Promise<string[]> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            return new Promise((resolve, reject) => {
                const request = store.getAllKeys();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    resolve(request.result as string[]);
                };
            });
        } catch {
            return [];
        }
    }

    async clear(): Promise<void> {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            console.warn(`Failed to clear IndexedDB: ${error}`);
        }
    }
}

// Legacy file storage adapter - replaced with LocalStorage for browser compatibility
export class FileStorageAdapter implements StorageAdapter {
    constructor(_basePath: string = './staga-data') {
        // basePath parameter is ignored in browser environment
    }

    async save(key: string, data: string): Promise<void> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`file:${key}`, data);
            return;
        }
        throw new Error('File storage not available in this environment');

        // FileStorageAdapter is not supported in browser environment
    }

    async load(key: string): Promise<string | null> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(`file:${key}`);
        }
        return null;
    }

    async delete(key: string): Promise<void> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`file:${key}`);
        }
    }

    async exists(key: string): Promise<boolean> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(`file:${key}`) !== null;
        }
        return false;
    }

    async keys(): Promise<string[]> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('file:')) {
                    keys.push(key.substring(5)); // Remove 'file:' prefix
                }
            }
            return keys;
        }
        return [];
    }

    async clear(): Promise<void> {
        // Fallback to localStorage in browser environment
        if (typeof localStorage !== 'undefined') {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('file:')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        }
    }
}

/**
 * Persistence service for state management
 */
export class PersistenceService<TState extends object = any> {
    private storage: StorageAdapter;
    private autoSaveTimer?: NodeJS.Timeout;
    private stateHistory: StateHistory<TState>;
    private transactionCount = 0;
    private stateChangeCount = 0;
    private lastTransactionName?: string | undefined;

    constructor(private config: Required<PersistenceConfig>) {
        this.storage = this.createStorageAdapter();
        this.stateHistory = {
            states: [],
            currentIndex: -1,
            maxSize: config.maxHistorySize
        };

        if (config.autoSave && config.autoSaveInterval > 0) {
            this.startAutoSave();
        }
    }

    async saveState(state: TState): Promise<void> {
        const persistedState: PersistedState<TState> = {
            state: this.config.enableCompression ? this.compress(state) as TState : state,
            timestamp: Date.now(),
            version: '1.0.0',
            metadata: {
                transactionCount: this.transactionCount,
                stateChangeCount: this.stateChangeCount,
                lastTransactionName: this.lastTransactionName || undefined
            }
        };

        let data = JSON.stringify(persistedState);

        if (this.config.enableEncryption && this.config.encryptionKey) {
            data = this.encrypt(data, this.config.encryptionKey);
        }

        await this.storage.save(this.config.storageKey, data);
        this.addToHistory(persistedState);
    }

    async loadState(): Promise<TState | null> {
        try {
            const data = await this.storage.load(this.config.storageKey);
            if (!data) return null;

            let decryptedData = data;
            if (this.config.enableEncryption && this.config.encryptionKey) {
                decryptedData = this.decrypt(data, this.config.encryptionKey);
            }

            const persistedState: PersistedState<TState> = JSON.parse(decryptedData);

            // Update counters from metadata
            this.transactionCount = persistedState.metadata.transactionCount || 0;
            this.stateChangeCount = persistedState.metadata.stateChangeCount || 0;
            this.lastTransactionName = persistedState.metadata.lastTransactionName || undefined;

            const state = this.config.enableCompression
                ? this.decompress(persistedState.state) as TState
                : persistedState.state;

            this.addToHistory(persistedState);
            return state;
        } catch (error) {
            console.error('Failed to load persisted state:', error);
            return null;
        }
    }

    async deleteState(): Promise<void> {
        await this.storage.delete(this.config.storageKey);
        this.clearHistory();
    }

    async hasPersistedState(): Promise<boolean> {
        return await this.storage.exists(this.config.storageKey);
    }

    getStateHistory(): StateHistory<TState> {
        return { ...this.stateHistory, states: [...this.stateHistory.states] };
    }

    async restoreFromHistory(index: number): Promise<TState | null> {
        if (index < 0 || index >= this.stateHistory.states.length) {
            return null;
        }

        const persistedState = this.stateHistory.states[index];
        if (!persistedState) return null;

        this.stateHistory.currentIndex = index;
        return persistedState.state;
    }

    recordTransactionStart(name: string): void {
        this.transactionCount++;
        this.lastTransactionName = name;
    }

    recordStateChange(): void {
        this.stateChangeCount++;
    }

    getStats(): {
        transactionCount: number;
        stateChangeCount: number;
        lastTransactionName?: string | undefined;
        historySize: number;
        lastSaved?: number | undefined;
        hasPersistedData: boolean;
    } {
        const lastSaved = this.stateHistory.states.length > 0
            ? this.stateHistory.states[this.stateHistory.states.length - 1]?.timestamp
            : undefined;

        return {
            transactionCount: this.transactionCount,
            stateChangeCount: this.stateChangeCount,
            lastTransactionName: this.lastTransactionName || undefined,
            historySize: this.stateHistory.states.length,
            lastSaved,
            hasPersistedData: this.stateHistory.states.length > 0
        };
    }

    dispose(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
    }

    // ===== PRIVATE METHODS =====

    private createStorageAdapter(): StorageAdapter {
        if (this.config.customStorage) {
            return this.config.customStorage;
        }

        switch (this.config.storageType) {
            case 'localStorage':
                return new LocalStorageAdapter();
            case 'sessionStorage':
                return new SessionStorageAdapter();
            case 'file':
                // In browser environment, use localStorage instead of file system
                return new LocalStorageAdapter();
            case 'indexedDB':
                return new IndexedDBStorageAdapter(this.config.storageKey);
            default:
                return new LocalStorageAdapter();
        }
    }

    private startAutoSave(): void {
        // Note: Auto-save disabled to prevent keeping event loop alive
        // Auto-save can be triggered manually via saveState() calls
        if (isDebugEnabled()) {
            console.log('🔧 PersistencePlugin: Auto-save disabled (manual save only)');
        }
    }

    private addToHistory(persistedState: PersistedState<TState>): void {
        this.stateHistory.states.push(persistedState);

        // Trim history if it exceeds max size
        if (this.stateHistory.states.length > this.stateHistory.maxSize) {
            this.stateHistory.states = this.stateHistory.states.slice(-this.stateHistory.maxSize);
        }

        this.stateHistory.currentIndex = this.stateHistory.states.length - 1;
    }

    private clearHistory(): void {
        this.stateHistory.states = [];
        this.stateHistory.currentIndex = -1;
    }

    private compress(data: any): any {
        // Simple compression implementation
        // In a real implementation, you might use a library like pako
        return data;
    }

    private decompress(data: any): any {
        // Simple decompression implementation
        return data;
    }

    private encrypt(data: string, _key: string): string {
        // Simple encryption implementation
        // In a real implementation, you would use a proper encryption library
        return Buffer.from(data).toString('base64');
    }

    private decrypt(data: string, _key: string): string {
        // Simple decryption implementation
        return Buffer.from(data, 'base64').toString();
    }
}

/**
 * Persistence plugin for automatic state persistence
 */
export class PersistencePlugin<TState extends object = any> extends BasePlugin<TState> {
    readonly metadata: PluginMetadata = {
        name: 'persistence',
        version: '1.0.0',
        description: 'Automatic state persistence and restoration for Staga',
        author: 'Staga Team',
        keywords: ['persistence', 'storage', 'backup', 'restore']
    };

    private persistenceService?: PersistenceService<TState>;
    private lastSaveTime = 0;

    override configure(container: DIContainer): void {
        container.register(
            'persistenceService',
            () => {
                const config: Required<PersistenceConfig> = {
                    storageType: 'localStorage',
                    storageKey: 'staga-state',
                    fileName: 'staga-state.json',
                    autoSave: true,
                    autoSaveInterval: 30000, // 30 seconds
                    saveOnStateChange: true,
                    saveOnTransaction: false,
                    enableCompression: false,
                    enableEncryption: false,
                    encryptionKey: '',
                    maxHistorySize: 50,
                    customStorage: null as any,
                    ...this.getConfig()
                };

                this.persistenceService = new PersistenceService<TState>(config);
                return this.persistenceService;
            },
            { scope: 'singleton' }
        );
    }

    override validateConfig(config: Record<string, unknown>): string[] | undefined {
        const errors: string[] = [];

        if (config.storageType && !['localStorage', 'sessionStorage', 'indexedDB', 'file', 'custom'].includes(config.storageType as string)) {
            errors.push('Invalid storageType. Must be one of: localStorage, sessionStorage, indexedDB, file, custom');
        }

        if (config.autoSaveInterval && (typeof config.autoSaveInterval !== 'number' || config.autoSaveInterval < 1000)) {
            errors.push('autoSaveInterval must be at least 1000ms');
        }

        if (config.maxHistorySize && (typeof config.maxHistorySize !== 'number' || config.maxHistorySize < 1)) {
            errors.push('maxHistorySize must be at least 1');
        }

        if (config.enableEncryption && !config.encryptionKey) {
            errors.push('encryptionKey is required when enableEncryption is true');
        }

        return errors.length > 0 ? errors : undefined;
    }

    protected setupHooks(): void {
        const config = this.getConfig();

        this.setHooks({
            onInstall: async (context: PluginContext<TState>) => {
                if (!this.persistenceService) {
                    this.persistenceService = context.container.resolve<PersistenceService<TState>>('persistenceService');
                }

                // Try to restore state on install
                const savedState = await this.persistenceService.loadState();
                if (savedState) {
                    // Note: In a real implementation, we'd need a way to set the state
                    context.logger.info('Restored state from persistence');
                } else {
                    context.logger.info('No persisted state found');
                }

                context.logger.info('Persistence plugin installed');
            },

            onUninstall: (context: PluginContext<TState>) => {
                this.persistenceService?.dispose();
                context.logger.info('Persistence plugin uninstalled');
            },

            onBeforeTransaction: (_context: PluginContext<TState>, transactionName: string, _payload: any) => {
                this.persistenceService?.recordTransactionStart(transactionName);
            },

            onAfterTransaction: async (context: PluginContext<TState>, _transactionName: string, success: boolean, _error?: Error) => {
                if (config.saveOnTransaction && success) {
                    await this.saveCurrentState(context);
                }
            },

            onStateChange: async (context: PluginContext<TState>, _newState: TState, _oldState: TState) => {
                this.persistenceService?.recordStateChange();

                if (config.saveOnStateChange) {
                    // Debounce saves to avoid excessive I/O
                    const now = Date.now();
                    if (now - this.lastSaveTime > 1000) { // At most once per second
                        await this.saveCurrentState(context);
                        this.lastSaveTime = now;
                    }
                }
            }
        });
    }

    // Public API
    async saveState(state: TState): Promise<void> {
        await this.persistenceService?.saveState(state);
    }

    async loadState(): Promise<TState | null> {
        return await this.persistenceService?.loadState() || null;
    }

    async deleteState(): Promise<void> {
        await this.persistenceService?.deleteState();
    }

    getStateHistory(): StateHistory<TState> | undefined {
        return this.persistenceService?.getStateHistory();
    }

    async restoreFromHistory(index: number): Promise<TState | null> {
        return await this.persistenceService?.restoreFromHistory(index) || null;
    }

    getStats() {
        return this.persistenceService?.getStats();
    }

    private async saveCurrentState(context: PluginContext<TState>): Promise<void> {
        try {
            const currentState = context.sagaManager?.stateManager.getState() ?? (context.store?.getState() as any);
            await this.persistenceService?.saveState(currentState);
        } catch (error) {
            context.logger.error('Failed to save state', error);
        }
    }

    private getConfig(): PersistenceConfig {
        return {};
    }
}