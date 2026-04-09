import { IPageDriver } from './interface';
import { PageAgentDriver } from './pageagent';

const driverPool = new Map<number, IPageDriver>();

export const getPageDriver = (tabId?: number): IPageDriver => {
  if (tabId === undefined) {
    if (driverPool.size > 0) {
      return Array.from(driverPool.values())[0];
    }
    return new PageAgentDriver();
  }

  if (!driverPool.has(tabId)) {
    const newDriver = new PageAgentDriver();
    driverPool.set(tabId, newDriver);
  }
  return driverPool.get(tabId)!;
};

export const setPageDriver = (driver: IPageDriver, tabId?: number) => {
  if (tabId !== undefined) {
    driverPool.set(tabId, driver);
  } else {
    driverPool.set(-1, driver);
  }
};

export * from './interface';
