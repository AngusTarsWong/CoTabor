import * as Z from 'zustand';
const { create } = Z;
// Use a new key to avoid conflicts with the old data structure.
const HISTORY_KEY = 'midscene-prompt-history-v2';
const LAST_SELECTED_TYPE_KEY = 'midscene-last-selected-type';
// Function to get history from localStorage
const getHistoryFromLocalStorage = () => {
    const historyString = localStorage.getItem(HISTORY_KEY);
    return historyString ? JSON.parse(historyString) : {};
};
// Function to get last selected type from localStorage
const getLastSelectedType = () => {
    return localStorage.getItem(LAST_SELECTED_TYPE_KEY) || 'aiAct';
};
// Function to save last selected type to localStorage
const setLastSelectedType = (type) => {
    localStorage.setItem(LAST_SELECTED_TYPE_KEY, type);
};
// Create the history store
export const useHistoryStore = create((set, get) => ({
    history: getHistoryFromLocalStorage(),
    lastSelectedType: getLastSelectedType(),
    clearHistory: (type) => {
        const newHistory = { ...get().history };
        delete newHistory[type];
        set({ history: newHistory });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    },
    addHistory: (historyItem) => {
        const { type } = historyItem;
        const currentHistory = get().history;
        const typeHistory = currentHistory[type] || [];
        // Prevent duplicates by comparing a combination of prompt and params.
        const stringifiedNewItem = JSON.stringify({
            prompt: historyItem.prompt,
            params: historyItem.params,
        });
        const newTypeHistory = [
            historyItem,
            ...typeHistory.filter((h) => {
                const stringifiedOldItem = JSON.stringify({
                    prompt: h.prompt,
                    params: h.params,
                });
                return stringifiedOldItem !== stringifiedNewItem;
            }),
        ];
        // Limit history to 10 items per type
        if (newTypeHistory.length > 10) {
            newTypeHistory.length = 10;
        }
        const newHistory = {
            ...currentHistory,
            [type]: newTypeHistory,
        };
        set({ history: newHistory });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    },
    getHistoryForType: (type) => {
        return get().history[type] || [];
    },
    setLastSelectedType: (type) => {
        set({ lastSelectedType: type });
        setLastSelectedType(type);
    },
}));
