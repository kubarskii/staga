import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SagaManager } from '../SagaManager';

interface State {
    a: number;
    b: number;
    c: number;
}

describe('Computed values', () => {
    let saga: SagaManager<State>;

    beforeEach(() => {
        saga = SagaManager.create({ a: 1, b: 2, c: 3 });
    });

    afterEach(() => {
        saga.dispose();
    });

    it('should compute derived value from two reactive sources', async () => {
        const a$ = saga.selectProperty('a');
        const b$ = saga.selectProperty('b');
        const sum$ = saga.computed(a$, b$, (a, b) => a + b);
        const updates: number[] = [];
        sum$.subscribe(v => updates.push(v));

        expect(sum$.value).toBe(3);

        const tx = saga.createTransaction<{ a: number; b: number }>('update-ab')
            .addStep('set', (state, payload) => {
                state.a = payload.a;
                state.b = payload.b;
            });

        await tx.run({ a: 4, b: 5 });
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(sum$.value).toBe(9);
        expect(updates[updates.length - 1]).toBe(9);
    });

    it('should compute derived value from three reactive sources', async () => {
        const a$ = saga.selectProperty('a');
        const b$ = saga.selectProperty('b');
        const c$ = saga.selectProperty('c');
        const sum$ = saga.computed3(a$, b$, c$, (a, b, c) => a + b + c);
        const updates: number[] = [];
        sum$.subscribe(v => updates.push(v));

        expect(sum$.value).toBe(6);

        const tx = saga.createTransaction<{ a: number; b: number; c: number }>('update-abc')
            .addStep('set', (state, payload) => {
                state.a = payload.a;
                state.b = payload.b;
                state.c = payload.c;
            });

        await tx.run({ a: 2, b: 3, c: 4 });
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(sum$.value).toBe(9);
        expect(updates[updates.length - 1]).toBe(9);
    });
});

