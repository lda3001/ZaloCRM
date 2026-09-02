/**
 * chat-attachment-routes.ts — send images / videos / files in a conversation.
 * Files are uploaded straight to Zalo via zca-js (multipart in-memory buffers).
 * The selfListen echo persists the final message (with zdn.vn URLs); we wait
 * briefly for it, then fall back to a placeholder row that the echo later heals.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import { imageSize } from 'image-size';
import type { Server } from 'socket.io';
import { Readable } from 'node:stream';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MIME_EXT_FALLBACK: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

interface UploadedFile {
  buf: Buffer;
  filename: string;
  ext: string;
  kind: 'image' | 'gif' | 'video' | 'file';
}

function sanitizeFilename(raw: string, mimetype: string): { filename: string; ext: string } {
  let name = (raw || '').split(/[\\/]/).pop() || '';
  name = name.replace(/[\r\n"]/g, '').trim();
  let ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!ext) {
    ext = MIME_EXT_FALLBACK[mimetype] || 'bin';
    name = `${name || 'file'}.${ext}`;
  }
  return { filename: name, ext };
}

function detectKind(ext: string, mimetype: string): UploadedFile['kind'] {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ext === 'gif' || mimetype === 'image/gif') return 'gif';
  if (ext === 'mp4') return 'video';
  return 'file';
}

/** Placeholder content matching the frontend file-bubble parser. */
function placeholderContent(file: UploadedFile): string {
  return JSON.stringify({
    title: file.filename,
    href: '',
    params: JSON.stringify({ fileExt: file.ext, fileSize: String(file.buf.length), fType: 1 }),
  });
}

const ZALO_FILE_HOSTS = ['zdn.vn', 'dlfl.vn', 'flchat.vn', 'zaloapp.com', 'zalo.me'];

function isAllowedZaloFileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return ZALO_FILE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function downloadDisposition(filename: string): string {
  const safeName = (filename || 'zalo-file').replace(/[\r\n]/g, '').trim() || 'zalo-file';
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

async function fetchZaloFile(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirect = 0; redirect < 5; redirect++) {
    if (!isAllowedZaloFileUrl(currentUrl)) throw new Error('Zalo file URL is not allowed');
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error('Too many Zalo file redirects');
}

async function waitForEchoMessages(
  conversationId: string,
  zaloMsgIds: string[],
  timeoutMs: number,
): Promise<Map<string, any>> {
  const found = new Map<string, any>();
  const deadline = Date.now() + timeoutMs;
  while (found.size < zaloMsgIds.length && Date.now() < deadline) {
    const rows = await prisma.message.findMany({
      where: { conversationId, zaloMsgId: { in: zaloMsgIds } },
    });
    for (const row of rows) {
      if (row.zaloMsgId) found.set(row.zaloMsgId, row);
    }
    if (found.size >= zaloMsgIds.length) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return found;
}

export async function chatAttachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Proxy Zalo CDN downloads through the authenticated CRM origin. Electron
  // does not reliably turn window.open(CDN_URL) into a native file download,
  // and older Zalo links redirect from dlfl.vn to flchat.vn.
  app.get('/api/v1/messages/:messageId/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { messageId } = request.params as { messageId: string };
    const message = await prisma.message.findFirst({
      where: { id: messageId, conversation: { orgId: user.orgId } },
      select: { content: true, contentType: true },
    });
    if (!message) return reply.status(404).send({ error: 'Không tìm thấy file' });

    let payload: any = null;
    try {
      payload = JSON.parse(message.content || '{}');
    } catch {
      return reply.status(400).send({ error: 'Dữ liệu file không hợp lệ' });
    }
    const href = typeof payload?.href === 'string' ? payload.href : '';
    if (!href || !isAllowedZaloFileUrl(href)) {
      return reply.status(400).send({ error: 'File chưa có liên kết tải hợp lệ' });
    }

    try {
      const upstream = await fetchZaloFile(href);
      if (!upstream.ok || !upstream.body) {
        return reply.status(502).send({ error: `Zalo CDN trả về lỗi ${upstream.status}` });
      }

      const filename = typeof payload.title === 'string' ? payload.title : 'zalo-file';
      reply.header('Content-Disposition', downloadDisposition(filename));
      reply.header('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      reply.header('Cache-Control', 'private, no-store');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) reply.header('Content-Length', contentLength);
      return reply.send(Readable.fromWeb(upstream.body as any));
    } catch (err) {
      logger.error('[chat] Download attachment error:', err);
      return reply.status(502).send({ error: 'Không tải được file từ Zalo' });
    }
  });

  // ── Send attachments (multipart: files[] + optional caption) ─────────────
  app.post('/api/v1/conversations/:id/attachments', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    if (!request.isMultipart()) {
      return reply.status(400).send({ error: 'Multipart form-data required' });
    }

    const files: UploadedFile[] = [];
    let caption = '';
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          const buf = await part.toBuffer();
          if (!buf.length) continue;
          const { filename, ext } = sanitizeFilename(part.filename, part.mimetype);
          files.push({ buf, filename, ext, kind: detectKind(ext, part.mimetype) });
        } else if (part.fieldname === 'caption') {
          caption = String((part as any).value || '').trim();
        }
      }
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: 'File quá lớn (tối đa 100MB)' });
      }
      throw err;
    }

    if (files.length === 0) return reply.status(400).send({ error: 'No files uploaded' });

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true, contact: { select: { id: true, fullName: true } } },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
    if (!limits.allowed) return reply.status(429).send({ error: limits.reason });

    // Build zca-js attachment sources (buffer + metadata)
    const sources = files.map((file) => {
      const metadata: { totalSize: number; width?: number; height?: number } = {
        totalSize: file.buf.length,
      };
      if (file.kind === 'image' || file.kind === 'gif') {
        try {
          const dim = imageSize(file.buf);
          if (dim.width && dim.height) {
            metadata.width = dim.width;
            metadata.height = dim.height;
          }
        } catch {
          // Dimension probing failed — zca-js falls back gracefully.
        }
      }
      return { data: file.buf, filename: file.filename as `${string}.${string}`, metadata };
    });

    try {
      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;

      zaloRateLimiter.recordSend(conversation.zaloAccountId);
      const sendResult = await instance.api.sendMessage(
        { msg: caption, attachments: sources },
        threadId,
        threadType,
      );

      // Collect msgIds: attachments (ordered) + optional separate caption message
      const attachmentIds: string[] = (sendResult?.attachment || [])
        .map((r: any) => (r?.msgId ? String(r.msgId) : ''))
        .filter(Boolean);
      const captionMsgId = sendResult?.message?.msgId ? String(sendResult.message.msgId) : null;
      const allIds = captionMsgId ? [...attachmentIds, captionMsgId] : attachmentIds;

      // Wait for the selfListen echo to persist rows with real media URLs
      const echoed = allIds.length > 0
        ? await waitForEchoMessages(id, allIds, 8000)
        : new Map<string, any>();

      const now = new Date();
      const resultMessages: any[] = [];

      // Caption message (only exists when zca-js sent it separately)
      if (captionMsgId) {
        const echo = echoed.get(captionMsgId);
        if (echo) {
          resultMessages.push(await prisma.message.update({
            where: { id: echo.id },
            data: { repliedByUserId: user.id },
          }));
        } else {
          resultMessages.push(await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId: id,
              zaloMsgId: captionMsgId,
              senderType: 'self',
              senderUid: conversation.zaloAccount.zaloUid || '',
              senderName: 'Staff',
              content: caption,
              contentType: 'text',
              sentAt: now,
              repliedByUserId: user.id,
            },
          }));
        }
      }

      for (let i = 0; i < files.length; i++) {
        const zaloMsgId = attachmentIds[i] || null;
        const echo = zaloMsgId ? echoed.get(zaloMsgId) : null;
        if (echo) {
          resultMessages.push(await prisma.message.update({
            where: { id: echo.id },
            data: { repliedByUserId: user.id },
          }));
          continue;
        }
        const file = files[i];
        resultMessages.push(await prisma.message.create({
          data: {
            id: randomUUID(),
            conversationId: id,
            zaloMsgId,
            senderType: 'self',
            senderUid: conversation.zaloAccount.zaloUid || '',
            senderName: 'Staff',
            content: placeholderContent(file),
            contentType: file.kind,
            sentAt: now,
            repliedByUserId: user.id,
          },
        }));
      }

      await prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: now, isReplied: true, unreadCount: 0 },
      });

      // Emit socket events only for rows we created ourselves (echo rows were
      // already broadcast by the Zalo listener when they arrived).
      const io = (app as any).io as Server;
      const echoedRowIds = new Set([...echoed.values()].map((row: any) => row.id));
      for (const message of resultMessages) {
        if (echoedRowIds.has(message.id)) continue;
        io?.emit('chat:message', {
          accountId: conversation.zaloAccountId,
          message,
          conversationId: id,
          threadType: conversation.threadType,
          conversationName: conversation.contact?.fullName || null,
        });
      }

      return { messages: resultMessages };
    } catch (err: any) {
      logger.error('[chat] Send attachment error:', err);
      const detail = typeof err?.message === 'string' ? err.message : '';
      if (detail.includes('not allowed')) {
        return reply.status(400).send({ error: 'Định dạng file không được Zalo hỗ trợ' });
      }
      if (detail.toLowerCase().includes('size exceed')) {
        return reply.status(413).send({ error: 'File vượt quá giới hạn dung lượng của Zalo' });
      }
      return reply.status(500).send({ error: 'Gửi file thất bại' });
    }
  });
}
