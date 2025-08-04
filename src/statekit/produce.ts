import { deepClone } from './utils';

export function produce<S>(base: S, recipe: (draft: S) => void): S {
    const draft = deepClone(base);
    recipe(draft);
    return draft;
}


