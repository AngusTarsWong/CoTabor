import { IVisionDriver } from './interface';
import { MidsceneVisionDriver } from './midscene';

// Tab-scoped accessor. Legacy callers without a tabId keep sharing one driver.
let legacyVisionDriver: IVisionDriver | null = null;
const tabVisionDrivers = new Map<number, IVisionDriver>();

export const getVisionDriver = (tabId?: number): IVisionDriver => {
  if (typeof tabId === "number") {
    let driver = tabVisionDrivers.get(tabId);
    if (!driver) {
      driver = new MidsceneVisionDriver();
      tabVisionDrivers.set(tabId, driver);
    }
    return driver;
  }

  if (!legacyVisionDriver) {
    legacyVisionDriver = new MidsceneVisionDriver();
  }
  return legacyVisionDriver;
};

export const destroyVisionDriver = async (tabId?: number): Promise<void> => {
  if (typeof tabId === "number") {
    const driver = tabVisionDrivers.get(tabId);
    if (driver) {
      await driver.destroy();
      tabVisionDrivers.delete(tabId);
    }
    return;
  }
  await legacyVisionDriver?.destroy();
  legacyVisionDriver = null;
};

export * from './interface';
