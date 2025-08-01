/**
 * TransactionRollback handles compensation and rollback logic for failed transactions
 */

import type { SagaStep, SagaEvent } from './types';
import type { StateManager } from './StateManager';

interface EventEmitter {
    emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void;
}

export class TransactionRollback<TState extends object, TPayload> {
    constructor(
        private stateManager: StateManager<TState>,
        private eventEmitter: EventEmitter
    ) { }

    /**
     * Execute compensation for a single step
     */
    async compensateStep(step: SagaStep<TState, TPayload>, payload: TPayload): Promise<void> {
        if (!step.compensate) {
            return;
        }

        this.eventEmitter.emitSagaEvent({
            type: 'step:rollback',
            stepName: step.name,
            payload,
            timestamp: Date.now()
        });

        await step.compensate(this.stateManager.getState(), payload);
    }

    /**
 * Execute compensation for multiple steps in reverse order
 */
    async rollbackSteps(executedSteps: SagaStep<TState, TPayload>[], payload: TPayload): Promise<void> {
        // Execute compensation in reverse order (make a copy to avoid mutating the original array)
        const stepsToRollback = [...executedSteps].reverse();
        for (const step of stepsToRollback) {
            await this.compensateStep(step, payload);
        }

        // Rollback to the last snapshot
        this.stateManager.rollbackToLastSnapshot();
    }

    /**
 * Full transaction rollback with proper event emission
 */
    async rollbackTransaction(
        transactionName: string,
        executedSteps: SagaStep<TState, TPayload>[],
        payload: TPayload
    ): Promise<void> {
        // Execute step-by-step compensation
        await this.rollbackSteps(executedSteps, payload);

        // Emit transaction rollback event
        this.eventEmitter.emitSagaEvent({
            type: 'transaction:rollback',
            transactionName,
            payload,
            timestamp: Date.now()
        });
    }
}