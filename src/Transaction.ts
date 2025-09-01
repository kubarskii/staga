import type { SagaStep, StepFunction, StepOptions, MiddlewareContext, Middleware, TransactionOptions } from './types';
import type { StateManager } from './StateManager';
import { MiddlewareOrchestrator } from './MiddlewareOrchestrator';
import { ReactiveStateProxy, type ReactiveProxyOptions } from './ReactiveStateProxy';
import { createTransaction as createSKTransaction, type TxEvent, type TxStep } from './statekit';

// Event emitter interface to avoid circular dependency
interface EventEmitter {
  emitSagaEvent(event: unknown): void;
}

/**
 * Generic step definition with proper payload typing
 */
interface GenericStepDefinition<TState extends object, TPayload = unknown> {
  name: string;
  execute: (state: TState, payload: TPayload) => void | Promise<void>;
  compensate: ((state: TState, payload: TPayload) => void | Promise<void>) | undefined;
  options: StepOptions;
}

/**
 * Type-safe transaction builder using pure generics
 */
export class TransactionBuilder<TState extends object, TPayload = unknown> {
  private steps: GenericStepDefinition<TState, TPayload>[] = [];

  constructor(
    public name: string,
    private stateManager: StateManager<TState>,
    private eventEmitter: EventEmitter,
    private middleware: Middleware<TState, TPayload>[],
    private reactiveProxyOptions: ReactiveProxyOptions = {},
    private transactionOptions: TransactionOptions = {}
  ) { }

  /**
   * Configure transaction options (e.g., disable auto rollback)
   */
  configure(options: TransactionOptions): this {
    this.transactionOptions = { ...this.transactionOptions, ...options };
    return this;
  }

  /**
   * Add a step with full generic type safety
   */
  addStep(
    name: string,
    execute: (state: TState, payload: TPayload) => void | Promise<void>,
    compensate?: (state: TState, payload: TPayload) => void | Promise<void>,
    options: StepOptions = {}
  ): this {
    const genericStep: GenericStepDefinition<TState, TPayload> = {
      name,
      execute,
      compensate: compensate || undefined,
      options
    };

    this.steps.push(genericStep);
    return this;
  }

  /**
   * Add a void step using generics
   */
  addVoidStep(
    name: string,
    execute: (state: TState) => void | Promise<void>,
    compensate?: (state: TState) => void | Promise<void>,
    options: StepOptions = {}
  ): Transaction<TState, void> {
    const voidMiddleware: Middleware<TState, void>[] = [];
    const transaction = new Transaction<TState, void>(
      this.name,
      this.stateManager,
      this.eventEmitter,
      voidMiddleware,
      this.reactiveProxyOptions,
      this.transactionOptions
    );
    return transaction.addStep(name, execute, compensate, options);
  }

  /**
   * Execute with perfect generic type inference
   */
  run(payload: TPayload): Promise<void> {
    const transaction = new Transaction<TState, TPayload>(
      this.name,
      this.stateManager,
      this.eventEmitter,
      this.middleware,
      this.reactiveProxyOptions,
      this.transactionOptions
    );

    // Apply all steps with proper typing
    for (const step of this.steps) {
      transaction.addStep(
        step.name,
        step.execute,
        step.compensate,
        step.options
      );
    }

    return transaction.run(payload);
  }
}

/**
 * Transaction represents a series of steps that can be executed with rollback support
 */
export class Transaction<TState extends object, TPayload = unknown> {
  private steps: SagaStep<TState, TPayload>[] = [];
  private reactiveProxy: ReactiveStateProxy<TState>;
  private middlewareOrchestrator: MiddlewareOrchestrator<TState, TPayload>;
  private options: TransactionOptions;
  private executedStepsStack: SagaStep<TState, TPayload>[] = [];
  private currentStepName: string | null = null;

  // Expose steps for testing without type casting
  public get stepsCount(): number {
    return this.steps.length;
  }

  public getStep(index: number): SagaStep<TState, TPayload> | undefined {
    return this.steps[index];
  }

