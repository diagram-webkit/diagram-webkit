// Namespaced key/value storage. With persistence off, or when the browser
// refuses localStorage (sandboxed iframe, blocked storage), values live in
// memory for the instance's lifetime.

/**
 * @param {Window} win
 * @param {{ namespace: string, persistent: boolean }} options
 */
export function createStorage(win, { namespace, persistent }) {
  const memory = new Map();
  let backend = null;
  if (persistent) {
    try {
      backend = win.localStorage;
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      console.warn(`diagram-webkit: localStorage unavailable (${error.message}); settings will not persist`);
    }
  }

  const key = (name) => `${namespace}-${name}`;

  return {
    persistent: Boolean(backend),
    get(name) {
      return backend ? backend.getItem(key(name)) : (memory.get(key(name)) ?? null);
    },
    set(name, value) {
      if (backend) backend.setItem(key(name), value);
      else memory.set(key(name), value);
    },
  };
}
