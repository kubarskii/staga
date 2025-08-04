# Staga

TypeScript-first transactions and state orchestration with automatic rollback, retries, typed events, and reactive selectors. Now powered by a modern state core (statekit) with Signals and Streams.

## Highlights

- 🔄 Transactions with automatic rollback and per-step compensation
- 🔁 Retries and ⏱️ timeouts per step
- 🧩 Middleware (logging, timing, persistence)
- 🧠 Reactive selectors (Signals) and event Streams
- ⏪ Undo/Redo and snapshots in `StateManager`
- 📡 Typed event API (`onSagaEvent`, `onAnyEvent`) and Streams (`onEventStream`)
- 🧪 Event recording and replay

## Install

```bash
npm install staga
```

## Quick start

```ts
import { SagaManager } from 'staga';

type AppState = { users: string[]; count: number };

const saga = SagaManager.create<AppState>({ users: [], count: 0 });

// 1) Reactive selector (value-based subscription)
const count$ = saga.select(s => s.count);
const offCount = count$.subscribe(count => console.log('count =', count));

// 2) Typed event subscription
const offStart = saga.onSagaEvent('transaction:start', (e) => {
  console.log('TX started:', e.transactionName);
});

// 3) Transaction with compensation
const addUser = saga
  .createTransaction<{ name: string }>('add-user')
  .addStep('validate', (state, payload) => {
    if (!payload.name?.trim()) throw new Error('Name is required');
  })
  .addStep(
    'append-user',
    (state, payload) => {
      // mutate via StateManager
      saga.stateManager.setState({
        ...saga.getState(),
        users: [...saga.getState().users, payload.name],
        count: saga.getState().count + 1,
      });
    },
    // compensation on rollback
    (state, payload) => {
      const s = saga.getState();
      const users = s.users.slice();
      const idx = users.lastIndexOf(payload.name);
      if (idx >= 0) users.splice(idx, 1);
      saga.stateManager.setState({ ...s, users, count: s.count - 1 });
    },
    { retries: 2, timeout: 2000 }
  );

await addUser.run({ name: 'Ada' });
```

## Core concepts

### StateManager

```ts
import { StateManager } from 'staga';

const sm = new StateManager({ count: 0 });

sm.setState({ count: 1 });
sm.undo();
sm.redo();
sm.createSnapshot();
sm.rollbackToLastSnapshot();

// Reactive selector (value-based)
const count$ = sm.select(s => s.count);
const off = count$.subscribe(v => console.log(v));
```

### Transactions

```ts
const transfer = saga
  .createTransaction<{ amount: number; from: string; to: string }>('transfer')
  .addStep('debit', (state, p) => {
    // ...debit logic
  }, (state, p) => {
    // ...compensate debit
  })
  .addStep('credit', (state, p) => {
    // ...credit logic
  }, (state, p) => {
    // ...compensate credit
  }, { retries: 3, timeout: 5000 });

await transfer.run({ amount: 100, from: 'A', to: 'B' });
```

### Events (typed) and Streams

```ts
// Typed event listeners
const offAny = saga.onAnyEvent(e => console.log(e.type));
const offFail = saga.onSagaEvent('transaction:fail', e => console.error(e.error));

// Stream API (temporal)
const startStream = saga.onEventStream('transaction:start');
const offStream = startStream.subscribe(e => console.log('stream start', e.transactionName));
```

### Middleware

```ts
import { createLoggingMiddleware, createTimingMiddleware, createPersistenceMiddleware } from 'staga';

saga.use(createLoggingMiddleware());
saga.use(createTimingMiddleware());
saga.use(createPersistenceMiddleware('app-state'));
```

### Event recording and replay

```ts
saga.startRecording();
// ...run transactions & emit events
saga.stopRecording();
await saga.startReplay();
```

## Demos

Build and open the comprehensive demo:

```bash
npm run build
# then open demo/index.html in a browser
```

The demo includes:
- State selectors via Signals
- Typed events and Streams
- An AI agent powered by transactions (with retries/timeouts and compensation)
- A multi-step tool orchestration pipeline with rollback

## License

MIT
