# Staga

A TypeScript library for managing state transactions with the saga pattern, featuring rollbacks, retries, middleware support, and undo/redo functionality.

## Features

- 🔄 **Transaction Management**: Execute multiple steps as atomic operations with automatic rollback on failure
- ⏪ **Undo/Redo**: Built-in undo/redo functionality for state management
- 🔁 **Retry Logic**: Configurable retry mechanisms for failed steps
- ⏱️ **Timeout Support**: Set timeouts for individual steps
- 🔌 **Middleware**: Extensible middleware system for cross-cutting concerns
- 💾 **Persistence**: Built-in persistence middleware for state storage
- 📦 **TypeScript**: Full TypeScript support with strong typing
- 🎯 **Event System**: Listen to transaction and step lifecycle events

## Installation

```bash
npm install staga
```

## Quick Start

```typescript
import { SagaManager } from 'staga';

// Define your state type
interface AppState {
  users: string[];
  count: number;
}

// Create a saga manager with initial state
const saga = SagaManager.create<AppState>({
  users: [],
  count: 0
});

// Create a transaction
const userTransaction = saga
  .createTransaction('addUser')
  .addStep(
    'validateUser',
    async (state, payload: { name: string }) => {
      if (!payload.name) throw new Error('Name is required');
    }
  )
  .addStep(
    'addToUsers',
    async (state, payload) => {
      state.users.push(payload.name);
      state.count++;
    },
    // Compensation function for rollback
    async (state, payload) => {
      const index = state.users.indexOf(payload.name);
      if (index > -1) {
        state.users.splice(index, 1);
        state.count--;
      }
    },
    { retries: 3, timeout: 5000 }
  );

// Execute the transaction
try {
  await userTransaction.run({ name: 'John' });
  console.log('User added successfully');
} catch (error) {
  console.error('Transaction failed:', error);
}
```

## Core Concepts

### StateManager

Manages application state with undo/redo functionality and snapshots:

```typescript
import { StateManager } from 'staga';

const stateManager = new StateManager({ count: 0 });

// Get current state
const currentState = stateManager.getState();

// Update state
stateManager.setState({ count: 1 });

// Undo/redo
stateManager.undo();
stateManager.redo();

// Snapshots for rollback
stateManager.createSnapshot();
stateManager.rollbackToLastSnapshot();
```

### Transactions

Transactions group multiple steps that execute as an atomic operation:

```typescript
const transaction = saga
  .createTransaction('transfer-money')
  .addStep(
    'debit-source',
    async (state, payload) => {
      // Debit logic
    },
    async (state, payload) => {
      // Compensation: credit back
    }
  )
  .addStep(
    'credit-target',
    async (state, payload) => {
      // Credit logic
    },
    async (state, payload) => {
      // Compensation: debit back
    }
  );

await transaction.run({ amount: 100, from: 'A', to: 'B' });
```

### Middleware

Add cross-cutting concerns with middleware:

```typescript
import { createPersistenceMiddleware, createLoggingMiddleware } from 'staga';

// Add persistence
saga.use(createPersistenceMiddleware('app-state'));

// Add logging
saga.use(createLoggingMiddleware());

// Custom middleware
saga.use(async (ctx, next) => {
  console.log(`Starting: ${ctx.transaction.name}`);
  await next();
  console.log(`Completed: ${ctx.transaction.name}`);
});
```

### Event System

Listen to transaction lifecycle events:

```typescript
import {
  TransactionStartEvent,
  TransactionSuccessEvent,
  TransactionFailEvent,
  StepRetryEvent,
} from 'staga';

saga.onEvent('transaction:start', (event: TransactionStartEvent) => {
  console.log(`Transaction ${event.transactionName} started`);
});

saga.onEvent('transaction:success', (event: TransactionSuccessEvent) => {
  console.log(`Transaction ${event.transactionName} completed`);
});

saga.onEvent('transaction:fail', (event: TransactionFailEvent) => {
  console.log(`Transaction ${event.transactionName} failed:`, event.error);
});

saga.onEvent('step:retry', (event: StepRetryEvent) => {
  console.log(`Step ${event.stepName} retry attempt ${event.attempt}`);
});
```

Note: `saga.on` is deprecated in favor of `saga.onEvent`.

## Advanced Usage

### Persistence

```typescript
import { loadPersistedState, createPersistenceMiddleware } from 'staga';

// Load persisted state
const initialState = loadPersistedState('my-app', { users: [], count: 0 });

const saga = SagaManager.create(initialState);
saga.use(createPersistenceMiddleware('my-app'));
```

### Custom Middleware

```typescript
function createValidationMiddleware<TState>(): Middleware<TState, any> {
  return async (ctx, next) => {
    // Pre-execution validation
    if (!ctx.payload) {
      throw new Error('Payload is required');
    }
    
    await next();
    
    // Post-execution logic
    console.log('Transaction completed successfully');
  };
}

saga.use(createValidationMiddleware());
```

### Error Handling

```typescript
const transaction = saga
  .createTransaction('risky-operation')
  .addStep(
    'step1',
    async (state, payload) => {
      // This might fail
      throw new Error('Something went wrong');
    },
    async (state, payload) => {
      // This compensation will run during rollback
      console.log('Rolling back step1');
    },
    { retries: 3, timeout: 10000 }
  );

try {
  await transaction.run(payload);
} catch (error) {
  // All executed steps have been compensated
  // State has been rolled back to snapshot
  console.error('Transaction failed and rolled back');
}
```

## API Reference

### SagaManager

- `static create<TState>(initialState: TState): SagaManager<TState>`
- `createTransaction<TPayload>(name: string): Transaction<TState, TPayload>`
- `use<TPayload>(middleware: Middleware<TState, TPayload>): void`
- `on(event: string, callback: Listener): void`
- `getState(): TState`
- `undo(): void`
- `redo(): void`

### Transaction

- `addStep(name: string, execute: StepFunction, compensate?: StepFunction, options?: StepOptions): this`
- `run(payload: TPayload): Promise<void>`

### Built-in Middleware

- `createPersistenceMiddleware<TState>(storageKey: string): Middleware<TState, any>`
- `createLoggingMiddleware<TState>(): Middleware<TState, any>`
- `createTimingMiddleware<TState>(onComplete?: (name: string, duration: number) => void): Middleware<TState, any>`

## Events

- `transaction:start` - Transaction execution started
- `transaction:success` - Transaction completed successfully
- `transaction:fail` - Transaction failed
- `transaction:rollback` - Transaction rolled back
- `step:start` - Step execution started
- `step:success` - Step completed successfully
- `step:retry` - Step retry attempt
- `step:rollback` - Step compensation executed

## License

MIT