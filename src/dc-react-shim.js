/**
 * Binds `react` imports to the React the dc-runtime injects.
 *
 * support.js evals an x-imported module as
 *   new Function("React", "module", "exports", "require", code)
 * so `React` is a free variable in scope for the whole bundle. Bundling our own
 * copy instead would give the page two Reacts, and every hook would throw
 * "Invalid hook call" — the component is rendered by the runtime's ReactDOM,
 * so it must use the runtime's React.
 */
const R = React; // eslint-disable-line no-undef

export const useState = R.useState;
export const useRef = R.useRef;
export const useEffect = R.useEffect;
export const useCallback = R.useCallback;
export const useMemo = R.useMemo;
export const Fragment = R.Fragment;
export const createElement = R.createElement;
export default R;
