/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { buildZaloQuote, storedReplyFromMessage } from './zalo-message-quote.js';

type QueryParams = Record<string, string>;

const GROUP_INFO_CACHE_TTL_MS = 10 * 60_000;
const GROUP_INFO_CACHE_MAX_ENTRIES = 300;
const groupInfoCache = new Map<string, { payload: any; cachedAt: number }>();
const GROUP_AVATAR_CACHE_MAX_ENTRIES = 1_000;
const groupAvatarCache = new Map<string, {
  avatarUrl: string | null;
  name: string | null;
  cachedAt: number;
}>();
const MESSAGE_REACTIONS = new Set(['/-strong', '/-heart', ':>', ':o', ':-((', ':-h']);

interface StoredMessageReaction {
  userId: string;
  userName: string | null;
  icon: string;
  isSelf: boolean;
}

function storedMessageReactions(value: unknown): StoredMessageReaction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredMessageReaction => {
    if (!item || typeof item !== 'object') return false;
    const reaction = item as Partial<StoredMessageReaction>;
    return typeof reaction.userId === 'string' && typeof reaction.icon === 'string';
  });
}

function forwardableMessageContent(message: { content: string | null; contentType: string }): string {
  const content = message.content?.trim() || '';
  if (message.contentType === 'text') return content;
  let payload: any = null;
  try {
    payload = content.startsWith('{') ? JSON.parse(content) : null;
  } catch {
    payload = null;
  }
  const label: Record<string, string> = {
    image: 'Hình ảnh',
    video: 'Video',
    voice: 'Tin nhắn thoại',
    gif: 'GIF',
    file: 'Tệp đính kèm',
    sticker: 'Sticker',
    link: 'Liên kết',
  };
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const url = payload?.href || payload?.hdUrl || payload?.thumb || '';
  return [title || `[${label[message.contentType] || 'Tin nhắn'}]`, url]
    .filter(Boolean)
    .join('\n');
}

interface ZaloMuteEntry {
  id?: string | number;
}

interface ZaloMuteResponse {
  chatEntries?: ZaloMuteEntry[];
  groupChatEntries?: ZaloMuteEntry[];
}

function normalizeZaloThreadId(value: unknown): string {
  return String(value ?? '').replace(/_0$/, '');
}

function mutedThreadIds(response: ZaloMuteResponse, threadType: 'user' | 'group'): Set<string> {
  const entries = threadType === 'group' ? response.groupChatEntries : response.chatEntries;
  return new Set((entries ?? []).map((entry) => normalizeZaloThreadId(entry.id)).filter(Boolean));
}

function groupInfoCacheKey(conversationId: string, requestedMemberIds: string): string {
  const memberKey = Array.from(new Set(
    requestedMemberIds.split(',').map((value) => value.split('_')[0]).filter(Boolean),
  )).sort().join(',');
  return `${conversationId}:${memberKey || '*'}`;
}

function rememberGroupInfo(key: string, payload: any): void {
  groupInfoCache.delete(key);
  groupInfoCache.set(key, { payload, cachedAt: Date.now() });
  while (groupInfoCache.size > GROUP_INFO_CACHE_MAX_ENTRIES) {
    const oldestKey = groupInfoCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    groupInfoCache.delete(oldestKey);
  }
}

function groupAvatarCacheKey(accountId: string, groupId: string): string {
  return `${accountId}:${groupId}`;
}

function freshGroupAvatar(accountId: string, groupId: string) {
  const key = groupAvatarCacheKey(accountId, groupId);
  const entry = groupAvatarCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt >= GROUP_INFO_CACHE_TTL_MS) {
    groupAvatarCache.delete(key);
    return null;
  }
  return entry;
}

function rememberGroupAvatar(
  accountId: string,
  groupId: string,
  avatarUrl: string | null,
  name: string | null,
): void {
  const key = groupAvatarCacheKey(accountId, groupId);
  groupAvatarCache.delete(key);
  groupAvatarCache.set(key, { avatarUrl, name, cachedAt: Date.now() });
  while (groupAvatarCache.size > GROUP_AVATAR_CACHE_MAX_ENTRIES) {
    const oldestKey = groupAvatarCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    groupAvatarCache.delete(oldestKey);
  }
}

