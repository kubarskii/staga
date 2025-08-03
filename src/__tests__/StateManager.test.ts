import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../StateManager';

interface TestState {
    count: number;
    name: string;
}

describe('StateManager', () => {
    let stateManager: StateManager<TestState>;
    const initialState: TestState = { count: 0, name: 'initial' };

    beforeEach(() => {
        stateManager = new StateManager(initialState);
    });

    it('should initialize with the provided state', () => {
        expect(stateManager.getState()).toEqual(initialState);
    });

    it('should update state and enable undo', () => {
        const newState = { count: 1, name: 'updated' };
        stateManager.setState(newState);

        expect(stateManager.getState()).toEqual(newState);

        stateManager.undo();
        expect(stateManager.getState()).toEqual(initialState);
    });

    it('should support redo after undo', () => {
        const newState = { count: 1, name: 'updated' };
        stateManager.setState(newState);
        stateManager.undo();
        stateManager.redo();

        expect(stateManager.getState()).toEqual(newState);
    });

    it('should retain initial state when undo is called without prior changes', () => {
        const freshManager = new StateManager(initialState);

        expect(() => freshManager.undo()).not.toThrow();
        expect(freshManager.getState()).toEqual(initialState);
    });

    it('should create and rollback to snapshots', () => {
        stateManager.createSnapshot();

        const newState = { count: 1, name: 'updated' };
        stateManager.setState(newState);

        expect(stateManager.getState()).toEqual(newState);

        stateManager.rollbackToLastSnapshot();
        expect(stateManager.getState()).toEqual(initialState);
    });

    it('should clear redo stack when new state is set', () => {
        const state1 = { count: 1, name: 'state1' };
        const state2 = { count: 2, name: 'state2' };

        stateManager.setState(state1);
        stateManager.undo();
        stateManager.setState(state2);

        // Should not be able to redo to state1 anymore
        stateManager.redo();
        expect(stateManager.getState()).toEqual(state2);
    });
});
