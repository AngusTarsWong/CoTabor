import { IPageDriver } from './interface';
import { PageAgentDriver } from './pageagent';

let activePageDriver: IPageDriver | null = null;

export const getPageDriver = (): IPageDriver => {
  if (!activePageDriver) {
    // 默认使用阿里 PageAgent 作为轻量级 DOM 驱动
    activePageDriver = new PageAgentDriver();
  }
  return activePageDriver;
};

export const setPageDriver = (driver: IPageDriver) => {
  activePageDriver = driver;
};

export * from './interface';
