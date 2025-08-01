/**
 * TransactionExecutor handles the execution of individual steps with retry logic and timeout handling
 */

import type { SagaStep, SagaEvent } from './types';
import type { StateManager } from './StateManager';

interface EventEmitter {
    emitSagaEvent<TPayload = unknown>(event: SagaEvent<TPayload>): void;
}

export class TransactionExecutor<TState extends object, TPayload> {
    constructor(
        private stateManager: StateManager<TState>,
        private eventEmitter: EventEmitter
    ) { }

    /**
     * Execute a single step with retry logic and timeout handling
     */
    async executeStep(step: SagaStep<TState, TPayload>, payload: TPayload): Promise<void> {
        let attempts = 0;
        const stepStartTime = Date.now();

        this.eventEmitter.emitSagaEvent({
            type: 'step:start',
            stepName: step.name,
            payload,
            timestamp: stepStartTime
        });

        while (true) {
            try {
                if (step.timeout > 0) {
                    await Promise.race([
                        step.execute(this.stateManager.getState(), payload),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Step "${step.name}" timed out`)), step.timeout)
                        ),
                    ]);
                } else {
                    await step.execute(this.stateManager.getState(), payload);
                }

                // Step succeeded
                this.eventEmitter.emitSagaEvent({
                    type: 'step:success',
                    stepName: step.name,
                    payload,
                    duration: Date.now() - stepStartTime,
                    timestamp: Date.now()
                });
                return;

            } catch (err) {
                if (attempts >= step.retries) {
                    throw err;
                }
                attempts++;
                this.eventEmitter.emitSagaEvent({
                    type: 'step:retry',
                    stepName: step.name,
                    payload,
                    attempt: attempts,
                    lastError: err as Error,
                    timestamp: Date.now()
                });
            }
        }
    }

    /**
     * Execute multiple steps in sequence
     */
    async executeSteps(steps: SagaStep<TState, TPayload>[], payload: TPayload): Promise<SagaStep<TState, TPayload>[]> {
        const executed: SagaStep<TState, TPayload>[] = [];

        for (const step of steps) {
            await this.executeStep(step, payload);
            executed.push(step);
        }

        return executed;
    }
}