export function shouldApplyRenderedValue(renderedValues, key, nextValue) {
 if (renderedValues.get(key) === nextValue) return false;
 renderedValues.set(key, nextValue);
 return true;
}

export function forgetRenderedValue(renderedValues, key) {
 renderedValues.delete(key);
}
