import { describe, it, expect } from 'vitest';
import {
    createStep,
    createStateUpdater,
    createStateValidator,
    createStateTransformer,
    createPayloadValidator,
    isValidState,
} from '../helpers';

interface TestState {
    count: number;
    name: string;
    items: string[];
}

interface TestPayload {
    amount: number;
    message: string;
}

describe('Helpers', () => {
    describe('createStep', () => {
        it('should create a step with proper structure', () => {
            const execute = (state: TestState, payload: TestPayload) => {
                state.count += payload.amount;
            };

            const compensate = (state: TestState, payload: TestPayload) => {
                state.count -= payload.amount;
            };

            const step = createStep('test-step', execute, compensate, { retries: 3 });

            expect(step).toEqual({
                name: 'test-step',
                execute,
                compensate,
                options: { retries: 3 }
            });
        });

        it('should work without compensate and options', () => {
            const execute = (state: TestState, payload: TestPayload) => {
                state.count += payload.amount;
            };

            const step = createStep('simple-step', execute);

            expect(step).toEqual({
                name: 'simple-step',
                execute,
                compensate: undefined,
                options: {}
            });
        });
    });

    describe('createStateUpdater', () => {
        it('should create an updater that modifies state directly', () => {
            const state: TestState = { count: 0, name: 'test', items: [] };

            const updater = createStateUpdater<TestState>((state) => {
                state.count = 10;
                state.name = 'updated';
            });

            updater(state);

            expect(state).toEqual({ count: 10, name: 'updated', items: [] });
        });

        it('should create an updater that returns partial state', () => {
            const state: TestState = { count: 0, name: 'test', items: [] };

            const updater = createStateUpdater<TestState>(() => ({
                count: 5,
                name: 'partial'
            }));

            updater(state);

            expect(state).toEqual({ count: 5, name: 'partial', items: [] });
        });
    });

    describe('createStateValidator', () => {
        it('should create a validator that passes', () => {
            const validator = createStateValidator<TestState>((state) => state.count >= 0);
            const state: TestState = { count: 5, name: 'test', items: [] };

            expect(() => validator(state)).not.toThrow();
        });

        it('should create a validator that throws on false', () => {
            const validator = createStateValidator<TestState>((state) => state.count >= 0);
            const state: TestState = { count: -1, name: 'test', items: [] };

            expect(() => validator(state)).toThrow('State validation failed');
        });

        it('should create a validator that throws with custom message', () => {
            const validator = createStateValidator<TestState>((state) =>
                state.count >= 0 ? true : 'Count must be non-negative'
            );
            const state: TestState = { count: -1, name: 'test', items: [] };

            expect(() => validator(state)).toThrow('Count must be non-negative');
        });
    });

    describe('createStateTransformer', () => {
        it('should create a transformer that converts state', () => {
            const transformer = createStateTransformer<TestState, string>((state) =>
                `${state.name}: ${state.count}`
            );

            const state: TestState = { count: 5, name: 'test', items: [] };
            const result = transformer(state);

            expect(result).toBe('test: 5');
        });
    });

    describe('createPayloadValidator', () => {
        it('should create a validator that accepts valid payloads', () => {
            const isTestPayload = (payload: unknown): payload is TestPayload => {
                return typeof payload === 'object' &&
                    payload !== null &&
                    typeof (payload as Record<string, unknown>).amount === 'number' &&
                    typeof (payload as Record<string, unknown>).message === 'string';
            };

            const validator = createPayloadValidator(isTestPayload);
            const payload = { amount: 5, message: 'test' };

            expect(() => validator(payload)).not.toThrow();
        });

        it('should create a validator that rejects invalid payloads', () => {
            const isTestPayload = (payload: unknown): payload is TestPayload => {
                return typeof payload === 'object' &&
                    payload !== null &&
                    typeof (payload as Record<string, unknown>).amount === 'number' &&
                    typeof (payload as Record<string, unknown>).message === 'string';
            };

            const validator = createPayloadValidator(isTestPayload);
            const payload = { amount: 'invalid', message: 'test' };

            expect(() => validator(payload)).toThrow('Invalid payload type');
        });
    });

    describe('isValidState', () => {
        it('should return true for valid state objects', () => {
            expect(isValidState({ count: 0 })).toBe(true);
            expect(isValidState({ a: 1, b: 'test' })).toBe(true);
        });

        it('should return false for invalid state values', () => {
            expect(isValidState(null)).toBe(false);
            expect(isValidState(undefined)).toBe(false);
            expect(isValidState([])).toBe(false);
            expect(isValidState('string')).toBe(false);
            expect(isValidState(123)).toBe(false);
        });
    });
});