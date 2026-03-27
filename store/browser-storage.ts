import type { StateStorage } from "zustand/middleware";
import { StorageHealth } from "../domain/types";

export interface SafeBrowserStorage extends StateStorage {
  getHealth: () => StorageHealth;
  clearLastError: () => void;
  subscribe: (listener: (health: StorageHealth) => void) => () => void;
}

const STORAGE_UNAVAILABLE_MESSAGE = "브라우저 저장소를 사용할 수 없어요.";

const sameHealth = (left: StorageHealth, right: StorageHealth) =>
  left.readable === right.readable &&
  left.writable === right.writable &&
  left.degraded === right.degraded &&
  left.lastError === right.lastError;

const getDefaultStorage = (): StateStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
};

export const createSafeBrowserStorage = (storage: StateStorage | undefined = getDefaultStorage()): SafeBrowserStorage => {
  const listeners = new Set<(health: StorageHealth) => void>();
  let health: StorageHealth = storage
    ? { readable: true, writable: true, degraded: false }
    : { readable: false, writable: false, degraded: true, lastError: STORAGE_UNAVAILABLE_MESSAGE };

  const notify = () => {
    listeners.forEach((listener) => listener(health));
  };

  const updateHealth = (nextHealth: StorageHealth) => {
    if (sameHealth(health, nextHealth)) return;
    health = nextHealth;
    notify();
  };

  const setOperationSuccess = (operation: "read" | "write") => {
    const nextHealth: StorageHealth = {
      ...health,
      readable: operation === "read" ? true : health.readable,
      writable: operation === "write" ? true : health.writable
    };

    nextHealth.degraded = !(nextHealth.readable && nextHealth.writable);
    nextHealth.lastError = nextHealth.degraded ? nextHealth.lastError : undefined;
    updateHealth(nextHealth);
  };

  const setOperationFailure = (operation: "read" | "write", error: unknown) => {
    const nextHealth: StorageHealth = {
      readable: operation === "read" ? false : health.readable,
      writable: operation === "write" ? false : health.writable,
      degraded: true,
      lastError: getErrorMessage(error, STORAGE_UNAVAILABLE_MESSAGE)
    };

    updateHealth(nextHealth);
  };

  if (!storage) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      getHealth: () => health,
      clearLastError: () => {
        updateHealth({ ...health, lastError: undefined });
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
  }

  return {
    getItem: (name) => {
      try {
        const value = storage.getItem(name);
        setOperationSuccess("read");
        return value;
      } catch (error) {
        setOperationFailure("read", error);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        storage.setItem(name, value);
        setOperationSuccess("write");
      } catch (error) {
        setOperationFailure("write", error);
      }
    },
    removeItem: (name) => {
      try {
        storage.removeItem(name);
        setOperationSuccess("write");
      } catch (error) {
        setOperationFailure("write", error);
      }
    },
    getHealth: () => health,
    clearLastError: () => {
      updateHealth({ ...health, lastError: undefined });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
};
