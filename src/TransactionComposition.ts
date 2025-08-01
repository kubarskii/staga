/**
 * Transaction composition for complex workflows
 * Allows building complex transactions from simpler ones
 */

import type { SagaEvent } from './types';
import type { StateManager } from './StateManager';
import { Transaction } from './Transaction';

// ===== COMPOSITION TYPES =====

export type CompositionStrategy = 'sequential' | 'parallel' | 'conditional' | 'retry-fallback';

export interface CompositionOptions {
    strategy: CompositionStrategy;
    continueOnError?: boolean;
    timeout?: number;
    retries?: number;
    condition?: (state: any, payload: any) => boolean | Promise<boolean>;
    fallbackTransaction?: Transaction<any, any>;
}

export interface TransactionDefinition<TState extends object, TPayload = unknown> {
    transaction: Transaction<TState, TPayload>;
    options?: CompositionOptions;
    weight?: number; // For parallel execution prioritization
}

// ===== EVENT EMITTER INTERFACE =====

interface EventEmitter {
    emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void;
}

// ===== COMPOSITION RESULTS =====

export interface CompositionResult<TState extends object> {
    success: boolean;
    executedTransactions: string[];
    failedTransactions: string[];
    finalState: TState;
    errors: Error[];
    duration: number;
}

// ===== TRANSACTION COMPOSER =====

export class TransactionComposer<TState extends object, TPayload = unknown> {
    private compositions: TransactionDefinition<TState, TPayload>[] = [];

    constructor(
        private name: string,
        private stateManager: StateManager<TState>,
        private eventEmitter: EventEmitter
    ) { }

    /**
     * Add a transaction to the composition
     */
    add(
        transaction: Transaction<TState, TPayload>,
        options?: CompositionOptions
    ): this {
        this.compositions.push({
            transaction,
            options: { strategy: 'sequential', ...options }
        });
        return this;
    }

    /**
     * Add multiple transactions with the same options
     */
    addAll(
        transactions: Transaction<TState, TPayload>[],
        options?: CompositionOptions
    ): this {
        for (const transaction of transactions) {
            this.add(transaction, options);
        }
        return this;
    }

    /**
     * Add a conditional transaction
     */
    addConditional(
        transaction: Transaction<TState, TPayload>,
        condition: (state: TState, payload: TPayload) => boolean | Promise<boolean>,
        options?: Omit<CompositionOptions, 'condition'>
    ): this {
        return this.add(transaction, {
            strategy: 'conditional',
            condition,
            ...options
        });
    }

    /**
     * Add a parallel group of transactions
     */
    addParallel(
        transactions: Transaction<TState, TPayload>[],
        options?: Omit<CompositionOptions, 'strategy'>
    ): this {
        for (const transaction of transactions) {
            this.add(transaction, {
                strategy: 'parallel',
                ...options
            });
        }
        return this;
    }

    /**
     * Add a transaction with fallback
     */
    addWithFallback(
        primaryTransaction: Transaction<TState, TPayload>,
        fallbackTransaction: Transaction<TState, TPayload>,
        options?: Omit<CompositionOptions, 'strategy' | 'fallbackTransaction'>
    ): this {
        return this.add(primaryTransaction, {
            strategy: 'retry-fallback',
            fallbackTransaction,
            ...options
        });
    }

