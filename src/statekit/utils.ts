export type Unsubscribe = () => void;
export type EqualityFn<T> = (a: T, b: T) => boolean;
export const refEq = <T>(a: T, b: T) => Object.is(a, b);

const hasStructuredClone = typeof (globalThis as any).structuredClone === 'function';
export function deepClone<T>(v: T): T {
    if (hasStructuredClone) return (globalThis as any).structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}


