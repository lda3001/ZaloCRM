/**
 * zalo-sync-routes.ts — Endpoints to sync Zalo friends/contacts to CRM contacts.
 * Requires owner or admin role.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { requireZaloAccess } from './zalo-access-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import { detectContentType } from './zalo-message-helpers.js';
import { getGroupChatHistoryV2 } from './zalo-group-history.js';

export async function zaloSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Sync all friends from a Zalo account to contacts
  app.post('/api/v1/zalo-accounts/:id/sync-contacts', { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const instance = zaloPool.getInstance(id);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      try {
        const result = await instance.api.getAllFriends();
        // getAllFriends returns object with profiles
        const friends = Object.values(result || {}) as any[];
        let created = 0, updated = 0;

        for (const friend of friends) {
          const uid = friend.userId || friend.uid || '';
          if (!uid) continue;

          const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
          const avatar = friend.avatar || '';
          const phone = friend.phoneNumber || '';

          const existing = await prisma.contact.findFirst({
            where: { zaloUid: uid, orgId: user.orgId },
          });

          if (existing) {
            await prisma.contact.update({
              where: { id: existing.id },
              data: {
                fullName: zaloName || existing.fullName,
                avatarUrl: avatar || existing.avatarUrl,
                phone: phone || existing.phone,
              },
            });
            updated++;
          } else {
            await prisma.contact.create({
              data: {
                id: randomUUID(),
                orgId: user.orgId,
                zaloUid: uid,
                fullName: zaloName || 'Unknown',
                avatarUrl: avatar || null,
                phone: phone || null,
              },
            });
            created++;
          }
        }

        logger.info(`[sync] Zalo contacts: ${created} created, ${updated} updated`);
        return { success: true, created, updated, total: friends.length };
      } catch (err) {
        logger.error('[sync] Zalo contacts error:', err);
        return reply.status(500).send({ error: 'Sync failed: ' + String(err) });
      }
    }
  );

  // ── Sync message history for one conversation ────────────────────────────
  // zca-js only exposes history for GROUP threads (getGroupChatHistory).
  // 1-1 threads have no history API: they sync in realtime from the listener.
  app.post('/api/v1/conversations/:id/sync-messages', { preHandler: requireZaloAccess('read') }, async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { count = 50 } = (request.body ?? {}) as { count?: number };
    const requestedCount = Number(count);
    const syncCount = Number.isFinite(requestedCount) && requestedCount > 0
      ? Math.min(Math.trunc(requestedCount), 200)
      : 50;

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, zaloAccountId: true, externalThreadId: true, threadType: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.threadType !== 'group') {
      return reply.status(400).send({
        error: 'Zalo chỉ cho đồng bộ lịch sử tin nhắn nhóm. Chat 1-1 tự đồng bộ từ khi tài khoản kết nối.',
      });
    }
    if (!conversation.externalThreadId) {
      return reply.status(400).send({ error: 'Hội thoại chưa có mã nhóm Zalo để đồng bộ' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    try {
      const history = await getGroupChatHistoryV2(
        instance.api,
        conversation.externalThreadId,
        syncCount,
      );
      const msgs: any[] = Array.isArray(history?.groupMsgs) ? history.groupMsgs : [];
      const messagesByZaloId = new Map<string, any>();
      let invalid = 0;

      for (const gm of msgs) {
        const data = gm?.data ?? {};
        const zaloMsgId = String(data.msgId || '');
        if (!zaloMsgId) {
          invalid++;
          continue;
        }
        messagesByZaloId.set(zaloMsgId, gm);
      }

      const zaloMsgIds = [...messagesByZaloId.keys()];
      const existingMessages = zaloMsgIds.length > 0
        ? await prisma.message.findMany({
            where: { conversationId: conversation.id, zaloMsgId: { in: zaloMsgIds } },
            select: { zaloMsgId: true },
          })
        : [];
      const existingIds = new Set(existingMessages.map((message) => message.zaloMsgId));
      const rows = [];

      for (const [zaloMsgId, gm] of messagesByZaloId) {
        if (existingIds.has(zaloMsgId)) continue;

        const data = gm.data ?? {};
        const rawContent = data.content;
        const content =
          typeof rawContent === 'string'
            ? rawContent
            : rawContent == null
              ? ''
              : JSON.stringify(rawContent);
        const parsedTimestamp = Number(data.ts);
        const sentAtMs = Number.isFinite(parsedTimestamp) && parsedTimestamp > 0
          ? (parsedTimestamp < 1_000_000_000_000 ? parsedTimestamp * 1000 : parsedTimestamp)
          : Date.now();

        rows.push({
          id: randomUUID(),
          conversationId: conversation.id,
          zaloMsgId,
          senderType: gm.isSelf ? 'self' : 'contact',
          senderUid: String(data.uidFrom || ''),
          senderName: data.dName || null,
          content,
          contentType: detectContentType(data.msgType, rawContent),
          attachments: [],
          sentAt: new Date(sentAtMs),
        });
      }

      const insertResult = rows.length > 0
        ? await prisma.message.createMany({ data: rows })
        : { count: 0 };
      const created = insertResult.count;
      const skipped = msgs.length - created;

      // Refresh conversation lastMessageAt from the newest stored message.
      const newest = await prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      if (newest) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: newest.sentAt },
        });
      }

      logger.info(
        `[sync] messages for conv ${conversation.id}: ${created} created, ${skipped} skipped (${invalid} invalid) of ${msgs.length}`,
      );
      return { success: true, created, skipped, fetched: msgs.length };
    } catch (err) {
      logger.error('[sync] message history error:', err);
      return reply.status(502).send({ error: 'Không lấy được lịch sử từ Zalo: ' + String(err) });
    }
  });
}
