import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SagaManager } from '../SagaManager';
import {
  createPersistenceMiddleware,
  loadPersistedState,
  createLoggingMiddleware,
  createTimingMiddleware
} from '../middleware';

interface TestState {
  counter: number;
  name: string;
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

describe('Middleware', () => {
  let saga: SagaManager<TestState>;
  const initialState: TestState = { counter: 0, name: 'test' };

  beforeEach(() => {
    saga = SagaManager.create(initialState);
    vi.clearAllMocks();
  });

  afterEach(() => {
    saga.dispose();
  });

    describe('createPersistenceMiddleware', () => {
        it('should save state to localStorage after successful transaction', async () => {
      const middleware = createPersistenceMiddleware<TestState>('test-key');
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test')
        .addStep('increment', (state) => {
          state.counter = 5;
        });

      await transaction.run({});

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({ counter: 5, name: 'test' })
      );
    });

    it('should not save state if transaction fails', async () => {
      const middleware = createPersistenceMiddleware<TestState>('test-key');
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test')
        .addStep('fail', () => {
          throw new Error('Failed');
        });

      await expect(transaction.run({})).rejects.toThrow();

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

        it('should handle localStorage errors gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            localStorageMock.setItem.mockImplementation(() => {
                throw new Error('Storage error');
            });

      const middleware = createPersistenceMiddleware<TestState>('test-key');
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test')
        .addStep('increment', (state) => {
          state.counter = 5;
        });

      // Should not throw, should handle error gracefully
      await expect(transaction.run({})).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('[Persistence] Failed to save state:', expect.any(Error));

            consoleSpy.mockRestore();
        });

        it('should skip persistence when localStorage is unavailable', async () => {
            const original = (global as any).localStorage;
            // @ts-ignore
            delete (global as any).localStorage;
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const middleware = createPersistenceMiddleware<TestState>('test-key');
            saga.use(middleware);

            const transaction = saga
                .createTransaction('test')
                .addStep('increment', (state) => {
                    state.counter = 5;
                });

            await transaction.run({});

            expect(consoleSpy).toHaveBeenCalledWith('[Persistence] localStorage not available; skipping state save.');

            (global as any).localStorage = original;
            consoleSpy.mockRestore();
        });
    });

    describe('loadPersistedState', () => {
    it('should load state from localStorage', () => {
      const savedState = { counter: 10, name: 'saved' };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedState));

      const result = loadPersistedState('test-key', initialState);

      expect(localStorageMock.getItem).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(savedState);
    });

