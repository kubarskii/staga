import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SagaManager } from '../SagaManager';

interface State {
    orders: Array<{ id: string }>;
}

describe('Reactive selectors', () => {
    let saga: SagaManager<State>;

    beforeEach(() => {
        saga = SagaManager.create({ orders: [] });
    });

    afterEach(() => {
        saga.dispose();
    });

    it('should update subscribers when state changes in a transaction', async () => {
        const orderCount$ = saga.selectProperty('orders').select(o => o.length);
        const updates: number[] = [];
        orderCount$.subscribe(value => updates.push(value));

        const tx = saga.createTransaction<{ id: string }>('add-order')
            .addStep('add', (state, payload) => {
                state.orders.push({ id: payload.id });
            });

        await tx.run({ id: '1' });
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(orderCount$.value).toBe(1);
        expect(updates).toEqual([1]);
    });
});