/** Load every visible group's avatar in batches, at most once per cache TTL. */
async function hydrateGroupConversationAvatars(conversations: any[]): Promise<void> {
  const pendingByAccount = new Map<string, any[]>();

  for (const conversation of conversations) {
    if (conversation.threadType !== 'group' || !conversation.externalThreadId) continue;
    const cached = freshGroupAvatar(conversation.zaloAccountId, conversation.externalThreadId);
    if (cached) {
      if (conversation.contact && cached.avatarUrl) conversation.contact.avatarUrl = cached.avatarUrl;
      if (conversation.contact && cached.name) conversation.contact.fullName = cached.name;
      continue;
    }
    const pending = pendingByAccount.get(conversation.zaloAccountId) ?? [];
    pending.push(conversation);
    pendingByAccount.set(conversation.zaloAccountId, pending);
  }

  await Promise.all(Array.from(pendingByAccount.entries()).map(async ([accountId, accountConversations]) => {
    const instance = zaloPool.getInstance(accountId);
    if (!instance?.api) return;

    for (let index = 0; index < accountConversations.length; index += 50) {
      const batch = accountConversations.slice(index, index + 50);
      const groupIds = batch.map((conversation) => conversation.externalThreadId as string);
      try {
        const response = await instance.api.getGroupInfo(groupIds);
        const groups = response?.gridInfoMap ?? {};
        const repairs: Promise<unknown>[] = [];

        for (const conversation of batch) {
          const group = groups[conversation.externalThreadId]
            ?? Object.values(groups).find((item: any) => String(item?.groupId) === conversation.externalThreadId) as any;
          const avatarUrl = group?.fullAvt || group?.avt || conversation.contact?.avatarUrl || null;
          const name = group?.name || conversation.contact?.fullName || null;
          rememberGroupAvatar(accountId, conversation.externalThreadId, avatarUrl, name);

          if (!conversation.contact) continue;
          const avatarChanged = Boolean(avatarUrl && avatarUrl !== conversation.contact.avatarUrl);
          const nameChanged = Boolean(name && name !== conversation.contact.fullName);
          if (avatarUrl) conversation.contact.avatarUrl = avatarUrl;
          if (name) conversation.contact.fullName = name;
          if (conversation.contact.id && (avatarChanged || nameChanged)) {
            repairs.push(prisma.contact.update({
              where: { id: conversation.contact.id },
              data: {
                ...(avatarChanged ? { avatarUrl } : {}),
                ...(nameChanged ? { fullName: name } : {}),
              },
            }));
          }
        }
        await Promise.all(repairs);
      } catch (err) {
        logger.warn(`[chat] group avatar batch failed for account ${accountId}: ${String(err)}`);
      }
    }
  }));
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── List conversations (paginated) ──────────────────────────────────────
  app.get('/api/v1/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const {
      page = '1',
      limit = '50',
      search = '',
      accountId = '',
      threadType = '',
    } = request.query as QueryParams;

    const where: any = { orgId: user.orgId };
    if (accountId) where.zaloAccountId = accountId;
    if (threadType === 'user' || threadType === 'group') where.threadType = threadType;
    if (search) {
      where.contact = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      };
    }

    // Members can only see conversations from Zalo accounts they have access to
    if (user.role === 'member') {
      const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      where.zaloAccountId = { in: accessibleAccounts.map((a) => a.zaloAccountId) };
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, phone: true, avatarUrl: true, zaloUid: true } },
          zaloAccount: { select: { id: true, displayName: true, zaloUid: true, avatarUrl: true, phone: true } },
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            select: { content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.conversation.count({ where }),
    ]);

    await hydrateGroupConversationAvatars(conversations);

    return { conversations, total, page: parseInt(page), limit: parseInt(limit) };
  });

  // Lightweight counter for the navigation badge. A conversation remains
  // unreplied after it is opened/read and only leaves the count when a staff
  // member actually sends a response.
  app.get('/api/v1/conversations/unreplied-count', async (request: FastifyRequest) => {
    const user = request.user!;
    const where: any = { orgId: user.orgId, isReplied: false };

    // Keep the badge consistent with the conversation list for members who
    // only have access to a subset of the organisation's Zalo accounts.
    if (user.role === 'member') {
      const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      where.zaloAccountId = { in: accessibleAccounts.map((item) => item.zaloAccountId) };
    }

    const unrepliedCount = await prisma.conversation.count({ where });
    return { unrepliedCount };
  });

  // Hydrate the renderer's in-memory mute snapshot from Zalo. getMute returns
  // all muted user/group threads for one logged-in Zalo account, so call it
  // once per accessible account rather than once per stored conversation.
  app.get('/api/v1/conversation-mutes', async (request: FastifyRequest) => {
    const user = request.user!;
    const accountWhere: any = { orgId: user.orgId };
    if (user.role === 'member') {
      const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      accountWhere.id = { in: accessibleAccounts.map((item) => item.zaloAccountId) };
    }

    const accounts = await prisma.zaloAccount.findMany({
      where: accountWhere,
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    const conversations = accountIds.length > 0
      ? await prisma.conversation.findMany({
          where: { orgId: user.orgId, zaloAccountId: { in: accountIds } },
          select: {
            id: true,
            zaloAccountId: true,
            externalThreadId: true,
            threadType: true,
          },
        })
      : [];
    const conversationsByAccount = new Map<string, typeof conversations>();
    for (const conversation of conversations) {
      const current = conversationsByAccount.get(conversation.zaloAccountId) ?? [];
      current.push(conversation);
      conversationsByAccount.set(conversation.zaloAccountId, current);
    }

    const mutedConversationIds: string[] = [];
    const resolvedConversationIds: string[] = [];
    const unavailableAccountIds: string[] = [];
    await Promise.all(accounts.map(async (account) => {
      const instance = zaloPool.getInstance(account.id);
      if (!instance?.api) {
        unavailableAccountIds.push(account.id);
        return;
      }
      try {
        const response = await instance.api.getMute() as ZaloMuteResponse;
        const mutedUsers = mutedThreadIds(response, 'user');
        const mutedGroups = mutedThreadIds(response, 'group');
        const accountConversations = conversationsByAccount.get(account.id) ?? [];
        resolvedConversationIds.push(...accountConversations.map((conversation) => conversation.id));
        for (const conversation of accountConversations) {
          const threadId = normalizeZaloThreadId(conversation.externalThreadId);
          const entries = conversation.threadType === 'group' ? mutedGroups : mutedUsers;
          if (threadId && entries.has(threadId)) mutedConversationIds.push(conversation.id);
        }
      } catch (err) {
        unavailableAccountIds.push(account.id);
        logger.warn(`[chat] getMute failed for account ${account.id}: ${String(err)}`);
      }
    }));

    return { mutedConversationIds, resolvedConversationIds, unavailableAccountIds };
  });

  // ── Get single conversation ──────────────────────────────────────────────
  app.get('/api/v1/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        contact: true,
        zaloAccount: { select: { id: true, displayName: true, zaloUid: true, avatarUrl: true, phone: true, status: true } },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Not found' });

    return conversation;
  });

  // Always read the selected conversation's current mute state directly from
  // the Zalo account so changes made on another device are reflected here.
  app.get('/api/v1/conversations/:id/mute', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { externalThreadId: true, zaloAccountId: true, threadType: true },
    });
    if (!conversation?.externalThreadId) {
      return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) {
      return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });
    }

    try {
      const response = await instance.api.getMute() as ZaloMuteResponse;
      const entries = mutedThreadIds(
        response,
        conversation.threadType === 'group' ? 'group' : 'user',
      );
      return { muted: entries.has(normalizeZaloThreadId(conversation.externalThreadId)) };
    } catch (err) {
      logger.error(`[chat] getMute failed for conversation ${id}:`, err);
      return reply.status(502).send({ error: 'Không đọc được trạng thái thông báo từ Zalo' });
    }
  });

  app.put('/api/v1/conversations/:id/mute', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { muted } = request.body as { muted?: unknown };
    if (typeof muted !== 'boolean') {
      return reply.status(400).send({ error: 'Trạng thái muted không hợp lệ' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { externalThreadId: true, zaloAccountId: true, threadType: true },
    });
    if (!conversation?.externalThreadId) {
      return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) {
      return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });
    }

    try {
      // zca-js: action 1 = mute, 3 = unmute; thread type 0 = user, 1 = group.
      await instance.api.setMute(
        { duration: -1, action: muted ? 1 : 3 },
        conversation.externalThreadId,
        conversation.threadType === 'group' ? 1 : 0,
      );
      return { muted };
    } catch (err) {
      logger.error(`[chat] setMute failed for conversation ${id}:`, err);
      return reply.status(502).send({ error: 'Không cập nhật được thông báo trên Zalo' });
    }
  });

  app.get('/api/v1/conversations/:id/group-info', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { memberIds: requestedMemberIds = '', force = '' } = request.query as QueryParams;
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId, threadType: 'group' },
      select: {
        externalThreadId: true,
        zaloAccountId: true,
        contact: { select: { fullName: true, avatarUrl: true } },
      },
    });

    if (!conversation?.externalThreadId) {
      return reply.status(404).send({ error: 'Group conversation not found' });
    }

    const cacheKey = groupInfoCacheKey(id, requestedMemberIds);
    const cached = groupInfoCache.get(cacheKey);
    const cacheAge = cached ? Date.now() - cached.cachedAt : Number.POSITIVE_INFINITY;
    if (force !== '1' && cached && cacheAge < GROUP_INFO_CACHE_TTL_MS) {
      return { ...cached.payload, cached: true };
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) {
      if (cached) return { ...cached.payload, cached: true, stale: true };
      return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });
    }

    try {
      const response = await instance.api.getGroupInfo(conversation.externalThreadId);
      const group = response?.gridInfoMap?.[conversation.externalThreadId]
        ?? Object.values(response?.gridInfoMap ?? {})[0] as any;
      if (!group) return reply.status(404).send({ error: 'Không tìm thấy thông tin nhóm' });

      const currentMembers = Array.isArray(group.currentMems) ? group.currentMems : [];
      // Newer Zalo group responses commonly leave memberIds/currentMems empty
      // and expose the real roster in memVerList as "<uid>_<version>".
      const normalizeMemberId = (value: unknown) => String(value ?? '').split('_')[0];
      const memVerEntries = Array.isArray(group.memVerList)
        ? group.memVerList
        : group.memVerList && typeof group.memVerList === 'object'
          ? Object.keys(group.memVerList)
          : [];
      const allMemberIds = Array.from(new Set([
        ...(Array.isArray(group.memberIds) ? group.memberIds : []),
        ...memVerEntries,
        ...currentMembers.map((member: any) => member.id).filter(Boolean),
      ].map(normalizeMemberId).filter(Boolean))) as string[];
      const requestedIds = new Set(
        requestedMemberIds.split(',').map(normalizeMemberId).filter(Boolean),
      );
      const memberIds = requestedIds.size > 0
        ? Array.from(requestedIds)
        : allMemberIds;
      const profiles: Record<string, any> = {};

      for (let index = 0; index < memberIds.length; index += 100) {
        const batch = memberIds.slice(index, index + 100);
        try {
          const result = await instance.api.getGroupMembersInfo(batch);
          Object.assign(profiles, result?.profiles ?? {});
        } catch (err) {
          logger.warn(`[chat] group member batch failed for conversation ${id}: ${String(err)}`);
        }
      }

      const profileById = new Map(
        Object.entries(profiles).map(([profileKey, profile]: [string, any]) => [
          normalizeMemberId(profile.id || profileKey),
          profile,
        ]),
      );
      const currentById = new Map(
        currentMembers.map((member: any) => [normalizeMemberId(member.id), member]),
      );
      const adminIds = new Set(
        (Array.isArray(group.adminIds) ? group.adminIds : []).map(normalizeMemberId),
      );
      const creatorId = normalizeMemberId(group.creatorId);
      const members = memberIds.map((memberId) => {
        const profile = profileById.get(memberId) ?? currentById.get(memberId) ?? {};
        return {
          id: normalizeMemberId(profile.id ?? memberId),
          displayName: profile.displayName || profile.dName || profile.zaloName || 'Thành viên',
          zaloName: profile.zaloName || null,
          avatarUrl: profile.avatar
            || profile.avatar_25
            || profile.avatarUrl
            || profile.fullAvt
            || profile.avt
            || null,
          isAdmin: adminIds.has(memberId),
          isCreator: creatorId === memberId,
        };
      });

      const payload = {
        group: {
          id: group.groupId || conversation.externalThreadId,
          name: group.name || conversation.contact?.fullName || 'Nhóm',
          description: group.desc || '',
          avatarUrl: group.fullAvt || group.avt || conversation.contact?.avatarUrl || null,
          type: Number(group.type) === 2 ? 'community' : 'group',
          creatorId: creatorId || null,
          memberCount: Number(group.totalMember) || members.length,
          maxMember: Number(group.maxMember) || null,
          createdAt: Number(group.createdTime) || null,
          members,
        },
      };
      rememberGroupInfo(cacheKey, payload);
      return payload;
    } catch (err) {
      logger.error('[chat] get group info error:', err);
      if (cached) return { ...cached.payload, cached: true, stale: true };
      return reply.status(502).send({ error: 'Không tải được thông tin nhóm' });
    }
  });

  // ── List messages for a conversation (paginated, newest first) ──────────
  app.get('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { page = '1', limit = '50' } = request.query as QueryParams;

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { sentAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ]);

    return { messages: messages.reverse(), total, page: parseInt(page), limit: parseInt(limit) };
  });

  // Delete a message only from the connected Zalo account and this CRM.
  app.delete('/api/v1/conversations/:id/messages/:messageId', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, messageId } = request.params as { id: string; messageId: string };
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: {
        id: true,
        zaloAccountId: true,
        externalThreadId: true,
        threadType: true,
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    if (!conversation.externalThreadId) {
      return reply.status(409).send({ error: 'Cuộc trò chuyện chưa có mã Zalo' });
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id },
    });
    if (!message) return reply.status(404).send({ error: 'Không tìm thấy tin nhắn' });
    if (!message.zaloMsgId || !message.zaloCliMsgId || !message.senderUid) {
      return reply.status(409).send({ error: 'Tin nhắn cũ chưa có đủ dữ liệu Zalo để xóa' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });

    try {
      await instance.api.deleteMessage({
        data: {
          msgId: message.zaloMsgId,
          cliMsgId: message.zaloCliMsgId,
          uidFrom: message.senderUid,
        },
        threadId: conversation.externalThreadId,
        type: conversation.threadType === 'group' ? 1 : 0,
      }, true);

      await prisma.message.delete({ where: { id: message.id } });
      const latestMessage = await prisma.message.findFirst({
        where: { conversationId: id },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, senderType: true },
      });
      await prisma.conversation.update({
        where: { id },
        data: {
          lastMessageAt: latestMessage?.sentAt ?? null,
          isReplied: latestMessage ? latestMessage.senderType === 'self' : true,
        },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:removed', {
        accountId: conversation.zaloAccountId,
        conversationId: id,
        messageId: message.id,
        msgId: message.zaloMsgId,
      });
      return { messageId: message.id };
    } catch (err) {
      logger.error(`[chat] Delete message ${message.id} error:`, err);
      return reply.status(502).send({ error: 'Zalo không thể xóa tin nhắn này' });
    }
  });

  // Recall an outbound message for everyone in the Zalo conversation.
  app.post('/api/v1/conversations/:id/messages/:messageId/recall', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, messageId } = request.params as { id: string; messageId: string };
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { zaloAccountId: true, externalThreadId: true, threadType: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    if (!conversation.externalThreadId) {
      return reply.status(409).send({ error: 'Cuộc trò chuyện chưa có mã Zalo' });
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id },
    });
    if (!message) return reply.status(404).send({ error: 'Không tìm thấy tin nhắn' });
    if (message.senderType !== 'self') {
      return reply.status(403).send({ error: 'Chỉ có thể thu hồi tin nhắn do tài khoản này gửi' });
    }
    if (message.isDeleted) return message;
    if (!message.zaloMsgId || !message.zaloCliMsgId) {
      return reply.status(409).send({ error: 'Tin nhắn cũ chưa có đủ dữ liệu Zalo để thu hồi' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });

    try {
      await instance.api.undo(
        { msgId: message.zaloMsgId, cliMsgId: message.zaloCliMsgId },
        conversation.externalThreadId,
        conversation.threadType === 'group' ? 1 : 0,
      );
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:deleted', {
        accountId: conversation.zaloAccountId,
        conversationId: id,
        messageId: message.id,
        msgId: message.zaloMsgId,
      });
      return updated;
    } catch (err) {
      logger.error(`[chat] Recall message ${message.id} error:`, err);
      return reply.status(502).send({ error: 'Zalo không thể thu hồi tin nhắn này' });
    }
  });

  // Toggle the connected account's reaction on one Zalo message.
  app.put('/api/v1/conversations/:id/messages/:messageId/reaction', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, messageId } = request.params as { id: string; messageId: string };
    const { icon } = (request.body ?? {}) as { icon?: unknown };
    if (typeof icon !== 'string' || !MESSAGE_REACTIONS.has(icon)) {
      return reply.status(400).send({ error: 'Biểu cảm không hợp lệ' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        zaloAccount: { select: { zaloUid: true, displayName: true } },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    if (!conversation.externalThreadId) {
      return reply.status(409).send({ error: 'Cuộc trò chuyện chưa có mã Zalo' });
    }
    const message = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id },
    });
    if (!message) return reply.status(404).send({ error: 'Không tìm thấy tin nhắn' });
    if (message.isDeleted) return reply.status(409).send({ error: 'Tin nhắn đã được thu hồi' });
    if (!message.zaloMsgId || !message.zaloCliMsgId) {
      return reply.status(409).send({ error: 'Tin nhắn cũ chưa có đủ dữ liệu Zalo để thả biểu cảm' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });
    const actorUid = String(instance.zaloUid || conversation.zaloAccount.zaloUid || '').replace(/_0$/, '');
    if (!actorUid) return reply.status(409).send({ error: 'Không xác định được tài khoản Zalo' });

    const current = storedMessageReactions(message.reactions);
    const ownReaction = current.find((reaction) => (
      reaction.userId.replace(/_0$/, '') === actorUid || reaction.isSelf
    ));
    const nextIcon = ownReaction?.icon === icon ? '' : icon;
    const reactions = current.filter((reaction) => (
      reaction.userId.replace(/_0$/, '') !== actorUid && !reaction.isSelf
    ));
    if (nextIcon) {
      reactions.push({
        userId: actorUid,
        userName: conversation.zaloAccount.displayName,
        icon: nextIcon,
        isSelf: true,
      });
    }

    try {
      await instance.api.addReaction(nextIcon, {
        data: { msgId: message.zaloMsgId, cliMsgId: message.zaloCliMsgId },
        threadId: conversation.externalThreadId,
        type: conversation.threadType === 'group' ? 1 : 0,
      });
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: { reactions: reactions as any },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:reaction', {
        accountId: conversation.zaloAccountId,
        conversationId: id,
        messageId: message.id,
        msgId: message.zaloMsgId,
        reactions: updated.reactions,
      });
      return updated;
    } catch (err) {
      logger.error(`[chat] React to message ${message.id} error:`, err);
      return reply.status(502).send({ error: 'Zalo không thể cập nhật biểu cảm' });
    }
  });

  // Forward one stored message to one or more conversations of the same Zalo account.
  app.post('/api/v1/conversations/:id/messages/:messageId/forward', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, messageId } = request.params as { id: string; messageId: string };
    const { targetConversationIds } = (request.body ?? {}) as { targetConversationIds?: unknown };
    if (!Array.isArray(targetConversationIds)) {
      return reply.status(400).send({ error: 'Danh sách cuộc trò chuyện không hợp lệ' });
    }
    const targetIds = Array.from(new Set(
      targetConversationIds.filter((value): value is string => typeof value === 'string' && value.length > 0),
    ));
    if (targetIds.length === 0 || targetIds.length > 20) {
      return reply.status(400).send({ error: 'Chọn từ 1 đến 20 cuộc trò chuyện' });
    }

    const sourceConversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { zaloAccountId: true },
    });
    if (!sourceConversation) return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
    const sourceMessage = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id, isDeleted: false },
      select: { content: true, contentType: true },
    });
    if (!sourceMessage) return reply.status(404).send({ error: 'Không tìm thấy tin nhắn' });

    const targets = await prisma.conversation.findMany({
      where: {
        id: { in: targetIds },
        orgId: user.orgId,
        zaloAccountId: sourceConversation.zaloAccountId,
        externalThreadId: { not: null },
      },
      select: { id: true, externalThreadId: true, threadType: true },
    });
    if (targets.length !== targetIds.length) {
      return reply.status(400).send({
        error: 'Chỉ có thể chuyển tiếp giữa các cuộc trò chuyện của cùng tài khoản Zalo',
      });
    }

    const content = forwardableMessageContent(sourceMessage);
    if (!content) return reply.status(409).send({ error: 'Tin nhắn này không có nội dung để chuyển tiếp' });
    const instance = zaloPool.getInstance(sourceConversation.zaloAccountId);
    if (!instance?.api) return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });

    for (const _target of targets) {
      const limits = zaloRateLimiter.checkLimits(sourceConversation.zaloAccountId);
      if (!limits.allowed) return reply.status(429).send({ error: limits.reason });
    }

    try {
      let forwarded = 0;
      let failed = 0;
      for (const threadType of ['user', 'group'] as const) {
        const threadIds = targets
          .filter((target) => target.threadType === threadType)
          .map((target) => target.externalThreadId as string);
        if (threadIds.length === 0) continue;
        threadIds.forEach(() => zaloRateLimiter.recordSend(sourceConversation.zaloAccountId));
        const result = await instance.api.forwardMessage(
          { message: content },
          threadIds,
          threadType === 'group' ? 1 : 0,
        );
        forwarded += Array.isArray(result?.success) ? result.success.length : 0;
        failed += Array.isArray(result?.fail) ? result.fail.length : 0;
      }
      if (forwarded === 0) {
        return reply.status(502).send({ error: 'Zalo không chuyển tiếp được tin nhắn' });
      }
      return { forwarded, failed };
    } catch (err) {
      logger.error(`[chat] Forward message ${messageId} error:`, err);
      return reply.status(502).send({ error: 'Chuyển tiếp tin nhắn thất bại' });
    }
  });

  // ── Send message ─────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { content, contentType, sticker, replyToMessageId } = request.body as {
      content: string;
      contentType?: string;
      sticker?: { id: number; catId: number; type: number };
      replyToMessageId?: string;
    };

    if (contentType !== 'sticker') {
      if (!content?.trim()) return reply.status(400).send({ error: 'Content required' });
    } else if (!sticker?.id || sticker.catId === undefined || !sticker.type) {
      return reply.status(400).send({ error: 'Sticker payload incomplete (id/catId/type)' });
    }
    if (contentType === 'sticker' && replyToMessageId) {
      return reply.status(400).send({ error: 'Zalo chưa hỗ trợ trả lời bằng sticker' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true, contact: { select: { id: true, fullName: true } } },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    const replySource = replyToMessageId
      ? await prisma.message.findFirst({
          where: { id: replyToMessageId, conversationId: id, isDeleted: false },
        })
      : null;
    if (replyToMessageId && !replySource) {
      return reply.status(404).send({ error: 'Không tìm thấy tin nhắn để trả lời' });
    }
    const quote = replySource ? buildZaloQuote(replySource) : null;
    if (replySource && !quote) {
      return reply.status(409).send({ error: 'Tin nhắn cũ chưa có đủ dữ liệu Zalo để trả lời' });
    }
    const replyTo = replySource ? storedReplyFromMessage(replySource) : null;

    // Rate limit check — prevent account blocking
    const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
    if (!limits.allowed) {
      return reply.status(429).send({ error: limits.reason });
    }

    try {
      const threadId = conversation.externalThreadId || '';
      // zca-js message type: 0=User, 1=Group
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      let zaloMsgId: string | null = null;

      zaloRateLimiter.recordSend(conversation.zaloAccountId);
      if (contentType === 'sticker') {
        // zca-js expects cateId (frontend/DB use catId).
        const st = sticker!;
        const sendResult = await instance.api.sendSticker(
          { id: st.id, cateId: st.catId, type: st.type },
          threadId,
          threadType,
        );
        zaloMsgId = sendResult?.msgId ? String(sendResult.msgId) : null;
      } else {
        const sendResult = await instance.api.sendMessage(
          { msg: content, ...(quote ? { quote } : {}) },
          threadId,
          threadType,
        );
        zaloMsgId = sendResult?.message?.msgId ? String(sendResult.message.msgId) : null;
      }

      const existingMessage = zaloMsgId
        ? await prisma.message.findFirst({ where: { conversationId: id, zaloMsgId } })
        : null;
      const message = existingMessage
        ? await prisma.message.update({
            where: { id: existingMessage.id },
            data: { repliedByUserId: user.id },
          })
        : await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId: id,
              zaloMsgId,
              senderType: 'self',
              senderUid: conversation.zaloAccount.zaloUid || '',
              senderName: 'Staff',
              content: contentType === 'sticker' ? JSON.stringify(sticker) : content,
              contentType: contentType === 'sticker' ? 'sticker' : 'text',
              ...(replyTo ? { replyTo: replyTo as any } : {}),
              sentAt: new Date(),
              repliedByUserId: user.id,
            },
          });

      await prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
      });

      const io = (app as any).io as Server;
      io?.emit('chat:message', {
        accountId: conversation.zaloAccountId,
        message,
        conversationId: id,
        threadType: conversation.threadType,
        conversationName: conversation.contact?.fullName || null,
      });

      return message;
    } catch (err) {
      logger.error('[chat] Send message error:', err);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  // ── Sticker helpers (search / detail / category) ─────────────────────────
  // zca-js responses are returned as-is; renderer normalizes them.
  async function resolveStickerAccount(user: any, accountId: string) {
    if (accountId) {
      const acc = await prisma.zaloAccount.findFirst({
        where: { id: accountId, orgId: user.orgId },
        select: { id: true },
      });
      if (acc) return acc.id;
      return null;
    }
    const first = await prisma.zaloAccount.findFirst({
      where: { orgId: user.orgId },
      select: { id: true },
    });
    return first?.id || null;
  }

  app.get('/api/v1/stickers/search', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { keyword = '', accountId = '' } = request.query as QueryParams;
    if (!keyword.trim()) return reply.status(400).send({ error: 'Keyword required' });
    const accId = await resolveStickerAccount(user, accountId);
    if (!accId) return reply.status(400).send({ error: 'No Zalo account' });
    const inst = zaloPool.getInstance(accId);
    if (!inst?.api) return reply.status(400).send({ error: 'Zalo account not connected' });
    try {
      const data = await inst.api.searchSticker(keyword, 50);
      const raw = Array.isArray(data) ? data : ((data as any)?.data) ?? [];
      let stickers: any[] = raw;
      const ids: number[] = raw
        .map((s: any) => s.sticker_id ?? s.id)
        .filter((v: any) => typeof v === 'number');
      if (ids.length > 0) {
        try {
          const detailed = await inst.api.getStickersDetail(ids.slice(0, 50));
          if (Array.isArray(detailed) && detailed.length > 0) stickers = detailed;
        } catch {
          // Fall back to the raw search results (no thumbnail URLs).
        }
      }
      return { stickers };
    } catch (err) {
      logger.error('[chat] sticker search error:', err);
      return reply.status(502).send({ error: 'Sticker search failed' });
    }
  });

  app.get('/api/v1/stickers/detail', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { ids = '', accountId = '' } = request.query as QueryParams;
    const list = ids.split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    if (list.length === 0) return reply.status(400).send({ error: 'ids required' });
    const accId = await resolveStickerAccount(user, accountId);
    if (!accId) return reply.status(400).send({ error: 'No Zalo account' });
    const inst = zaloPool.getInstance(accId);
    if (!inst?.api) return reply.status(400).send({ error: 'Zalo account not connected' });
    try {
      const stickers = await inst.api.getStickersDetail(list);
      return { stickers };
    } catch (err) {
      logger.error('[chat] sticker detail error:', err);
      return reply.status(502).send({ error: 'Sticker detail failed' });
    }
  });

  app.get('/api/v1/stickers/category', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { cateId = '', accountId = '' } = request.query as QueryParams;
    if (!cateId) return reply.status(400).send({ error: 'cateId required' });
    const accId = await resolveStickerAccount(user, accountId);
    if (!accId) return reply.status(400).send({ error: 'No Zalo account' });
    const inst = zaloPool.getInstance(accId);
    if (!inst?.api) return reply.status(400).send({ error: 'Zalo account not connected' });
    try {
      const data = await inst.api.getStickerCategoryDetail(Number(cateId));
      const arr = Array.isArray(data) ? data : ((data as any)?.data) ?? [];
      return { stickers: arr };
    } catch (err) {
      logger.error('[chat] sticker category error:', err);
      return reply.status(502).send({ error: 'Sticker category failed' });
    }
  });

  // ── Create (or return) a conversation shell for a contact ────────────────
  // Used by the contact list: "Nhắn tin" on a customer without a conversation.
  // The shell is materialized on Zalo as soon as the first message is sent.
  app.post('/api/v1/conversations/for-contact', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { contactId, accountId = '' } = request.body as { contactId: string; accountId?: string };
    if (!contactId) return reply.status(400).send({ error: 'contactId required' });

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: { id: true, zaloUid: true, fullName: true },
    });
    if (!contact) return reply.status(404).send({ error: 'Contact not found' });
    if (!contact.zaloUid) {
      return reply.status(400).send({ error: 'Khách chưa có Zalo UID — chỉ khách từng nhắn qua Zalo mới tạo được hội thoại.' });
    }

    // Resolve the Zalo account: explicit → member access → first org account
    let accId = accountId;
    if (accId) {
      const acc = await prisma.zaloAccount.findFirst({
        where: { id: accId, orgId: user.orgId },
        select: { id: true },
      });
      if (!acc) return reply.status(400).send({ error: 'Zalo account not found' });
    } else if (user.role === 'member') {
      const accessible = await prisma.zaloAccountAccess.findMany({
        where: { userId: user.id },
        select: { zaloAccountId: true },
      });
      accId = accessible[0]?.zaloAccountId || '';
    } else {
      const first = await prisma.zaloAccount.findFirst({
        where: { orgId: user.orgId },
        select: { id: true },
      });
      accId = first?.id || '';
    }
    if (!accId) return reply.status(400).send({ error: 'No Zalo account available' });

    const existing = await prisma.conversation.findFirst({
      where: { zaloAccountId: accId, externalThreadId: contact.zaloUid },
      select: { id: true },
    });
    if (existing) return { conversation: existing, created: false };

    const conversation = await prisma.conversation.create({
      data: {
        id: randomUUID(),
        orgId: user.orgId,
        zaloAccountId: accId,
        contactId: contact.id,
        threadType: 'user',
        externalThreadId: contact.zaloUid,
        lastMessageAt: new Date(),
        unreadCount: 0,
        isReplied: true,
      },
      select: { id: true },
    });

    return { conversation, created: true };
  });

  // Create a private conversation from a clicked group member. The profile is
  // resolved from Zalo server-side so the client cannot create arbitrary CRM
  // identities with spoofed names or avatars.
  app.post(
    '/api/v1/zalo-accounts/:zaloAccountId/conversations/for-user',
    { preHandler: requireZaloAccess('chat') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { zaloAccountId } = request.params as { zaloAccountId: string };
      const { zaloUid } = request.body as { zaloUid?: string };
      const normalizedUid = String(zaloUid || '').replace(/_0$/, '');
      if (!normalizedUid) return reply.status(400).send({ error: 'zaloUid required' });

      const account = await prisma.zaloAccount.findFirst({
        where: { id: zaloAccountId, orgId: user.orgId },
        select: { id: true, zaloUid: true },
      });
      if (!account) return reply.status(404).send({ error: 'Zalo account not found' });
      if (account.zaloUid === normalizedUid) {
        return reply.status(400).send({ error: 'Không thể tự nhắn tin cho chính tài khoản này' });
      }

      const instance = zaloPool.getInstance(zaloAccountId);
      if (!instance?.api) return reply.status(409).send({ error: 'Tài khoản Zalo chưa kết nối' });

      let profile: any = null;
      try {
        const result = await instance.api.getUserInfo(normalizedUid);
        const profiles = result?.changed_profiles || result?.profiles || {};
        profile = profiles[normalizedUid]
          || profiles[`${normalizedUid}_0`]
          || Object.values(profiles)[0]
          || null;
      } catch (err) {
        logger.warn(`[chat] resolve clicked Zalo user ${normalizedUid} failed: ${String(err)}`);
      }
      if (!profile) {
        try {
          const result = await instance.api.getGroupMembersInfo([normalizedUid]);
          const profiles = result?.profiles || {};
          profile = profiles[normalizedUid]
            || profiles[`${normalizedUid}_0`]
            || Object.values(profiles)[0]
            || null;
        } catch (err) {
          logger.warn(`[chat] resolve clicked group member ${normalizedUid} failed: ${String(err)}`);
        }
      }
      if (!profile) {
        return reply.status(404).send({ error: 'Không lấy được thông tin thành viên từ Zalo' });
      }

      const displayName = profile.zaloName
        || profile.zalo_name
        || profile.displayName
        || profile.display_name
        || 'Khách Zalo';
      const avatarUrl = profile.avatar || profile.avatar_25 || null;
      const phone = profile.phoneNumber || profile.phone || null;

      let contact = await prisma.contact.findFirst({
        where: { orgId: user.orgId, zaloUid: normalizedUid },
        select: { id: true },
      });
      if (contact) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            fullName: displayName,
            ...(avatarUrl ? { avatarUrl } : {}),
            ...(phone ? { phone } : {}),
          },
        });
      } else {
        contact = await prisma.contact.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            zaloUid: normalizedUid,
            fullName: displayName,
            avatarUrl,
            phone,
            source: 'Zalo',
            status: 'new',
          },
          select: { id: true },
        });
      }

      const existing = await prisma.conversation.findFirst({
        where: { zaloAccountId, externalThreadId: normalizedUid },
        select: { id: true },
      });
      if (existing) return { conversation: existing, contact, created: false };

      const conversation = await prisma.conversation.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          zaloAccountId,
          contactId: contact.id,
          threadType: 'user',
          externalThreadId: normalizedUid,
          lastMessageAt: new Date(),
          unreadCount: 0,
          isReplied: true,
        },
        select: { id: true },
      });

      return { conversation, contact, created: true };
    },
  );

  // ── Mark conversation as read ────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/mark-read', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    await prisma.conversation.updateMany({
      where: { id, orgId: user.orgId },
      data: { unreadCount: 0 },
    });

    return { success: true };
  });
}