  constructor(
    public name: string,
    private stateManager: StateManager<TState>,
    private eventEmitter: EventEmitter,
    middleware: Middleware<TState, TPayload>[],
    reactiveProxyOptions: ReactiveProxyOptions = {},
    transactionOptions: TransactionOptions = {}
  ) {
    this.reactiveProxy = new ReactiveStateProxy(stateManager, reactiveProxyOptions);
    this.middlewareOrchestrator = new MiddlewareOrchestrator(middleware);
    this.options = transactionOptions;
  }

  /**
   * Configure transaction options (e.g., disable auto rollback)
   */
  configure(options: TransactionOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Add a step to the transaction
   */
  addStep(
    name: string,
    execute: StepFunction<TState, TPayload>,
    compensate?: StepFunction<TState, TPayload>,
    options: StepOptions = {}
  ): this {
    this.steps.push({
      name,
      execute,
      compensate,
      retries: Math.max(0, options.retries ?? 0),
      timeout: options.timeout ?? 0,
    });
    return this;
  }



  /**
 * Execute the transaction with all its steps
 */
  async run(payload: TPayload): Promise<void> {
    const startTime = Date.now();

    // Capture the initial state before the transaction
    const initialState = this.stateManager.clone(this.stateManager.getState());
    this.stateManager.createSnapshot();

    // Middleware context remains the same
    const context: MiddlewareContext<TState, TPayload> = {
      transaction: this,
      payload,
      getState: () => this.stateManager.getState(),
      setState: (newState: TState) => this.stateManager.setState(newState)
    };

    // Map steps to statekit TxSteps (without built-in compensation/order, we'll handle it manually)
    const txSteps: TxStep<TState>[] = this.steps.map((step) => ({
      name: step.name,
      retry: step.retries,
      timeoutMs: step.timeout,
      do: async () => {
        const proxiedState = this.reactiveProxy.createProxy(this.stateManager.getState());
        await step.execute(proxiedState, payload as TPayload);
        // notify immediate change (proxy may have mutated state object)
        this.stateManager.notifyChange();
      },
    }));

    // Create a lightweight adapter store for tx events routing
    this.executedStepsStack = [];
    this.currentStepName = null;

    const skStoreAdapter = {
      _notifyTxEvent: (e: TxEvent) => this.routeTxEventToSaga(e, payload, startTime)
    } as unknown as import('./statekit').Store<TState>;

    const skTx = createSKTransaction<TState>(skStoreAdapter, txSteps);

    return this.middlewareOrchestrator.executeWithMiddleware(context, async () => {
      try {
        await skTx.run();

        // After successful execution, if state has changed, add it to undo stack
        const finalState = this.stateManager.getState();
        const eq = this.options.equalityFn ?? ((this.stateManager as any)['options'].equalityFn as (a: TState, b: TState) => boolean);
        if (!eq(initialState, finalState)) {
          this.stateManager.addToUndoStack(initialState);
        }

        // Remove rollback snapshot since the transaction completed successfully
        this.stateManager.discardLastSnapshot();
        // Commit any pending proxy-driven mutations to selectors/signals
        this.stateManager.commitProxyMutations();
      } catch (err) {
        const baseError = err instanceof Error ? err : new Error(String(err));
        let message = baseError.message;
        if (/^timeout \d+ms$/.test(message)) {
          const stepName = this.currentStepName || 'unknown';
          message = `Step "${stepName}" timed out`;
        }

        if (!this.options.disableAutoRollback) {
          // Emit failure first to match legacy expectations
          this.eventEmitter.emitSagaEvent({
            type: 'transaction:fail',
            transactionName: this.name,
            error: new Error(message),
            payload,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          });

          // Manual rollback with compensation in reverse order
          for (let i = this.executedStepsStack.length - 1; i >= 0; i--) {
            const step = this.executedStepsStack[i];
            if (step && step.compensate) {
              this.eventEmitter.emitSagaEvent({
                type: 'step:rollback',
                stepName: step.name,
                payload,
                timestamp: Date.now(),
              });
              await step.compensate(this.stateManager.getState(), payload);
              this.stateManager.notifyChange();
            }
          }

          this.eventEmitter.emitSagaEvent({
            type: 'transaction:rollback',
            transactionName: this.name,
            payload,
            timestamp: Date.now(),
          });

          this.stateManager.rollbackToLastSnapshot();
          // Ensure selectors reflect rolled-back state
          this.stateManager.commitProxyMutations();
          throw new Error(`Transaction "${this.name}" failed and rolled back: ${message}`);
        } else {
          this.eventEmitter.emitSagaEvent({
            type: 'transaction:fail',
            transactionName: this.name,
            error: new Error(message),
            payload,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
          });
          this.stateManager.discardLastSnapshot();
          // Reflect final state after failure without rollback
          this.stateManager.commitProxyMutations();
          throw new Error(`Transaction "${this.name}" failed (rollback disabled): ${message}`);
        }
      }
    });
  }

  // executeStep no longer used; retries/timeouts handled by statekit transaction

  private routeTxEventToSaga(e: TxEvent, payload: TPayload, txStart: number) {
    switch (e.type) {
      case 'start':
        this.eventEmitter.emitSagaEvent({
          type: 'transaction:start',
          transactionName: this.name,
          payload,
          timestamp: Date.now()
        });
        break;
      case 'step:start':
        this.currentStepName = e.step;
        this.eventEmitter.emitSagaEvent({
          type: 'step:start',
          stepName: e.step,
          payload,
          timestamp: Date.now()
        });
        break;
      case 'step:success':
        {
          const executed = this.steps.find(s => s.name === e.step);
          if (executed) this.executedStepsStack.push(executed);
        }
        this.eventEmitter.emitSagaEvent({
          type: 'step:success',
          stepName: e.step,
          payload,
          duration: 0,
          timestamp: Date.now()
        });
        break;
      case 'step:retry':
        this.eventEmitter.emitSagaEvent({
          type: 'step:retry',
          stepName: e.step,
          payload,
          attempt: e.attempt,
          lastError: e.error as Error,
          timestamp: Date.now()
        });
        break;
      case 'step:failed':
      case 'compensating':
      case 'compensated':
        // handled explicitly in run() for ordering
        break;
      case 'success':
        this.eventEmitter.emitSagaEvent({
          type: 'transaction:success',
          transactionName: this.name,
          payload,
          duration: Date.now() - txStart,
          timestamp: Date.now()
        });
        break;
      case 'failed':
        // handled in run() to normalize message and ordering
        break;
      case 'cancelled':
        // map to fail with AbortError semantics if needed
        this.eventEmitter.emitSagaEvent({
          type: 'transaction:fail',
          transactionName: this.name,
          error: new Error('Transaction cancelled'),
          payload,
          duration: Date.now() - txStart,
          timestamp: Date.now()
        });
        break;
    }
  }

  /**
   * Manually rollback the transaction (useful when auto-rollback is disabled)
   */
  async rollback(payload: TPayload): Promise<void> {
    if (this.options.disableAutoRollback) {
      await this.rollbackSteps(this.steps, payload);
      this.stateManager.rollbackToLastSnapshot();
    } else {
      throw new Error('Manual rollback is only available when auto-rollback is disabled');
    }
  }

  /**
   * Rollback executed steps in reverse order
   */
  private async rollbackSteps(executedSteps: SagaStep<TState, TPayload>[], payload: TPayload): Promise<void> {
    // Execute compensation in reverse order first
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];
      if (step && step.compensate) {
        try {
          this.eventEmitter.emitSagaEvent({
            type: 'step:rollback',
            stepName: step.name,
            payload,
            timestamp: Date.now()
          });

          await step.compensate(this.stateManager.getState(), payload);
          this.stateManager.notifyChange();
        } catch (rollbackError) {
          console.error(`Failed to rollback step "${step.name}":`, rollbackError);
          // Throw compensation error to bubble it up
          throw rollbackError;
        }
      }
    }

    // Emit transaction rollback event after all step compensations
    this.eventEmitter.emitSagaEvent({
      type: 'transaction:rollback',
      transactionName: this.name,
      payload,
      timestamp: Date.now()
    });
  }
}