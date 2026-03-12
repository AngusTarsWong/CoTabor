import { create } from 'zustand';
import { dbManager } from '../utils/indexedDB';
export const useSessionStore = create((set, get) => ({
    sessions: [],
    currentSessionId: null,
    isInitialized: false,
    initializeStore: async () => {
        if (get().isInitialized)
            return;
        try {
            await dbManager.init();
            const [sessions, currentSessionId] = await Promise.all([
                dbManager.getAllSessions(),
                dbManager.getCurrentSessionId(),
            ]);
            // Sort sessions by createdAt desc
            sessions.sort((a, b) => b.createdAt - a.createdAt);
            set({ sessions, currentSessionId, isInitialized: true });
        }
        catch (error) {
            console.error('Failed to initialize session store:', error);
            set({ isInitialized: true }); // Still mark as initialized to avoid infinite loop
        }
    },
    createSession: async (name) => {
        const id = crypto.randomUUID();
        const newSession = {
            id,
            name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            events: [],
            plan: [],
            messages: [name],
            status: 'idle',
        };
        try {
            await dbManager.saveSession(newSession);
            const { sessions } = get();
            set({ sessions: [newSession, ...sessions], currentSessionId: id });
            await dbManager.setCurrentSessionId(id);
            return id;
        }
        catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    },
    updateSession: async (id, updates) => {
        const { sessions } = get();
        const sessionIndex = sessions.findIndex((s) => s.id === id);
        if (sessionIndex === -1)
            return;
        const updatedSession = {
            ...sessions[sessionIndex],
            ...updates,
            updatedAt: Date.now(),
        };
        try {
            // Optimistic update
            const newSessions = [...sessions];
            newSessions[sessionIndex] = updatedSession;
            set({ sessions: newSessions });
            await dbManager.saveSession(updatedSession);
        }
        catch (error) {
            console.error('Failed to update session:', error);
            // Revert if needed (omitted for simplicity)
        }
    },
    deleteSession: async (id) => {
        try {
            await dbManager.deleteSession(id);
            const { sessions, currentSessionId } = get();
            const newSessions = sessions.filter((s) => s.id !== id);
            let newCurrentSessionId = currentSessionId;
            if (currentSessionId === id) {
                newCurrentSessionId = null;
                await dbManager.setCurrentSessionId(null);
            }
            set({ sessions: newSessions, currentSessionId: newCurrentSessionId });
        }
        catch (error) {
            console.error('Failed to delete session:', error);
        }
    },
    setCurrentSession: async (id) => {
        try {
            await dbManager.setCurrentSessionId(id);
            set({ currentSessionId: id });
        }
        catch (error) {
            console.error('Failed to set current session:', error);
        }
    },
    getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find((s) => s.id === currentSessionId) || null;
    },
}));
