import { describe, it, expect, vi } from 'vitest';
import { UnifiedEventManager } from '../managers/UnifiedEventManager';

describe('EventMap transaction:fail', () => {
  it('should pass payload to listeners', () => {
    const manager = new UnifiedEventManager();
    const spy = vi.fn();
    manager.on('transaction:fail', spy);
    const payload = { foo: 'bar' };
    const error = new Error('fail');
    manager.emit('transaction:fail', 'test', payload, error);
    expect(spy).toHaveBeenCalledWith('test', payload, error);
  });
});
