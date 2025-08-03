import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaManager, createPersistenceMiddleware, createLoggingMiddleware, createTimingMiddleware } from '../index';

interface EcommerceState {
  products: Array<{ id: string; name: string; price: number; stock: number }>;
  cart: Array<{ productId: string; quantity: number }>;
  orders: Array<{ id: string; items: Array<{ productId: string; quantity: number; price: number }> }>;
  userBalance: number;
  notifications: Array<{ type: string; message: string; timestamp: string }>;
}

// Mock localStorage for persistence middleware
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Integration Tests', () => {
  let saga: SagaManager<EcommerceState>;
  const initialState: EcommerceState = {
    products: [
      { id: 'p1', name: 'Laptop', price: 1000, stock: 5 },
      { id: 'p2', name: 'Mouse', price: 50, stock: 10 }
    ],
    cart: [],
    orders: [],
    userBalance: 2000,
    notifications: []
  };

  beforeEach(() => {
    saga = SagaManager.create(initialState);
    vi.clearAllMocks();
  });

  afterEach(() => {
    saga.dispose();
  });

  describe('E-commerce Order Processing', () => {
    it('should complete a full order flow successfully', async () => {
      // Add middleware
      saga.use(createLoggingMiddleware());
      saga.use(createPersistenceMiddleware('ecommerce-state'));

      // Track events
      const events: string[] = [];
      saga.on('transaction:start', (name) => events.push(`start:${name}`));
      saga.on('transaction:success', (name) => events.push(`success:${name}`));
      saga.on('step:success', (stepName) => events.push(`step:${stepName}`));

      // Create order processing transaction with automatic payload inference
      const orderTransaction = saga
        .createTransaction<{ items: Array<{ productId: string; quantity: number }>; total?: number; orderId?: string }>('process-order')
        .addStep('validate-cart', (state, payload) => {
          if (payload.items.length === 0) {
            throw new Error('Cart is empty');
          }
          for (const item of payload.items) {
            const product = state.products.find(p => p.id === item.productId);
            if (!product) {
              throw new Error(`Product ${item.productId} not found`);
            }
            if (product.stock < item.quantity) {
              throw new Error(`Insufficient stock for ${product.name}`);
            }
          }
        })
        .addStep('calculate-total', (state, payload) => {
          let total = 0;
          for (const item of payload.items) {
            const product = state.products.find(p => p.id === item.productId)!;
            total += product.price * item.quantity;
          }
          payload.total = total;
        })
        .addStep('check-balance', (state, payload) => {
          const total = payload.total || 0;
          if (state.userBalance < total) {
            throw new Error(`Insufficient balance. Required: ${total}, Available: ${state.userBalance}`);
          }
        })
        .addStep('reserve-inventory', (state, payload) => {
          for (const item of payload.items) {
            const product = state.products.find(p => p.id === item.productId)!;
            product.stock -= item.quantity;
          }
        }, (state, payload) => {
          // Compensation: restore inventory
          for (const item of payload.items) {
            const product = state.products.find(p => p.id === item.productId)!;
            product.stock += item.quantity;
          }
        })
        .addStep('charge-payment', (state, payload) => {
          state.userBalance -= payload.total || 0;
        }, (state, payload) => {
          // Compensation: refund payment
          state.userBalance += payload.total || 0;
        })
        .addStep('create-order', (state, payload) => {
          const order = {
            id: `order_${Date.now()}`,
            items: payload.items.map((item: { productId: string; quantity: number }) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: state.products.find(p => p.id === item.productId)!.price
            }))
          };
          state.orders.push(order);
          payload.orderId = order.id;
        }, (state, payload) => {
          // Compensation: remove order
          const index = state.orders.findIndex(o => o.id === payload.orderId);
          if (index > -1) {
            state.orders.splice(index, 1);
          }
        })
        .addStep('send-confirmation', (state, payload) => {
          state.notifications.push({
            type: 'order-confirmation',
            message: `Order ${payload.orderId} confirmed`,
            timestamp: new Date().toISOString()
          });
        }, (state, payload) => {
          // Compensation: remove notification
          const index = state.notifications.findIndex(n =>
            n.type === 'order-confirmation' && n.message.includes(payload.orderId || '')
          );
          if (index > -1) {
            state.notifications.splice(index, 1);
          }
        });

      // Execute the transaction - payload type inferred from this call!
      await orderTransaction.run({
        items: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 2 }
        ]
      });

      // Verify final state
      const finalState = saga.getState();

      // Check inventory was updated
      expect(finalState.products[0].stock).toBe(4); // Laptop: 5 - 1 = 4
      expect(finalState.products[1].stock).toBe(8); // Mouse: 10 - 2 = 8

      // Check balance was charged
      expect(finalState.userBalance).toBe(900); // 2000 - 1000 - 100 = 900

      // Check order was created
      expect(finalState.orders).toHaveLength(1);
      expect(finalState.orders[0].items).toEqual([
        { productId: 'p1', quantity: 1, price: 1000 },
        { productId: 'p2', quantity: 2, price: 50 }
      ]);

      // Check notification was sent
      expect(finalState.notifications).toHaveLength(1);
      expect(finalState.notifications[0].type).toBe('order-confirmation');

      // Check events were emitted
      expect(events).toContain('start:process-order');
      expect(events).toContain('success:process-order');
      expect(events).toContain('step:validate-cart');
      expect(events).toContain('step:create-order');

      // Check persistence was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ecommerce-state',
        JSON.stringify(finalState)
      );
    });

    it('should rollback completely on payment failure', async () => {
      // Track rollback events using new event system
      const rollbackEvents: string[] = [];
      saga.onEvent('step:rollback', (event) => rollbackEvents.push(`rollback:${event.stepName}`));
      saga.onEvent('transaction:rollback', (event) => rollbackEvents.push(`transaction-rollback:${event.transactionName}`));

      // Create transaction that will fail at payment
      const failingTransaction = saga
        .createTransaction<{ productId: string; quantity: number }>('failing-order')
        .addStep('reserve-inventory', (state, payload) => {
          const product = state.products.find(p => p.id === payload.productId)!;
          product.stock -= payload.quantity;
        }, (state, payload) => {
          const product = state.products.find(p => p.id === payload.productId)!;
          product.stock += payload.quantity;
        })
        .addStep('charge-payment', (state, payload) => {
          // Simulate payment failure
          throw new Error('Payment gateway error');
        }, (state, payload) => {
          // This compensation shouldn't be called since payment never succeeded
        });

      const initialStock = saga.getState().products[0].stock;

      // Execute the failing transaction
      await expect(failingTransaction.run({
        productId: 'p1',
        quantity: 2
      })).rejects.toThrow('Payment gateway error');

      // Verify rollback occurred
      expect(saga.getState().products[0].stock).toBe(initialStock); // Stock should be restored
      expect(rollbackEvents).toContain('rollback:reserve-inventory');
      expect(rollbackEvents).toContain('transaction-rollback:failing-order');
    });

    it('should handle concurrent transactions with state isolation', async () => {
      // This test simulates concurrent transactions to ensure state management is correct
      const transaction1 = saga
        .createTransaction('tx1')
        .addStep('increment-balance', (state) => {
          state.userBalance += 100;
        });

      const transaction2 = saga
        .createTransaction('tx2')
        .addStep('increment-balance', (state) => {
          state.userBalance += 200;
        });

      // Execute transactions concurrently
      await Promise.all([
        transaction1.run({}),
        transaction2.run({})
      ]);

      // Both transactions should have completed successfully
      expect(saga.getState().userBalance).toBe(2300); // 2000 + 100 + 200
    });
  });

  describe('Cart Management', () => {
    it('should handle complex cart operations with undo/redo', async () => {
      // Add items to cart
      const addToCartTx = saga
        .createTransaction<{ productId: string; quantity: number }>('add-to-cart')
        .addStep('add-item', (state, payload) => {
          const existingItem = state.cart.find(item => item.productId === payload.productId);
          if (existingItem) {
            existingItem.quantity += payload.quantity;
          } else {
            state.cart.push({ productId: payload.productId, quantity: payload.quantity });
          }
        });

      await addToCartTx.run({ productId: 'p1', quantity: 2 });
      await addToCartTx.run({ productId: 'p2', quantity: 1 });

      expect(saga.getState().cart).toHaveLength(2);

      // Test undo/redo functionality
      // Each successful transaction creates an entry in the undo stack

      // First, let's check that both items are there
      expect(saga.getState().cart).toHaveLength(2);

      // Undo the last transaction (second add to cart)
      saga.undo();
      expect(saga.getState().cart).toHaveLength(1);
      expect(saga.getState().cart[0].productId).toBe('p1');
      expect(saga.getState().cart[0].quantity).toBe(2);

      // Undo the first transaction (first add to cart)  
      saga.undo();
      expect(saga.getState().cart).toHaveLength(0);

      // Redo the first transaction
      saga.redo();
      expect(saga.getState().cart).toHaveLength(1);
      expect(saga.getState().cart[0].productId).toBe('p1');

      // Redo the second transaction
      saga.redo();
      expect(saga.getState().cart).toHaveLength(2);
      expect(saga.getState().cart.find(item => item.productId === 'p2')).toBeDefined();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle network timeout with retries', async () => {
      let attempts = 0;
      const networkTransaction = saga
        .createTransaction('network-operation')
        .addStep('api-call', async (state, payload) => {
          attempts++;
          if (attempts < 3) {
            // Simulate network timeout
            throw new Error('Network timeout');
          }
          state.notifications.push({
            type: 'network-success',
            message: 'API call succeeded after retries',
            timestamp: new Date().toISOString()
          });
        }, undefined, { retries: 3, timeout: 1000 });

      const retryEvents: string[] = [];
      saga.on('step:retry', (stepName, attempt) => {
        retryEvents.push(`${stepName}:${attempt}`);
      });

      await networkTransaction.run({});

      expect(attempts).toBe(3);
      expect(retryEvents).toEqual(['api-call:1', 'api-call:2']);
      expect(saga.getState().notifications).toHaveLength(1);
      expect(saga.getState().notifications[0].type).toBe('network-success');
    });

    it('should handle step timeout correctly', async () => {
      const timeoutTransaction = saga
        .createTransaction('timeout-test')
        .addStep('slow-operation', async () => {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 200));
        }, undefined, { timeout: 100 });

      await expect(timeoutTransaction.run({})).rejects.toThrow('Step "slow-operation" timed out');
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large number of transactions efficiently', async () => {
      const startTime = Date.now();
      const promises: Promise<void>[] = [];

      // Create 100 small transactions
      for (let i = 0; i < 100; i++) {
        const tx = saga
          .createTransaction(`batch-${i}`)
          .addVoidStep('increment', (state) => {
            state.userBalance += 1;
          });
        promises.push(tx.run());
      }

      await Promise.all(promises);
      const endTime = Date.now();

      expect(saga.getState().userBalance).toBe(2100); // 2000 + 100
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should not cause memory leaks with snapshots', () => {
      const initialSnapshots = saga.stateManager.snapshotsLength;

      // Create multiple transactions that create snapshots
      for (let i = 0; i < 10; i++) {
        const tx = saga.createTransaction(`snapshot-test-${i}`);
        // Just creating transactions, not running them
      }

      // Snapshots should only be created when transactions run
      expect(saga.stateManager.snapshotsLength).toBe(initialSnapshots);
    });
  });
});