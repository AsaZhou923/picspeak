export type UploadSelectionLock = {
  isLocked: () => boolean;
  tryRun: <T>(task: () => Promise<T>) => Promise<T | undefined>;
};

export function createUploadSelectionLock(): UploadSelectionLock {
  let locked = false;

  return {
    isLocked: () => locked,
    async tryRun<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (locked) return undefined;
      locked = true;
      try {
        return await task();
      } finally {
        locked = false;
      }
    },
  };
}
