const FALLBACK_ID_PREFIX = "questown";

let fallbackCounter = 0;

export const createQuestownId = (
  cryptoLike: Pick<Crypto, "randomUUID"> | null | undefined = globalThis.crypto
) => {
  const randomUUID = cryptoLike?.randomUUID;

  if (typeof randomUUID === "function") {
    try {
      return randomUUID.call(cryptoLike);
    } catch {
      // Fall through to the deterministic fallback when UUID generation is blocked.
    }
  }

  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;

  return [
    FALLBACK_ID_PREFIX,
    Date.now().toString(36),
    fallbackCounter.toString(36),
    Math.random().toString(36).slice(2, 10)
  ].join("-");
};
