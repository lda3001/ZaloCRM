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

type QueryParams = Record<string, string>;

const GROUP_INFO_CACHE_TTL_MS = 10 * 60_000;
const GROUP_INFO_CACHE_MAX_ENTRIES = 300;
const groupInfoCache = new Map<string, { payload: any; cachedAt: number }>();

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

    return { conversations, total, page: parseInt(page), limit: parseInt(limit) };
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

  // ── Send message ─────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { content, contentType, sticker } = request.body as {
      content: string;
      contentType?: string;
      sticker?: { id: number; catId: number; type: number };
    };

    if (contentType !== 'sticker') {
      if (!content?.trim()) return reply.status(400).send({ error: 'Content required' });
    } else if (!sticker?.id || sticker.catId === undefined || !sticker.type) {
      return reply.status(400).send({ error: 'Sticker payload incomplete (id/catId/type)' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true, contact: { select: { id: true, fullName: true } } },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

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
        const sendResult = await instance.api.sendMessage({ msg: content }, threadId, threadType);
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
