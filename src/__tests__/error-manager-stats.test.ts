/**
 * Regression test: ErrorManager.getErrorStats().errorsBySeverity must reflect
 * the severities of handled errors. It previously always returned all zeros
 * because severity counts were never tracked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorManager, ErrorSeverity } from '../ErrorManager';

describe('ErrorManager severity statistics', () => {
    let manager: ErrorManager;

    beforeEach(() => {
        // Silence the default ConsoleErrorHandler output during the test
        vi.spyOn(console, 'debug').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
        manager = new ErrorManager();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('counts errors by severity', () => {
        // Distinct operations avoid the per-key rate limiter
        manager.handleError('a', { component: 'c', operation: 'op1' }, ErrorSeverity.LOW);
        manager.handleError('b', { component: 'c', operation: 'op2' }, ErrorSeverity.HIGH);
        manager.handleError('c', { component: 'c', operation: 'op3' }, ErrorSeverity.HIGH);
        manager.handleError('d', { component: 'c', operation: 'op4' }, ErrorSeverity.CRITICAL);

        const stats = manager.getErrorStats();
        expect(stats.totalErrors).toBe(4);
        expect(stats.errorsBySeverity[ErrorSeverity.LOW]).toBe(1);
        expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(0);
        expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(2);
        expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    });

    it('clears severity counts with clearStats()', () => {
        manager.handleError('x', { component: 'c', operation: 'op' }, ErrorSeverity.HIGH);
        expect(manager.getErrorStats().errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);

        manager.clearStats();
        const stats = manager.getErrorStats();
        expect(stats.totalErrors).toBe(0);
        expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(0);
    });
});
