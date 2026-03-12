/// <reference types="chrome" />

/**
 * Service Worker Keepalive Module
 * 基于 chrome.alarms 的保活机制，防止 Service Worker 在长任务中被冻结
 */

const KEEPALIVE_ALARM_NAME = 'cotabor-keepalive-alarm';
const KEEPALIVE_INTERVAL_MINUTES = 0.5; // 30 seconds

/**
 * 启动保活机制
 * 这将创建一个周期性的 alarm，强制唤醒 Service Worker
 */
export async function startKeepalive(): Promise<void> {
  // 先清除旧的
  await stopKeepalive();
  
  await chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
  });
  
  console.log('[Keepalive] Started');
}

/**
 * 停止保活机制
 */
export async function stopKeepalive(): Promise<void> {
  await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
  console.log('[Keepalive] Stopped');
}

/**
 * 注册 Alarm 监听器
 * 必须在 Service Worker 的顶层调用
 */
export function registerKeepaliveListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM_NAME) {
      // 这里的操作本身就会唤醒 SW，不需要做特别的事情
      // 可以打个 log 确认存活
      // console.log('[Keepalive] Ping', new Date().toISOString());
    }
  });
}
