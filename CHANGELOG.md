# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Package module resolution.** `package.json` `exports` now correctly routes
  `import` to the ESM bundle (`dist/index.mjs`) and `require` to the CJS bundle
  (`dist/index.js`). Previously both pointed to the CJS file, so ESM consumers
  received CommonJS output. The `module` field was also corrected and a `types`
  condition was added to the `exports` map.
- **Consistent deep cloning.** `SagaManager.recordEvent()` now uses
  `StateManager.clone()` and `Store.setDraft()` now uses the statekit `deepClone`
  utility instead of `JSON.parse(JSON.stringify(...))`. This preserves `undefined`
  values in arrays and leverages `structuredClone` when available.
- **Encapsulation.** `Transaction.run()` now accesses the configured equality
  function via the new public `StateManager.getEqualityFn()` method instead of
  reading the private `options` field through an `as any` cast.
- **Reactive selectors stay in sync with undo/rollback.** `StateManager.undo()`
  and `rollbackToLastSnapshot()` now propagate through the reactive core, so
  `select()`-based signals no longer report stale values (previously only
  `redo()` did this).
- **`derived()` tracks dynamic dependencies.** statekit's `derived()` now
  re-subscribes when the set of signals a computation reads changes between
  runs, instead of only tracking the dependencies seen on the first run.
- **`ReactiveStateProxy` caching & notifications.** Repeated access to the same
  nested object now returns a stable proxy (it previously returned the raw
  object, dropping change notifications), and each mutation emits exactly one
  notification (a duplicate notification per mutation was removed).
- **`UnifiedEventManager.getEventStats().activeSubscriptions`** now reflects the
  live subscriber count instead of always returning `0`.
- **`ErrorManager.getErrorStats().errorsBySeverity`** is now populated instead
  of always being all zeros.
- Fixed a `noUncheckedIndexedAccess` type error in `EventReplayer`.

### Changed

- **CI.** The test workflow now runs against a Node.js 20 **and** 22 matrix to
  verify compatibility with current LTS releases.
- **Tooling.** Added `.editorconfig` for consistent formatting across editors
  and a V8 coverage configuration in `vitest.config.ts` (run
  `npm i -D @vitest/coverage-v8 && vitest run --coverage` to collect metrics).
- **Tree-shaking.** Declared `"sideEffects": false` in `package.json` so
  bundlers can safely eliminate unused exports.
- **Documentation.** Corrected the install/import name to `@staga/core` and
  significantly expanded the README (statekit primitives, configuration
  options, selectors & computed values, metrics, error handling, DI, plugins).
  Every documented example is type-checked against the public API.
- **Tooling.** Fixed the ESLint configuration (it referenced a non-existent
  shareable config and had never run); `npm run lint` now passes at zero errors.
  CI now runs on `master`/`main` and executes `type-check`, `lint`, and `build`
  in addition to the test suite.
- **Dev dependencies.** `vitest` 1 → 3, `@typescript-eslint` 6 → 8.

### Security

- Resolved all 17 `npm audit` advisories in the development toolchain
  (0 remaining). The published package has no runtime dependencies, so
  consumers of `@staga/core` were never affected.

## [1.0.0] - 2025-08-08

Republished under the scoped name **`@staga/core`** (the package was previously
published as `staga`).

### Added

- Transactions with automatic rollback and per-step compensation, plus
  per-step retries and timeouts.
- Reactive core (**statekit**): signals, derived values, `Store`, streams, and
  a low-level transaction primitive.
- `StateManager` with undo/redo, snapshots, and reactive selectors
  (`select`, `selectProperty`, `selectPath`, `combine`).
- Typed event API (`onSagaEvent`, `onAnyEvent`) and event streams
  (`onEventStream`).
- Middleware (logging, timing, persistence) and event recording & replay.
- Optional dependency-injection container and plugin system.

## Prior history (published as `staga`)

- **1.0.1 – 1.0.2** — 2025-08-08 — reactive selector fixes, computed-value
  initialization after state changes, demo consolidated into a single page, and
  a `structuredClone` illegal-invocation fix.
- **1.0.0** — 2025-08-01 — initial release.
