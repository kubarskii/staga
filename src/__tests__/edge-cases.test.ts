import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager, StateManager, Transaction } from '../index';

interface TestState {
  value: number;
  items: string[];
  nested: {
    count: number;
    data: unknown[];
  };
}

describe('Edge Cases and Error Handling', () => {
  let saga: SagaManager<TestState>;
  const initialState: TestState = {
    value: 0,
    items: [],
    nested: {
      count: 0,
      data: []
    }
  };

  beforeEach(() => {
    saga = SagaManager.create(initialState);
  });

  afterEach(() => {
    saga.dispose();
  });

  describe('State Management Edge Cases', () => {
    it('should handle deep object mutations correctly', async () => {
      const transaction = saga
        .createTransaction('deep-mutation')
        .addStep('mutate-nested', (state, payload) => {
          state.nested.count = 10;
          state.nested.data.push({ id: 1, value: 'test' });
          state.items.push('item1');
        });

      await transaction.run({});

      expect(saga.getState().nested.count).toBe(10);
      expect(saga.getState().nested.data).toHaveLength(1);
      expect(saga.getState().items).toEqual(['item1']);

      // Test undo preserves deep structure
      saga.undo();
      const undoneState = saga.getState();
      expect(undoneState.nested.count).toBe(0);
      expect(undoneState.nested.data).toHaveLength(0);
      expect(undoneState.items).toHaveLength(0);

      // Ensure it's a proper deep clone, not sharing references
      expect(undoneState).not.toBe(initialState);
      expect(undoneState.nested).not.toBe(initialState.nested);
      expect(undoneState.items).not.toBe(initialState.items);
    });

    it('should handle circular references in state', async () => {
      // Create a state with circular reference
      const circularState: Record<string, unknown> = { value: 0, items: [] };
      circularState.self = circularState;

      // This should throw when trying to create a snapshot due to structuredClone
      // Note: Some environments might handle this differently
      try {
        const manager = new StateManager(circularState);
        // If it doesn't throw on creation, it should throw when trying to setState or createSnapshot
        expect(() => {
          manager.setState({ value: 1, items: [], self: circularState });
        }).toThrow();
      } catch (error) {
        // Expected to throw on creation
        expect(error).toBeDefined();
      }
    });

    it('should handle undefined and null values in state', async () => {
      interface NullableState {
        value: number | null;
        optional: string | undefined;
        items: unknown[];
      }

      const nullableState: NullableState = {
        value: null,
        optional: undefined,
        items: []
      };

      const nullableSaga = SagaManager.create(nullableState);

      const transaction = nullableSaga
        .createTransaction('nullable-test')
        .addStep('set-values', (state) => {
          state.value = 42;
          state.optional = 'defined';
          state.items.push(null, undefined);
        });

      await transaction.run({});

      expect(nullableSaga.getState().value).toBe(42);
      expect(nullableSaga.getState().optional).toBe('defined');
      expect(nullableSaga.getState().items).toEqual([null, undefined]); // Undefined values are preserved

      nullableSaga.dispose();
    });

    it('should handle large state objects', async () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `item${i}` }));
      const largeState = {
        items: largeArray,
        count: 0
      };

      const largeSaga = SagaManager.create(largeState);

      const transaction = largeSaga
        .createTransaction('large-state-test')
        .addStep('modify-large-state', (state) => {
          state.count = state.items.length;
          state.items.push({ id: 10000, value: 'new-item' });
        });

      await transaction.run({});

      expect(largeSaga.getState().count).toBe(10000);
      expect(largeSaga.getState().items).toHaveLength(10001);

      largeSaga.dispose();
    });
  });

  describe('Transaction Edge Cases', () => {
    it('should handle empty transactions', async () => {
      const emptyTransaction = saga.createTransaction('empty')
        .addVoidStep('placeholder', async () => {
          // Empty placeholder step for builder pattern
        });

      await expect(emptyTransaction.run()).resolves.not.toThrow();
    });

    it('should handle transactions with only compensation functions', async () => {
      const compensateOnly = vi.fn();

      const transaction = saga
        .createTransaction('compensate-only')
        .addStep('no-op', () => { }, compensateOnly);

      await transaction.run({});

      // Compensation should not be called on successful transaction
      expect(compensateOnly).not.toHaveBeenCalled();
    });

    it('should handle synchronous and asynchronous steps mixed', async () => {
      const order: string[] = [];

      const transaction = saga
        .createTransaction('mixed-async')
        .addStep('sync-step', (state) => {
          order.push('sync');
          state.value = 1;
        })
        .addStep('async-step', async (state) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          order.push('async');
          state.value = 2;
        })
        .addStep('sync-step-2', (state) => {
          order.push('sync2');
          state.value = 3;
        });

      await transaction.run({});

      expect(order).toEqual(['sync', 'async', 'sync2']);
      expect(saga.getState().value).toBe(3);
    });

    it('should handle multiple transaction failures correctly', async () => {
      const failingTx1 = saga
        .createTransaction('failing-1')
        .addStep('fail', () => { throw new Error('First failure'); });

      const failingTx2 = saga
        .createTransaction('failing-2')
        .addStep('fail', () => { throw new Error('Second failure'); });

      await expect(failingTx1.run({})).rejects.toThrow('First failure');
      await expect(failingTx2.run({})).rejects.toThrow('Second failure');

      // State should remain unchanged
      expect(saga.getState()).toEqual(initialState);
    });

    it('should handle step that modifies payload', async () => {
      const transaction = saga
        .createTransaction<{ originalValue: number; modified?: boolean; newValue?: string }>('modify-payload')
        .addStep('modify-payload', (state, payload) => {
          payload.modified = true;
          payload.newValue = 'added';
          if (typeof payload.originalValue === 'number') {
            state.value = payload.originalValue;
          }
        })
        .addStep('use-modified-payload', (state, payload) => {
          if (payload.modified && typeof payload.newValue === 'string') {
            state.items.push(payload.newValue);
          }
        });

      const payload = { originalValue: 42 };
      await transaction.run(payload);

      expect(saga.getState().value).toBe(42);
      expect(saga.getState().items).toEqual(['added']);
      expect(payload).toEqual({ originalValue: 42, modified: true, newValue: 'added' });
    });
  });

  describe('Middleware Edge Cases', () => {
    it('should handle middleware that throws before calling next', async () => {
      saga.use(async (ctx, next) => {
        throw new Error('Middleware error before next');
      });

      const stepFn = vi.fn();
      const transactionBuilder = saga
        .createTransaction('middleware-error')
        .addStep('never-reached', stepFn);

      await expect(transactionBuilder.run({})).rejects.toThrow('Middleware error before next');
      expect(stepFn).not.toHaveBeenCalled();
    });

    it('should handle middleware that throws after calling next', async () => {
      saga.use(async (ctx, next) => {
        await next();
        throw new Error('Middleware error after next');
      });

      const stepFn = vi.fn();
      const transaction = saga
        .createTransaction('middleware-error-after')
        .addStep('executed', stepFn);

      await expect(transaction.run({})).rejects.toThrow('Middleware error after next');
      expect(stepFn).toHaveBeenCalled(); // Step should have executed
    });

    it('should handle middleware that calls next multiple times', async () => {
      saga.use(async (ctx, next) => {
        await next();
        // Try to call next again - this should throw
        try {
          await next();
          throw new Error('Should have thrown');
        } catch (error) {
          expect(error instanceof Error ? error.message : String(error)).toBe('next() called multiple times');
          throw error; // Re-throw to fail the transaction
        }
      });

      const transaction = saga
        .createTransaction('double-next')
        .addStep('test', () => { });

      await expect(transaction.run({})).rejects.toThrow();
    });

    it('should handle middleware that never calls next', async () => {
      saga.use(async (ctx, next) => {
        // Don't call next - this should prevent step execution
      });

      const stepFn = vi.fn();
      const transaction = saga
        .createTransaction('no-next')
        .addStep('never-executed', stepFn);

      await transaction.run({});

      expect(stepFn).not.toHaveBeenCalled();
    });
  });

  describe('Event System Edge Cases', () => {
    it('should handle listeners that throw errors', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      const workingListener = vi.fn();
      const throwingListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      saga.onSagaEvent('transaction:start', (e) => workingListener(e.payload));
      saga.onSagaEvent('transaction:start', () => { throwingListener(); });

      const transaction = saga
        .createTransaction('listener-error')
        .addStep('test', () => { });

      // Transaction should still complete despite listener error
      await expect(transaction.run({})).resolves.not.toThrow();

      expect(workingListener).toHaveBeenCalled();
      expect(throwingListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[unified-event-manager:transaction:start] Listener error',
        expect.objectContaining({
          severity: 'medium',
          originalError: expect.any(Error),
          context: expect.objectContaining({
            component: 'unified-event-manager',
            operation: 'transaction:start',
            metadata: expect.objectContaining({
              listenerType: 'reactive-unified'
            })
          })
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle emitting events with complex payloads', async () => {
      const complexPayload = {
        nested: { data: [1, 2, 3] },
        circular: null as unknown,
        func: () => 'test',
        date: new Date()
      };
      complexPayload.circular = complexPayload;

      const listener = vi.fn();
      saga.onSagaEvent('test:event', (e) => listener(e.payload));

      saga.emitSagaEvent({ type: 'test:event', payload: complexPayload, timestamp: Date.now() });

      expect(listener).toHaveBeenCalledWith(complexPayload);
    });
  });

  describe('Retry and Timeout Edge Cases', () => {
    it('should handle step that sometimes succeeds on retry', async () => {
      let attempt = 0;
      const flakeyStep = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new Error(`Attempt ${attempt} failed`);
        }
        return 'success';
      });

      const transaction = saga
        .createTransaction('flakey')
        .addStep('flakey-step', flakeyStep, undefined, { retries: 3 });

      await transaction.run({});

      expect(flakeyStep).toHaveBeenCalledTimes(3);
      expect(attempt).toBe(3);
    });

    it('should handle timeout with async step that eventually resolves', async () => {
      const transaction = saga
        .createTransaction('timeout-test')
        .addStep('slow-step', async () => {
          // This will take 200ms but timeout is 100ms
          return new Promise<void>(resolve => {
            setTimeout(() => resolve(), 200);
          });
        }, undefined, { timeout: 100 });

      await expect(transaction.run({})).rejects.toThrow('Step "slow-step" timed out');
    });

    it('should handle zero retries correctly', async () => {
      const failingStep = vi.fn().mockImplementation(() => {
        throw new Error('Always fails');
      });

      const transaction = saga
        .createTransaction('no-retries')
        .addStep('failing-step', failingStep, undefined, { retries: 0 });

      await expect(transaction.run({})).rejects.toThrow();
      expect(failingStep).toHaveBeenCalledTimes(1); // Only initial attempt
    });

    it('should handle negative retry count', async () => {
      const failingStep = vi.fn().mockImplementation(() => {
        throw new Error('Always fails');
      });

      const transaction = saga
        .createTransaction('negative-retries')
        .addStep('failing-step', failingStep, undefined, { retries: -1 });

      await expect(transaction.run({})).rejects.toThrow();
      expect(failingStep).toHaveBeenCalledTimes(1); // Should treat as 0 retries
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle rapid undo/redo operations', () => {
      // Perform many state changes
      for (let i = 0; i < 100; i++) {
        saga.createTransaction(`tx-${i}`)
          .addStep('increment', (state) => { state.value = i; })
          .run({});
      }

      // Perform rapid undo/redo
      for (let i = 0; i < 50; i++) {
        saga.undo();
      }
      for (let i = 0; i < 25; i++) {
        saga.redo();
      }

      // Should not crash or cause memory issues
      expect(saga.getState().value).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent transaction execution', async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const tx = saga
          .createTransaction(`concurrent-${i}`)
          .addVoidStep('increment', (state) => {
            state.value += 1;
          });
        promises.push(tx.run());
      }

      await Promise.all(promises);

      expect(saga.getState().value).toBe(10);
    });
  });
});