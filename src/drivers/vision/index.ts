import { IVisionDriver } from './interface';
import { MidsceneVisionDriver } from './midscene';

// Singleton accessor used by legacy callers.
let activeVisionDriver: IVisionDriver | null = null;

export const getVisionDriver = (): IVisionDriver => {
  if (!activeVisionDriver) {
    // Default to Midscene for the underlying vision implementation.
    activeVisionDriver = new MidsceneVisionDriver();
  }
  return activeVisionDriver;
};

export * from './interface';
