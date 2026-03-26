import { IVisionDriver } from './interface';
import { MidsceneVisionDriver } from './midscene';

// 导出单例或提供工厂方法
let activeVisionDriver: IVisionDriver | null = null;

export const getVisionDriver = (): IVisionDriver => {
  if (!activeVisionDriver) {
    // 默认使用 Midscene 作为视觉驱动底层
    activeVisionDriver = new MidsceneVisionDriver();
  }
  return activeVisionDriver;
};

export const setVisionDriver = (driver: IVisionDriver) => {
  activeVisionDriver = driver;
};

export * from './interface';
