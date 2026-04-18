import { useEffect, useState } from "react";
import {
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_KEY,
  UiPreferences,
  loadUiPreferences,
} from "../../shared/storage/ui-preferences";

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(DEFAULT_UI_PREFERENCES);

  useEffect(() => {
    let disposed = false;

    loadUiPreferences()
      .then((prefs) => {
        if (!disposed) {
          setPreferences(prefs);
        }
      })
      .catch((error) => {
        console.warn("[Sidepanel] Failed to load UI preferences:", error);
      });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local" || !changes[UI_PREFERENCES_KEY]) return;
      setPreferences({
        ...DEFAULT_UI_PREFERENCES,
        ...(changes[UI_PREFERENCES_KEY].newValue || {}),
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      disposed = true;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return preferences;
}
