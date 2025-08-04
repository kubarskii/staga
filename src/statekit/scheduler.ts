export type Priority = 'immediate' | 'user-blocking' | 'normal' | 'low' | 'idle';

export interface Scheduler {
    schedule(priority: Priority, task: () => void): void;
}

function asap(fn: () => void) {
    if (typeof queueMicrotask === 'function') queueMicrotask(fn);
    else Promise.resolve().then(fn);
}

function rafIfPossible(fn: () => void) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
    else setTimeout(fn, 0);
}

function idleIfPossible(fn: () => void) {
    const ric = (globalThis as any).requestIdleCallback as undefined | ((cb: Function) => any);
    if (ric) ric(fn);
    else setTimeout(fn, 16);
}

export function createScheduler(): Scheduler {
    return {
        schedule(priority, task) {
            switch (priority) {
                case 'immediate':
                    task();
                    break;
                case 'user-blocking':
                    asap(task);
                    break;
                case 'normal':
                    setTimeout(task, 0);
                    break;
                case 'low':
                    rafIfPossible(task);
                    break;
                case 'idle':
                    idleIfPossible(task);
                    break;
            }
        },
    };
}


