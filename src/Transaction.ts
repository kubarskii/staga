import type { SagaStep, StepFunction, StepOptions, MiddlewareContext, Middleware } from './types';
import type { StateManager } from './StateManager';
import { TransactionExecutor } from './TransactionExecutor';
import { TransactionRollback } from './TransactionRollback';
import { MiddlewareOrchestrator } from './MiddlewareOrchestrator';
import { deepEqual } from './ReactiveSelectors';

// Forward declaration to avoid circular dependency
interface EventEmitter {
  emit<T extends import('./types.js').EventName>(event: T, ...args: import('./types.js').EventArgs<T>): void;
  emitSagaEvent<TPayload = unknown>(event: import('./types.js').SagaEvent<TPayload>): void;
}

/**
 * Generic step definition that can work with any payload type
 */
interface GenericStepDefinition<TState extends object> {
  name: string;
  execute: <TPayload>(state: TState, payload: TPayload) => void | Promise<void>;
  compensate: (<TPayload>(state: TState, payload: TPayload) => void | Promise<void>) | undefined;
  options: StepOptions;
}

/**
 * Type-safe transaction builder using pure generics
 */
export class TransactionBuilder<TState extends object, TPayload = unknown> {
  private steps: GenericStepDefinition<TState>[] = [];

  constructor(
    public name: string,
    private stateManager: StateManager<TState>,
    private eventEmitter: EventEmitter,
    private middleware: Middleware<TState, TPayload>[]
  ) { }

  /**
   * Add a step with full generic type safety
   */
  addStep(
    name: string,
    execute: (state: TState, payload: TPayload) => void | Promise<void>,
    compensate?: (state: TState, payload: TPayload) => void | Promise<void>,
    options: StepOptions = {}
  ): this {
    // Create generic step that can work with any payload type
    const genericStep: GenericStepDefinition<TState> = {
      name,
      execute: <T>(state: TState, payload: T) => execute(state, payload as TPayload & T),
      compensate: compensate
        ? <T>(state: TState, payload: T) => compensate!(state, payload as TPayload & T)
        : undefined,
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
      voidMiddleware
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
      this.middleware
    );

    // Apply all generic steps with the inferred payload type
    for (const step of this.steps) {
      const typedExecute: StepFunction<TState, TPayload> = (state: TState, typedPayload: TPayload) => {
        return step.execute<TPayload>(state, typedPayload);
      };

      const typedCompensate: StepFunction<TState, TPayload> | undefined = step.compensate
        ? (state: TState, typedPayload: TPayload) => {
          return step.compensate!<TPayload>(state, typedPayload);
        }
        : undefined;

      transaction.addStep(
        step.name,
        typedExecute,
        typedCompensate,
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
  private executor: TransactionExecutor<TState, TPayload>;
  private rollback: TransactionRollback<TState, TPayload>;
  private middlewareOrchestrator: MiddlewareOrchestrator<TState, TPayload>;

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
    middleware: Middleware<TState, TPayload>[]
  ) {
    this.executor = new TransactionExecutor(stateManager, eventEmitter);
    this.rollback = new TransactionRollback(stateManager, eventEmitter);
    this.middlewareOrchestrator = new MiddlewareOrchestrator(middleware);
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
      retries: options.retries ?? 0,
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
    const initialState = structuredClone(this.stateManager.getState());
    this.stateManager.createSnapshot();

    this.eventEmitter.emitSagaEvent({
      type: 'transaction:start',
      transactionName: this.name,
      payload,
      timestamp: startTime
    });

    const context: MiddlewareContext<TState, TPayload> = {
      transaction: this,
      payload,
      getState: () => this.stateManager.getState(),
      setState: (newState: TState) => this.stateManager.setState(newState)
    };

    return this.middlewareOrchestrator.executeWithMiddleware(context, async () => {
      const executedSteps: SagaStep<TState, TPayload>[] = [];

      try {
        // Execute steps one by one, tracking which ones complete successfully
        for (const step of this.steps) {
          await this.executor.executeStep(step, payload);
          executedSteps.push(step);
        }

        // After successful execution, if state has changed, add it to undo stack
        const finalState = this.stateManager.getState();
        if (!deepEqual(initialState, finalState)) {
          this.stateManager.addToUndoStack(initialState);
        }

        this.eventEmitter.emitSagaEvent({
          type: 'transaction:success',
          transactionName: this.name,
          payload,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        });

      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        this.eventEmitter.emitSagaEvent({
          type: 'transaction:fail',
          transactionName: this.name,
          error,
          payload,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        });

        // Execute rollback with the steps that were successfully executed
        await this.rollback.rollbackTransaction(this.name, executedSteps, payload);

        throw new Error(`Transaction "${this.name}" failed and rolled back: ${error.message}`);
      }
    });
  }
}