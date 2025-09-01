import { describe, it, expect, vi } from 'vitest';
import { EventReplayer, type RecordedEvent } from '../EventReplay';

describe('EventReplayer scheduler', () => {
  it('should replay events sequentially', async () => {
    const events: RecordedEvent<number>[] = [
      { type: 'test', payload: 1, timestamp: 0, id: '1', sequenceNumber: 0, sessionId: 's', metadata: { tags: [] } },
      { type: 'test', payload: 2, timestamp: 0, id: '2', sequenceNumber: 1, sessionId: 's', metadata: { tags: [] } },
    ];
    const replayer = new EventReplayer<number>();
    replayer.loadEvents(events);
    const handled: number[] = [];
    replayer.onEventType('test', e => handled.push(e.payload));
    await replayer.startReplay({ realTimeMode: false });
    expect(handled).toEqual([1, 2]);
  });

  it('should support pause and resume', async () => {
    const events: RecordedEvent<number>[] = [
      { type: 'test', payload: 1, timestamp: 0, id: '1', sequenceNumber: 0, sessionId: 's', metadata: { tags: [] } },
      { type: 'test', payload: 2, timestamp: 50, id: '2', sequenceNumber: 1, sessionId: 's', metadata: { tags: [] } },
    ];
    const replayer = new EventReplayer<number>();
    replayer.loadEvents(events);
    const handled: number[] = [];
    replayer.onEventType('test', e => handled.push(e.payload));

    vi.useFakeTimers();
    const replayPromise = replayer.startReplay({ realTimeMode: true });
    replayer.pause();
    expect(handled.length).toBeLessThan(events.length);
    replayer.resume();
    await vi.runAllTimersAsync();
    await replayPromise;
    expect(handled).toContain(1);
    expect(handled).toContain(2);
    vi.useRealTimers();
  });
});