    /**
     * Execute the composed transaction
     */
    async execute(payload: TPayload): Promise<CompositionResult<TState>> {
        const startTime = Date.now();
        const result: CompositionResult<TState> = {
            success: false,
            executedTransactions: [],
            failedTransactions: [],
            finalState: this.stateManager.getState(),
            errors: [],
            duration: 0
        };

        this.eventEmitter.emitSagaEvent({
            type: 'transaction:start',
            transactionName: this.name,
            payload,
            timestamp: startTime
        });

        try {
            await this.executeCompositions(payload, result);
            result.success = result.errors.length === 0;
            result.finalState = this.stateManager.getState();

            this.eventEmitter.emitSagaEvent({
                type: 'transaction:success',
                transactionName: this.name,
                payload,
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });

        } catch (error) {
            result.success = false;
            const err = error instanceof Error ? error : new Error(String(error));
            result.errors.push(err);

            this.eventEmitter.emitSagaEvent({
                type: 'transaction:fail',
                transactionName: this.name,
                error: err,
                payload,
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });

            throw error;
        } finally {
            result.duration = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Execute compositions based on their strategies
     */
    private async executeCompositions(
        payload: TPayload,
        result: CompositionResult<TState>
    ): Promise<void> {
        const sequentialTransactions: TransactionDefinition<TState, TPayload>[] = [];
        const parallelGroups: Map<string, TransactionDefinition<TState, TPayload>[]> = new Map();

        // Group transactions by strategy
        for (const composition of this.compositions) {
            const strategy = composition.options?.strategy || 'sequential';

            if (strategy === 'parallel') {
                const groupKey = 'parallel';
                if (!parallelGroups.has(groupKey)) {
                    parallelGroups.set(groupKey, []);
                }
                parallelGroups.get(groupKey)!.push(composition);
            } else {
                sequentialTransactions.push(composition);
            }
        }

        // Execute sequential transactions
        for (const composition of sequentialTransactions) {
            await this.executeComposition(composition, payload, result);
        }

        // Execute parallel groups
        for (const [, group] of parallelGroups) {
            await this.executeParallelGroup(group, payload, result);
        }
    }

    /**
     * Execute a single composition
     */
    private async executeComposition(
        composition: TransactionDefinition<TState, TPayload>,
        payload: TPayload,
        result: CompositionResult<TState>
    ): Promise<void> {
        const { transaction, options } = composition;
        const strategy = options?.strategy || 'sequential';

        try {
            switch (strategy) {
                case 'conditional':
                    if (options?.condition) {
                        const shouldExecute = await options.condition(this.stateManager.getState(), payload);
                        if (!shouldExecute) {
                            return;
                        }
                    }
                    await transaction.run(payload);
                    break;

                case 'retry-fallback':
                    try {
                        await transaction.run(payload);
                    } catch (error) {
                        if (options?.fallbackTransaction) {
                            await options.fallbackTransaction.run(payload);
                            result.executedTransactions.push(`${transaction.name} (fallback)`);
                            return;
                        }
                        throw error;
                    }
                    break;

                default:
                    await transaction.run(payload);
            }

            result.executedTransactions.push(transaction.name);

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            result.errors.push(err);
            result.failedTransactions.push(transaction.name);

            if (!options?.continueOnError) {
                throw error;
            }
        }
    }

    /**
     * Execute transactions in parallel
     */
    private async executeParallelGroup(
        group: TransactionDefinition<TState, TPayload>[],
        payload: TPayload,
        result: CompositionResult<TState>
    ): Promise<void> {
        const promises = group.map(async (composition) => {
            try {
                await composition.transaction.run(payload);
                result.executedTransactions.push(composition.transaction.name);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                result.errors.push(err);
                result.failedTransactions.push(composition.transaction.name);

                if (!composition.options?.continueOnError) {
                    throw error;
                }
            }
        });

        await Promise.all(promises);
    }

    /**
     * Get composition statistics
     */
    getStats(): {
        totalTransactions: number;
        sequentialCount: number;
        parallelCount: number;
        conditionalCount: number;
        fallbackCount: number;
    } {
        const stats = {
            totalTransactions: this.compositions.length,
            sequentialCount: 0,
            parallelCount: 0,
            conditionalCount: 0,
            fallbackCount: 0
        };

        for (const composition of this.compositions) {
            const strategy = composition.options?.strategy || 'sequential';
            switch (strategy) {
                case 'sequential':
                    stats.sequentialCount++;
                    break;
                case 'parallel':
                    stats.parallelCount++;
                    break;
                case 'conditional':
                    stats.conditionalCount++;
                    break;
                case 'retry-fallback':
                    stats.fallbackCount++;
                    break;
            }
        }

        return stats;
    }
}

// ===== COMPOSITION BUILDER =====

export class CompositionBuilder<TState extends object> {
    constructor(
        private stateManager: StateManager<TState>,
        private eventEmitter: EventEmitter
    ) { }

    /**
     * Create a new transaction composer
     */
    createComposer<TPayload = unknown>(name: string): TransactionComposer<TState, TPayload> {
        return new TransactionComposer(name, this.stateManager, this.eventEmitter);
    }

    /**
     * Create a sequential composition
     */
    sequential<TPayload = unknown>(
        name: string,
        transactions: Transaction<TState, TPayload>[]
    ): TransactionComposer<TState, TPayload> {
        const composer = this.createComposer<TPayload>(name);
        return composer.addAll(transactions);
    }

    /**
     * Create a parallel composition
     */
    parallel<TPayload = unknown>(
        name: string,
        transactions: Transaction<TState, TPayload>[]
    ): TransactionComposer<TState, TPayload> {
        const composer = this.createComposer<TPayload>(name);
        return composer.addParallel(transactions);
    }

    /**
     * Create a conditional composition
     */
    conditional<TPayload = unknown>(
        name: string,
        transaction: Transaction<TState, TPayload>,
        condition: (state: TState, payload: TPayload) => boolean | Promise<boolean>
    ): TransactionComposer<TState, TPayload> {
        const composer = this.createComposer<TPayload>(name);
        return composer.addConditional(transaction, condition);
    }

    /**
     * Create a composition with fallback
     */
    withFallback<TPayload = unknown>(
        name: string,
        primaryTransaction: Transaction<TState, TPayload>,
        fallbackTransaction: Transaction<TState, TPayload>
    ): TransactionComposer<TState, TPayload> {
        const composer = this.createComposer<TPayload>(name);
        return composer.addWithFallback(primaryTransaction, fallbackTransaction);
    }
}

// ===== PREDEFINED COMPOSITION PATTERNS =====

export class CompositionPatterns {
    /**
     * Circuit breaker pattern - fails fast after threshold
     */
    static createCircuitBreaker<TState extends object, TPayload = unknown>(
        transaction: Transaction<TState, TPayload>,
        threshold: number = 3,
        resetTime: number = 60000
    ): (state: TState, payload: TPayload) => Promise<void> {
        let failures = 0;
        let lastFailure = 0;

        return async (_state: TState, payload: TPayload) => {
            const now = Date.now();

            // Reset if enough time has passed
            if (now - lastFailure > resetTime) {
                failures = 0;
            }

            // Check if circuit is open
            if (failures >= threshold) {
                throw new Error(`Circuit breaker open: ${failures} failures`);
            }

            try {
                await transaction.run(payload);
                failures = 0; // Reset on success
            } catch (error) {
                failures++;
                lastFailure = now;
                throw error;
            }
        };
    }

    /**
     * Retry with exponential backoff
     */
    static createExponentialRetry<TState extends object, TPayload = unknown>(
        transaction: Transaction<TState, TPayload>,
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): (state: TState, payload: TPayload) => Promise<void> {
        return async (_state: TState, payload: TPayload) => {
            let lastError: Error;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    await transaction.run(payload);
                    return;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    if (attempt < maxRetries) {
                        const delay = baseDelay * Math.pow(2, attempt);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            throw lastError!;
        };
    }

    /**
     * Bulkhead pattern - resource isolation
     */
    static createBulkhead<TState extends object, TPayload = unknown>(
        transaction: Transaction<TState, TPayload>,
        maxConcurrent: number = 5
    ): (state: TState, payload: TPayload) => Promise<void> {
        let activeCount = 0;
        const queue: Array<() => void> = [];

        return async (_state: TState, payload: TPayload) => {
            if (activeCount >= maxConcurrent) {
                await new Promise<void>(resolve => queue.push(resolve));
            }

            activeCount++;
            try {
                await transaction.run(payload);
            } finally {
                activeCount--;
                const next = queue.shift();
                if (next) next();
            }
        };
    }
}