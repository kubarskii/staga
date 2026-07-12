# Staga

TypeScript-first transactions and state orchestration with automatic rollback, retries, typed events, and reactive selectors. Powered by a modern reactive core (**statekit**) with Signals and Streams.

## Contents

- [Highlights](#highlights)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [StateManager](#statemanager)
  - [Transactions](#transactions)
  - [Selectors & computed values](#selectors--computed-values)
  - [Events and Streams](#events-and-streams)
  - [Middleware](#middleware)
  - [Recording & replay](#recording--replay)
- [Configuration](#configuration)
- [Metrics & introspection](#metrics--introspection)
- [statekit — low-level reactive core](#statekit--low-level-reactive-core)
- [Error handling](#error-handling)
- [Dependency injection](#dependency-injection)
- [Plugins](#plugins)
- [Demos](#demos)
- [Changelog](#changelog)
- [License](#license)

## Highlights

- 🔄 Transactions with automatic rollback and per-step compensation
- 🔁 Retries and ⏱️ timeouts per step
- ✍️ Direct, mutation-style step logic backed by a reactive proxy
- 🧩 Middleware (logging, timing, persistence)
- 🧠 Reactive selectors (Signals) and event Streams
- ⏪ Undo / redo and snapshots in `StateManager`
- 📡 Typed event API (`onSagaEvent`, `onAnyEvent`) and Streams (`onEventStream`)
- 🧪 Event recording and replay
- 🧱 Optional DI container and plugin system

## Install

```bash
npm install @staga/core
```

## Quick start

```ts
import { SagaManager } from '@staga/core';

type AppState = { users: string[]; count: number };

const saga = SagaManager.create<AppState>({ users: [], count: 0 });

// 1) Reactive selector (value-based subscription)
const count$ = saga.select(s => s.count);
const offCount = count$.subscribe(count => console.log('count =', count));

// 2) Typed event subscription
const offStart = saga.onSagaEvent('transaction:start', (e) => {
  console.log('TX started:', e.transactionName);
});

// 3) Transaction with per-step compensation.
//    Inside a step you can mutate `state` directly — mutations are tracked
//    by a reactive proxy and rolled back automatically on failure.
const addUser = saga
  .createTransaction<{ name: string }>('add-user')
  .addStep('validate', (state, payload) => {
    if (!payload.name?.trim()) throw new Error('Name is required');
  })
  .addStep(
    'append-user',
    (state, payload) => {
      state.users.push(payload.name);
      state.count += 1;
    },
    // compensation, run in reverse order if a later step throws
    (state, payload) => {
      const idx = state.users.lastIndexOf(payload.name);
      if (idx >= 0) state.users.splice(idx, 1);
      state.count -= 1;
    },
    { retries: 2, timeout: 2000 }
  );

await addUser.run({ name: 'Ada' });
```

> Prefer immutable updates? You can also call `saga.stateManager.setState(next)`
> inside a step instead of mutating `state` directly.

## Core concepts

### StateManager

`StateManager` holds the state, drives reactivity, and keeps undo/redo history and snapshots.

```ts
import { StateManager } from '@staga/core';

const sm = new StateManager({ count: 0 });

sm.setState({ count: 1 });
sm.undo();                    // back to { count: 0 }
sm.redo();                    // forward to { count: 1 }

sm.createSnapshot();
sm.setState({ count: 99 });
sm.rollbackToLastSnapshot();  // back to the snapshot

// Reactive selector (value-based). undo/redo/rollback all stay in sync.
const count$ = sm.select(s => s.count);
const off = count$.subscribe(v => console.log(v));
```

`undo()`, `redo()` and `rollbackToLastSnapshot()` all propagate through the
reactive core, so `select()`-based signals and `subscribe()` observers stay
consistent.

### Transactions

A transaction is an ordered list of steps. Each step has an `execute` function
and an optional `compensate` function. If any step throws, previously executed
steps are compensated in reverse order and the state is rolled back to the
snapshot taken at the start of the transaction.

```ts
const transfer = saga
  .createTransaction<{ amount: number; from: string; to: string }>('transfer')
  .addStep(
    'debit',
    (state, p) => { /* ...debit logic... */ },
    (state, p) => { /* ...compensate debit... */ },
  )
  .addStep(
    'credit',
    (state, p) => { /* ...credit logic... */ },
    (state, p) => { /* ...compensate credit... */ },
    { retries: 3, timeout: 5000 }, // per-step options
  );

await transfer.run({ amount: 100, from: 'A', to: 'B' });
```

**Per-step options** (`StepOptions`):

| Option    | Type     | Default | Meaning                                             |
| --------- | -------- | ------- | --------------------------------------------------- |
| `retries` | `number` | `0`     | Extra attempts before the step is considered failed |
| `timeout` | `number` | `0`     | Per-attempt timeout in ms (`0` disables)            |

#### Disabling auto-rollback & manual rollback

By default a failed transaction rolls back automatically. You can opt out and
drive rollback yourself:

```ts
// via the builder
const tx = saga
  .createTransaction('job')
  .configure({ disableAutoRollback: true })
  .addStep('step-1', (s) => { /* ... */ }, (s) => { /* compensate */ });

// ...or via options, using a typed transaction you can roll back manually:
const manual = saga.createTypedTransaction<void>('manual', {
  transaction: { disableAutoRollback: true },
});
manual.addStep('do', (s) => { /* ... */ }, (s) => { /* compensate */ });

try {
  await manual.run();
} catch {
  // rollback is available only when auto-rollback is disabled
  await manual.rollback();
}
```

### Selectors & computed values

```ts
// Single property / arbitrary selector / deep path
const count$ = saga.selectProperty('count');
const users$ = saga.select(s => s.users);
const theme$ = saga.stateManager.selectPath('user.preferences.theme', 'light');

// Combine several parts of state into one reactive value
const summary$ = saga.stateManager.combine(
  s => s.count,
  s => s.users.length,
  (count, userCount) => `count=${count}, users=${userCount}`,
);

console.log(summary$.value);          // current value
const off = summary$.subscribe(v => console.log(v)); // subscribe to changes
```

Every selector exposes `.value`, `.get()` and `.subscribe(fn)`.

### Events and Streams

```ts
// Typed event listeners
const offAny = saga.onAnyEvent(e => console.log(e.type));
const offFail = saga.onSagaEvent('transaction:fail', e => console.error(e.error));

// Stream API (temporal, no current value). A stream carries the full event
// union, so switch on `e.type` (or use the narrowing `onSagaEvent` above).
const startStream = saga.onEventStream('transaction:start');
const offStream = startStream.subscribe(e => console.log('event:', e.type));
```

Emitted saga events include `transaction:start` / `:success` / `:fail` /
`:rollback` and `step:start` / `:success` / `:retry` / `:rollback`.

### Middleware

Middleware wraps every transaction (Koa-style `async (ctx, next) => { ... }`).

```ts
import {
  createLoggingMiddleware,
  createTimingMiddleware,
  createPersistenceMiddleware,
  loadPersistedState,
} from '@staga/core';

saga.use(createLoggingMiddleware());
saga.use(createTimingMiddleware((name, ms) => console.log(name, ms)));
saga.use(createPersistenceMiddleware('app-state')); // saves to localStorage

// On startup, hydrate from a previous session:
const initial = loadPersistedState('app-state', { users: [], count: 0 });
```

### Recording & replay

```ts
saga.startRecording();
// ...run transactions & emit events...
saga.stopRecording();

const events = saga.getRecordedEvents();
await saga.startReplay({ delay: 50 }); // optional delay between events
```

## Configuration

Pass `StateManagerOptions` to `new StateManager(initial, options)` or through
`SagaManager.create(initial, { state: options })`.

| Option             | Type                          | Default        | Meaning                                              |
| ------------------ | ----------------------------- | -------------- | ---------------------------------------------------- |
| `maxUndoHistory`   | `number`                      | `100`          | Max entries kept in the undo/redo stacks             |
| `maxSnapshots`     | `number`                      | `20`           | Max snapshots retained                               |
| `autoCleanup`      | `boolean`                     | `true`         | Trim history automatically                           |
| `snapshotInterval` | `number`                      | `10`           | Auto-snapshot every N changes                        |
| `clone`            | `<T>(v: T) => T`              | deep clone     | Custom cloning strategy                              |
| `equalityFn`       | `<T>(a: T, b: T) => boolean`  | deep equal     | Custom change detection                              |

> The default `clone`/`equalityFn` handle plain objects and arrays. For state
> containing `Date`, `Map`, `Set`, or class instances, pass your own `clone`
> and `equalityFn` (for example one based on `structuredClone`).

```ts
const saga = SagaManager.create(
  { count: 0 },
  { state: { maxUndoHistory: 50, snapshotInterval: 5 } },
);
```

## Metrics & introspection

```ts
const metrics = saga.stateManager.getMetrics();
// { totalChanges, undoStackSize, redoStackSize, snapshotCount,
//   activeSubscriptions, memoryEstimate, ... }

const debug = saga.stateManager.getDebugInfo();
// { isRunning, activeTimers, subscriptions }
```

## statekit — low-level reactive core

`@staga/core` re-exports **statekit**, the standalone reactive primitives that
power `StateManager`. Use them directly for fine-grained reactivity.

### Signals

```ts
import { signal, derived } from '@staga/core';

const a = signal(1);
const b = signal(2);
const sum = derived(() => a.get() + b.get());

sum.subscribe(() => console.log('sum =', sum.get()));
a.set(10); // logs: sum = 12

// `derived` tracks dynamic dependencies: whichever signals a computation
// actually reads on its latest run become its dependencies.
```

### Store

```ts
import { Store, computed } from '@staga/core';

const store = new Store({ initialState: { n: 0, items: [] as string[] } });

store.setState(s => ({ ...s, n: s.n + 1 }));   // functional update
store.subscribe(() => console.log(store.getState()));

// Fire a callback only when a derived slice changes
const off = store.watch(s => s.n, (n, prev) => console.log(prev, '->', n));

// A memoized, subscribable computed value
const doubled = computed(store, s => s.n * 2);
console.log(doubled.get());
```

Other primitives available from the same entry point: `createSelector`,
`produce` (immer-style immutable updates), `Stream` / `map` / `filter`, and the
low-level `createTransaction`.

## Error handling

`ErrorManager` centralizes structured error reporting with severity levels,
rate limiting and pluggable handlers.

```ts
import { ErrorManager, ErrorSeverity, ConsoleErrorHandler } from '@staga/core';

const errors = new ErrorManager(); // ships with a ConsoleErrorHandler
errors.handleError('Something failed', { component: 'billing', operation: 'charge' }, ErrorSeverity.HIGH);

const stats = errors.getErrorStats();
// { totalErrors, errorsByComponent, errorsBySeverity }
```

## Dependency injection

A lightweight, type-safe DI container with singleton / transient / scoped
lifecycles and circular-dependency detection.

```ts
import { DIContainer } from '@staga/core';

const container = new DIContainer();
container.register('logger', () => new Logger());
container.register('service', (logger) => new Service(logger), {
  dependencies: ['logger'],
  scope: 'singleton',
});

const service = container.resolve<Service>('service');
```

## Plugins

`PluginManager` provides a lifecycle- and DI-based plugin system. Plugins expose
metadata and hooks and can register services in the container.

```ts
import { DIContainer, PluginManager, type StagaPlugin } from '@staga/core';

const container = new DIContainer();
const plugins = new PluginManager(container, saga);

const myPlugin: StagaPlugin = {
  metadata: { name: 'my-plugin', version: '1.0.0' },
  hooks: {
    onInstall: ({ logger }) => logger.info('installed'),
    onInitialize: ({ logger }) => logger.info('initialized'),
  },
};

await plugins.install(myPlugin);
await plugins.initialize();
```

Lifecycle hooks (`onInstall`, `onUninstall`, `onInitialize`, `onShutdown`) run
during the corresponding `PluginManager` calls; transaction/state hooks can be
dispatched explicitly via `plugins.executeHook(...)`.

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

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and pending changes.

## License

MIT
