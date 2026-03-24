import type { StateStorage } from "zustand/middleware";

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const attempt = <T>(fallback: T, action: () => T) => {
  try {
    return action();
  } catch {
    return fallback;
  }
};

export const createSafeBrowserStorage = (storage: StateStorage | undefined = globalThis.localStorage): StateStorage => {
  if (!storage) {
    return noopStorage;
  }

  return {
    getItem: (name) => attempt(null, () => storage.getItem(name)),
    setItem: (name, value) => {
      attempt(undefined, () => storage.setItem(name, value));
    },
    removeItem: (name) => {
      attempt(undefined, () => storage.removeItem(name));
    }
  };
};
