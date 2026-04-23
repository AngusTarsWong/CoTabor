export const UI_PREFERENCES_KEY = "uiPreferences";

export type UiPreferences = {
  showDebugLogs: boolean;
  enableDocLogger: boolean;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  showDebugLogs: false,
  enableDocLogger: false,
};

export async function loadUiPreferences(): Promise<UiPreferences> {
  const result = await chrome.storage.local.get([UI_PREFERENCES_KEY]);
  const stored = result[UI_PREFERENCES_KEY] || {};
  return {
    ...DEFAULT_UI_PREFERENCES,
    ...stored,
  };
}

export async function saveUiPreferences(prefs: Partial<UiPreferences>): Promise<UiPreferences> {
  const next = {
    ...(await loadUiPreferences()),
    ...prefs,
  };
  await chrome.storage.local.set({ [UI_PREFERENCES_KEY]: next });
  return next;
}
