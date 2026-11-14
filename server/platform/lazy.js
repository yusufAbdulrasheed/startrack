/**
 * An object whose contents are built the first time anyone looks inside it.
 *
 * The registry of businesses and the shared code that reads it import each
 * other in a ring (a business uses the platform; the platform asks the
 * registry). Reading the registry while a module is still loading would see it
 * half-built, so tables derived from it (the AI's screens, the demo shops) are
 * wrapped in this: they behave like plain objects, but only compute once the
 * app is running and everything has finished loading.
 */
export function lazyRecord(build) {
  let cache;
  const get = () => (cache ||= build());
  return new Proxy({}, {
    get: (_, key) => get()[key],
    has: (_, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, key) => {
      const d = Object.getOwnPropertyDescriptor(get(), key);
      return d && { ...d, configurable: true };
    },
  });
}