    it('should return default state when localStorage is empty', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = loadPersistedState('test-key', initialState);

      expect(result).toEqual(initialState);
    });

    it('should return default state when JSON parsing fails', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const result = loadPersistedState('test-key', initialState);

      expect(result).toEqual(initialState);
    });

        it('should handle localStorage errors gracefully', () => {
            localStorageMock.getItem.mockImplementation(() => {
                throw new Error('Storage error');
            });

      const result = loadPersistedState('test-key', initialState);

            expect(result).toEqual(initialState);
        });

        it('should return default state when localStorage is unavailable', () => {
            const original = (global as any).localStorage;
            // @ts-ignore
            delete (global as any).localStorage;
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const result = loadPersistedState('test-key', initialState);

            expect(result).toEqual(initialState);

            (global as any).localStorage = original;
            consoleSpy.mockRestore();
        });
    });

  describe('createLoggingMiddleware', () => {
    it('should log transaction start and completion', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      const middleware = createLoggingMiddleware<TestState>();
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test-transaction')
        .addStep('test-step', () => { });

      await transaction.run({});

      expect(consoleSpy).toHaveBeenCalledWith('[Staga] Starting transaction: test-transaction');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/\[Staga\] Transaction completed: test-transaction \(\d+ms\)/));

      consoleSpy.mockRestore();
    });

    it('should log transaction failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      const middleware = createLoggingMiddleware<TestState>();
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test-transaction')
        .addStep('failing-step', () => {
          throw new Error('Test error');
        });

      await expect(transaction.run({})).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[Staga\] Transaction failed: test-transaction \(\d+ms\)/),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should measure execution time', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

      const middleware = createLoggingMiddleware<TestState>();
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test-transaction')
        .addStep('delay-step', () => {
          return new Promise(resolve => setTimeout(resolve, 50));
        });

      await transaction.run({});

      const completionCall = consoleSpy.mock.calls.find(call =>
        call[0].includes('Transaction completed')
      );
      expect(completionCall).toBeDefined();

      // Extract duration from log message
      const durationMatch = completionCall![0].match(/\((\d+)ms\)/);
      expect(durationMatch).toBeDefined();
      const duration = parseInt(durationMatch![1]);
      expect(duration).toBeGreaterThanOrEqual(40); // Should be at least 40ms due to the delay

      consoleSpy.mockRestore();
    });
  });

  describe('createTimingMiddleware', () => {
    it('should call onComplete callback with timing information', async () => {
      const onComplete = vi.fn();
      const middleware = createTimingMiddleware<TestState>(onComplete);
      saga.use(middleware);

      const transaction = saga
        .createTransaction('timed-transaction')
        .addStep('test-step', () => {
          return new Promise(resolve => setTimeout(resolve, 30));
        });

      await transaction.run({});

      expect(onComplete).toHaveBeenCalledWith('timed-transaction', expect.any(Number), expect.any(Object));

      const duration = onComplete.mock.calls[0][1];
      expect(duration).toBeGreaterThanOrEqual(20); // Should be at least 20ms
    });

    it('should call onComplete even when transaction fails', async () => {
      const onComplete = vi.fn();
      const middleware = createTimingMiddleware<TestState>(onComplete);
      saga.use(middleware);

      const transaction = saga
        .createTransaction('failing-transaction')
        .addStep('failing-step', () => {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Failed')), 30);
          });
        });

      await expect(transaction.run({})).rejects.toThrow();

      expect(onComplete).toHaveBeenCalledWith('failing-transaction', expect.any(Number), expect.any(Object));

      const duration = onComplete.mock.calls[0][1];
      expect(duration).toBeGreaterThanOrEqual(20);
    });

    it('should work without onComplete callback', async () => {
      const middleware = createTimingMiddleware<TestState>();
      saga.use(middleware);

      const transaction = saga
        .createTransaction('test-transaction')
        .addStep('test-step', () => { });

      // Should not throw
      await expect(transaction.run({})).resolves.not.toThrow();
    });
  });

  describe('middleware composition', () => {
    it('should execute multiple middleware in correct order', async () => {
      const order: string[] = [];

      saga.use(async (ctx, next) => {
        order.push('middleware1:start');
        await next();
        order.push('middleware1:end');
      });

      saga.use(async (ctx, next) => {
        order.push('middleware2:start');
        await next();
        order.push('middleware2:end');
      });

      const transaction = saga
        .createTransaction('test')
        .addStep('test-step', () => {
          order.push('step:execute');
        });

      await transaction.run({});

      expect(order).toEqual([
        'middleware1:start',
        'middleware2:start',
        'step:execute',
        'middleware2:end',
        'middleware1:end'
      ]);
    });

    it('should handle middleware errors in composition', async () => {
      saga.use(async (ctx, next) => {
        await next();
        // This should still run even if next middleware throws
      });

      saga.use(async (ctx, next) => {
        throw new Error('Middleware error');
      });

      const transaction = saga
        .createTransaction('test')
        .addStep('test-step', vi.fn());

      await expect(transaction.run({})).rejects.toThrow('Middleware error');
    });

    it('should provide correct context to middleware', async () => {
      let capturedContext: any;

      saga.use(async (ctx, next) => {
        capturedContext = ctx;
        await next();
      });

      const transaction = saga
        .createTransaction('context-test')
        .addStep('test-step', () => { });

      const payload = { test: 'data' };
      await transaction.run(payload);

      expect(capturedContext).toEqual({
        transaction: expect.any(Object),
        payload,
        getState: expect.any(Function),
        setState: expect.any(Function)
      });
      expect(capturedContext.transaction.name).toBe('context-test');
    });
  });
});