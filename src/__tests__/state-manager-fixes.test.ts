/**
 * Test suite for StateManager null safety fixes
 * Tests proper null handling in undo/redo operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../StateManager';

interface TestState {
    value: number;
    data: { count: number };
}

describe('StateManager Null Safety Fixes', () => {
    let stateManager: StateManager<TestState>;
    let initialState: TestState;

    beforeEach(() => {
        initialState = {
            value: 10,
            data: { count: 5 }
        };
        stateManager = new StateManager(initialState);
    });

    describe('Undo Operations Safety', () => {
        it('should handle empty undo stack gracefully', () => {
            // No state changes yet, undo stack should be empty
            expect(stateManager.undoStackLength).toBe(0);
            
            // Undo should not throw when stack is empty
            expect(() => stateManager.undo()).not.toThrow();
            
            // State should remain unchanged
            expect(stateManager.getState()).toEqual(initialState);
        });

        it('should handle null/undefined values in undo stack', () => {
            // Make a state change to populate undo stack
            stateManager.setState({ value: 20, data: { count: 10 } });
            expect(stateManager.undoStackLength).toBe(1);

            // Undo should work correctly
            stateManager.undo();
            expect(stateManager.getState()).toEqual(initialState);
        });

        it('should properly check for undefined before state assignment in undo', () => {
            // Create multiple state changes
            stateManager.setState({ value: 20, data: { count: 10 } });
            stateManager.setState({ value: 30, data: { count: 15 } });
            
            expect(stateManager.undoStackLength).toBe(2);
            
            // First undo
            stateManager.undo();
            expect(stateManager.getState().value).toBe(20);
            
            // Second undo
            stateManager.undo();
            expect(stateManager.getState()).toEqual(initialState);
            
            // Third undo should be safe (empty stack)
            stateManager.undo();
            expect(stateManager.getState()).toEqual(initialState);
        });
    });

    describe('Redo Operations Safety', () => {
        it('should handle empty redo stack gracefully', () => {
            expect(stateManager.redoStackLength).toBe(0);
            
            // Redo should not throw when stack is empty
            expect(() => stateManager.redo()).not.toThrow();
            
            // State should remain unchanged
            expect(stateManager.getState()).toEqual(initialState);
        });

        it('should handle null/undefined values in redo stack', () => {
            // Create undo/redo scenario
            stateManager.setState({ value: 25, data: { count: 12 } });
            expect(stateManager.undoStackLength).toBe(1);
            
            stateManager.undo(); // This creates redo stack entry
            expect(stateManager.redoStackLength).toBe(1);
            
            // Redo should work correctly
            stateManager.redo();
            expect(stateManager.getState().value).toBe(25);
        });

        it('should properly check for undefined before state assignment in redo', () => {
            // Create multiple changes and undos
            stateManager.setState({ value: 25, data: { count: 12 } });
            stateManager.setState({ value: 35, data: { count: 17 } });
            
            expect(stateManager.undoStackLength).toBe(2);
            
            // Undo both changes - this populates redo stack
            stateManager.undo(); // Now at value: 25
            expect(stateManager.redoStackLength).toBe(1);
            
            stateManager.undo(); // Now at initial state
            expect(stateManager.redoStackLength).toBe(2);
            
            // First redo
            stateManager.redo();
            expect(stateManager.getState().value).toBe(25);
            
            // Second redo
            stateManager.redo();
            expect(stateManager.getState().value).toBe(35);
            
            // Third redo should be safe (empty stack)
            stateManager.redo();
            expect(stateManager.getState().value).toBe(35);
        });
    });

    describe('Snapshot Operations Safety', () => {
        it('should handle empty snapshots gracefully', () => {
            expect(stateManager.snapshotsLength).toBe(0);
            
            // Rollback to snapshot should not throw when no snapshots exist
            expect(() => stateManager.rollbackToLastSnapshot()).not.toThrow();
            
            // State should remain unchanged
            expect(stateManager.getState()).toEqual(initialState);
        });

        it('should properly check for undefined before snapshot rollback', () => {
            // Create a snapshot
            stateManager.createSnapshot();
            expect(stateManager.snapshotsLength).toBe(1);
            
            // Make changes
            stateManager.setState({ value: 100, data: { count: 50 } });
            
            // Rollback to snapshot
            stateManager.rollbackToLastSnapshot();
            expect(stateManager.getState()).toEqual(initialState);
            
            // Snapshot should be consumed
            expect(stateManager.snapshotsLength).toBe(0);
            
            // Another rollback should be safe
            stateManager.rollbackToLastSnapshot();
            expect(stateManager.getState()).toEqual(initialState);
        });

        it('should handle multiple snapshots correctly', () => {
            // Create first snapshot
            stateManager.createSnapshot();
            
            // Make change and create second snapshot
            stateManager.setState({ value: 50, data: { count: 25 } });
            stateManager.createSnapshot();
            
            // Make another change
            stateManager.setState({ value: 75, data: { count: 37 } });
            
            expect(stateManager.snapshotsLength).toBe(2);
            
            // Rollback to most recent snapshot
            stateManager.rollbackToLastSnapshot();
            expect(stateManager.getState().value).toBe(50);
            expect(stateManager.snapshotsLength).toBe(1);
            
            // Rollback to original snapshot
            stateManager.rollbackToLastSnapshot();
            expect(stateManager.getState()).toEqual(initialState);
            expect(stateManager.snapshotsLength).toBe(0);
        });
    });

    describe('Stack Operations Integration', () => {
        it('should maintain consistency between undo/redo and snapshots', () => {
            // Initial snapshot
            stateManager.createSnapshot();
            
            // Make changes
            stateManager.setState({ value: 30, data: { count: 15 } });
            stateManager.setState({ value: 40, data: { count: 20 } });
            
            // Undo one change
            stateManager.undo();
            expect(stateManager.getState().value).toBe(30);
            
            // Rollback to snapshot - this should reset to initial state
            stateManager.rollbackToLastSnapshot();
            expect(stateManager.getState()).toEqual(initialState);
            
            // After rollback, the redo stack should still exist and work
            // (This tests that rollback doesn't interfere with undo/redo mechanism)
            expect(stateManager.redoStackLength).toBe(1);
        });
    });

    describe('Memory Management Safety', () => {
        it('should handle cleanup operations safely', () => {
            // Create multiple states and snapshots
            for (let i = 0; i < 10; i++) {
                stateManager.setState({ value: i, data: { count: i * 2 } });
                if (i % 3 === 0) {
                    stateManager.createSnapshot();
                }
            }

            expect(stateManager.undoStackLength).toBeGreaterThan(0);
            expect(stateManager.snapshotsLength).toBeGreaterThan(0);

            // Dispose should not throw
            expect(() => stateManager.dispose()).not.toThrow();
        });
    });
});
