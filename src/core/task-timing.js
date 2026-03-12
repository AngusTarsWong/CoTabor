import { getDebug } from '@/shared/logger';
const debugTiming = getDebug('task-timing');
export function setTimingFieldOnce(timing, field) {
    if (!timing) {
        debugTiming(`[warning] timing object missing, skip set. field=${field}`);
        return;
    }
    const value = Date.now();
    const existingValue = timing[field];
    if (existingValue !== undefined) {
        debugTiming(`[warning] duplicate timing field set ignored. field=${field}, existing=${existingValue}, incoming=${value}`);
        return;
    }
    timing[field] = value;
}
