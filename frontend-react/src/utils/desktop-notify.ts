// Desktop / web notifications for incoming Zalo messages.
// Works in the browser and inside the Electron renderer (Chromium).

const STORAGE_KEY = 'notifications-enabled';
const NOTIFY_TAG_PREFIX = 'zalocrm-msg-';
export const OPEN_CHAT_EVENT = 'zalocrm:open-chat';
export const PENDING_CONV_KEY = 'zalocrm-pending-conv';


export const SOUND_STORAGE_KEY = 'zalocrm:soundEnabled';


// Runtime snapshot populated from Zalo's getMute API. This is intentionally
// not persisted locally: Zalo remains the single source of truth.
const mutedConversationIds = new Set<string>();

/** Muted conversations produce neither desktop toasts nor chimes. */
export function isConversationMuted(conversationId: string): boolean {
  return mutedConversationIds.has(conversationId);
}

export function updateConversationMuteSnapshot(conversationId: string, muted: boolean): void {
  if (muted) mutedConversationIds.add(conversationId);
  else mutedConversationIds.delete(conversationId);
}

export function syncConversationMuteSnapshot(
  resolvedConversationIds: string[],
  mutedIds: string[],
): void {
  for (const conversationId of resolvedConversationIds) mutedConversationIds.delete(conversationId);
  for (const conversationId of mutedIds) mutedConversationIds.add(conversationId);
}

export function clearConversationMuteSnapshot(): void {
  mutedConversationIds.clear();
}

export const SOUND_URL = '/sounds/notify.wav';

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors.
  }
}

let soundEl: HTMLAudioElement | null = null;

/**
 * Play the incoming-message chime. Uses a single reused Audio element so
 * rapid messages restart the sound instead of stacking. Silently no-ops when
 * audio is disabled by the user or blocked by the environment.
 */
export function playNotifySound(): void {
  if (!isSoundEnabled()) return;
  try {
    if (typeof Audio === 'undefined') return;
    if (!soundEl) {
      soundEl = new Audio(SOUND_URL);
      soundEl.volume = 0.65;
      soundEl.preload = 'auto';
    }
    soundEl.currentTime = 0;
    void soundEl.play().catch(() => {
      // Autoplay policy or missing file: skip sound, never crash the app.
    });
  } catch {
    // Audio unavailable — ignore.
  }
}

export function isNotificationEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors.
  }
}

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

export interface IncomingMessageNotification {
  conversationId: string;
  title: string;
  body: string;
  icon?: string | null;
}

interface DesktopBridgeWindow extends Window {
  zaloCRMDesktop?: {
    showMainWindow: () => void;
  };
}

/** Ask the app shell to navigate to and display one conversation. */
export function openChatConversation(conversationId: string): void {
  try {
    sessionStorage.setItem(PENDING_CONV_KEY, conversationId);
  } catch {
    // Ignore storage errors.
  }
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId } }));
}

/**
 * Show a desktop notification for an incoming message. Notifications for the
 * same conversation are coalesced (one visible toast at a time).
 */
export function notifyIncomingMessage(opts: IncomingMessageNotification): void {
  if (!isNotificationEnabled()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon || undefined,
      tag: NOTIFY_TAG_PREFIX + opts.conversationId,
      silent: true,
    });
    n.onclick = () => {
      n.close();
      (window as DesktopBridgeWindow).zaloCRMDesktop?.showMainWindow();
      window.focus();
      openChatConversation(opts.conversationId);
    };
  } catch {
    // Some environments disallow constructing notifications — ignore.
  }
}
