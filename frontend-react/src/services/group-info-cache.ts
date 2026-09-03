import { api } from '../api/client';

export interface GroupMemberInfo {
  id: string;
  displayName: string;
  zaloName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isCreator: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  type: 'group' | 'community';
  creatorId: string | null;
  memberCount: number;
  maxMember: number | null;
  createdAt: number | null;
  members: GroupMemberInfo[];
}

interface CacheEntry {
  data: GroupInfo;
  cachedAt: number;
}

interface GetGroupInfoOptions {
  memberIds?: string[];
  force?: boolean;
}

const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 120;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<GroupInfo>>();

function normalizedMemberIds(memberIds: string[] | undefined): string[] {
  return Array.from(new Set((memberIds ?? []).map((id) => id.split('_')[0]).filter(Boolean))).sort();
}

function cacheKey(conversationId: string, memberIds: string[]): string {
  return `${conversationId}:${memberIds.length > 0 ? memberIds.join(',') : '*'}`;
}

function freshEntry(key: string): GroupInfo | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function remember(key: string, data: GroupInfo): void {
  cache.delete(key);
  cache.set(key, { data, cachedAt: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function invalidateGroupInfo(conversationId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${conversationId}:`)) cache.delete(key);
  }
}

/** Shared group cache for the thread header, message senders and group panel. */
export async function getGroupInfoCached(
  conversationId: string,
  options: GetGroupInfoOptions = {},
): Promise<GroupInfo> {
  const memberIds = normalizedMemberIds(options.memberIds);
  const key = cacheKey(conversationId, memberIds);
  const fullKey = cacheKey(conversationId, []);

  if (options.force) invalidateGroupInfo(conversationId);
  if (!options.force) {
    const exact = freshEntry(key);
    if (exact) return exact;
    // A full roster satisfies every sender-profile request.
    if (memberIds.length > 0) {
      const full = freshEntry(fullKey);
      if (full) return full;
      const fullRequest = inFlight.get(fullKey);
      if (fullRequest) return fullRequest;
    }
    const existingRequest = inFlight.get(key);
    if (existingRequest) return existingRequest;
  }

  const request = api
    .get(`/conversations/${conversationId}/group-info`, {
      params: {
        memberIds: memberIds.length > 0 ? memberIds.join(',') : undefined,
        force: options.force ? '1' : undefined,
      },
    })
    .then((response) => {
      const data = response.data.group as GroupInfo;
      remember(key, data);
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
