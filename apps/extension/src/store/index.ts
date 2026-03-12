import { create } from 'zustand';
import { RecordingSession } from '../types';
import { dbManager } from '../utils/indexedDB';

interface SessionState {
  sessions: RecordingSession[];
  currentSessionId: string | null;
  isInitialized: boolean;
  
  // Actions
  initializeStore: () => Promise<void>;
  createSession: (name: string) => Promise<string>;
  updateSession: (id: string, updates: Partial<RecordingSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  setCurrentSession: (id: string | null) => Promise<void>;
  getCurrentSession: () => RecordingSession | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isInitialized: false,

  initializeStore: async () => {
    if (get().isInitialized) return;

    try {
      await dbManager.init();
      const [sessions, currentSessionId] = await Promise.all([
        dbManager.getAllSessions(),
        dbManager.getCurrentSessionId(),
      ]);
      
      // Sort sessions by createdAt desc
      sessions.sort((a, b) => b.createdAt - a.createdAt);
      
      set({ sessions, currentSessionId, isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize session store:', error);
      set({ isInitialized: true }); // Still mark as initialized to avoid infinite loop
    }
  },

  createSession: async (name: string) => {
    const id = crypto.randomUUID();
    const newSession: RecordingSession = {
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
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  },

  updateSession: async (id: string, updates: Partial<RecordingSession>) => {
    const { sessions } = get();
    const sessionIndex = sessions.findIndex((s) => s.id === id);
    if (sessionIndex === -1) return;

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
    } catch (error) {
      console.error('Failed to update session:', error);
      // Revert if needed (omitted for simplicity)
    }
  },

  deleteSession: async (id: string) => {
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
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },

  setCurrentSession: async (id: string | null) => {
    try {
      await dbManager.setCurrentSessionId(id);
      set({ currentSessionId: id });
    } catch (error) {
      console.error('Failed to set current session:', error);
    }
  },

  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find((s) => s.id === currentSessionId) || null;
  },
}));
