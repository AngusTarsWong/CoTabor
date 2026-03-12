import { uuid } from '@/shared/utils';
export function createServiceDump(data) {
    const baseData = {
        logTime: Date.now(),
    };
    const finalData = {
        logId: uuid(),
        ...baseData,
        ...data,
    };
    return finalData;
}
