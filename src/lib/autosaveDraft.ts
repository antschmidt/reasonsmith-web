import { nhost } from './nhostClient';
import { UPDATE_POST_DRAFT } from './graphql/queries';

export interface DraftAutosaveOptions {
  postId: string;
  initialContent: string;
  delay?: number;          // debounce delay (ms)
  minInterval?: number;    // minimum interval between network writes (ms)
  localPrefix?: string;    // localStorage key prefix
  hashFn?: (s: string) => string;
  onSaved?: (info: { postId: string; at: number }) => void;
  onError?: (err: Error) => void;
}

interface InternalState {
  lastSavedHash: string;
  lastSaveTime: number;
  timer: ReturnType<typeof setTimeout> | null;
  pendingContent: string | null;
  saving: boolean;
  destroyed: boolean;
  scheduledAt: number | null;
}

// Lightweight FNV-1a 32-bit hash (string form)
export function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; // multiply by FNV prime via shifts
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

export function createDraftAutosaver(opts: DraftAutosaveOptions) {
  const delay = opts.delay ?? 800;
  const minInterval = opts.minInterval ?? 2500;
  const localPrefix = opts.localPrefix ?? 'draft:';
  const hash = opts.hashFn ?? fnv1a32;
  const localKey = `${localPrefix}${opts.postId}`;

  // Load any local snapshot first
  let content = (typeof localStorage !== 'undefined' && localStorage.getItem(localKey)) || opts.initialContent || '';
  let state: InternalState = {
    lastSavedHash: hash(content),
    lastSaveTime: 0,
    timer: null,
    pendingContent: null,
    saving: false,
    destroyed: false,
    scheduledAt: null
  };

  function writeLocal(c: string) {
    try { localStorage.setItem(localKey, c); } catch {}
  }

  function scheduleNetworkSave() {
    if (state.destroyed) return;
    if (state.timer) clearTimeout(state.timer);

    const now = Date.now();
    const earliest = state.lastSaveTime + minInterval;
    const targetDelay = Math.max(delay, earliest - now);

    state.timer = setTimeout(executeSave, Math.max(targetDelay, 0));
    state.scheduledAt = now + Math.max(targetDelay, 0);
  }

  async function executeSave() {
    state.timer = null;
    state.scheduledAt = null;
    if (state.destroyed) return;
    const pending = state.pendingContent;
    if (pending == null) return; // nothing to save

    const pendingHash = hash(pending);
    if (pendingHash === state.lastSavedHash) return; // no-op

    if (!navigator.onLine) { // retry later
      scheduleNetworkSave();
      return;
    }

    state.saving = true;
    try {
      const { error } = await nhost.graphql.request(UPDATE_POST_DRAFT, {
        postId: opts.postId,
        draftContent: pending
      });
      if (error) {
        const msg = Array.isArray((error as any)) ? (error as any)[0]?.message : (error as any)?.message || 'Autosave failed';
        throw new Error(msg);
      }
      state.lastSavedHash = pendingHash;
      state.lastSaveTime = Date.now();
      if (opts.onSaved) opts.onSaved({ postId: opts.postId, at: state.lastSaveTime });
    } catch (e: any) {
      if (opts.onError) opts.onError(e);
      // Retry later (exponential backoff could be added)
      scheduleNetworkSave();
    } finally {
      state.saving = false;
    }
  }

  function handleChange(newContent: string) {
    if (state.destroyed) return;
    content = newContent;
    state.pendingContent = newContent;
    writeLocal(newContent); // immediate local persistence
    scheduleNetworkSave();
  }

  async function flush() {
    if (state.destroyed) return;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    await executeSave();
  }

  function destroy() {
    state.destroyed = true;
    if (state.timer) clearTimeout(state.timer);
  }

  // Retry when back online if pending unsaved changes
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (state.pendingContent && hash(state.pendingContent) !== state.lastSavedHash) {
        scheduleNetworkSave();
      }
    });
    window.addEventListener('beforeunload', () => { if (state.pendingContent) writeLocal(state.pendingContent); });
  }

  return {
    handleChange,
    flush,
    destroy,
    getState: () => ({
      saving: state.saving,
      lastSavedAt: state.lastSaveTime || null,
      hasPending: !!state.pendingContent && hash(state.pendingContent) !== state.lastSavedHash,
      scheduledAt: state.scheduledAt
    }),
    getLocalContent: () => content
  };
}

export type DraftAutosaver = ReturnType<typeof createDraftAutosaver>;
