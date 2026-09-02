/**
 * Temporary compatibility adapter for zca-js 2.1.2.
 *
 * Zalo removed the old /api/group/history endpoint used by the published SDK.
 * This implementation follows the current Zalo Web getrecentv2 request and can
 * be removed once the upstream getGroupChatHistory fix is released.
 * Upstream reference: https://github.com/RFS-ADRENO/zca-js/pull/370
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GroupMessage } = require('zca-js') as {
  GroupMessage: new (uid: string, data: Record<string, unknown>) => any;
};

const CUSTOM_METHOD = 'getGroupChatHistoryV2';

interface GroupHistoryPage {
  groupMsgs?: Record<string, any>[];
  lastMsgId?: number | string;
  hasMore?: boolean;
  [key: string]: unknown;
}

interface GroupHistoryRequest {
  groupId: string;
  count: number;
}

/** Install and call the fixed group-cloud history API on a live zca-js API. */
export async function getGroupChatHistoryV2(
  api: any,
  rawGroupId: string,
  count: number,
): Promise<GroupHistoryPage & { groupMsgs: any[] }> {
  if (typeof api?.custom !== 'function') {
    throw new Error('Phiên Zalo không hỗ trợ API đồng bộ lịch sử mới');
  }

  if (typeof api[CUSTOM_METHOD] !== 'function') {
    api.custom(
      CUSTOM_METHOD,
      async ({ ctx, utils, props }: any) => {
        const { groupId, count: requestedCount } = props as GroupHistoryRequest;
        const serviceHost = api.zpwServiceMap?.group_cloud_message?.[0]
          ?? ctx.loginInfo?.zpw_service_map_v3?.group_cloud_message?.[0];
        if (!serviceHost) {
          throw new Error('Phiên Zalo không cung cấp máy chủ lịch sử nhóm');
        }

        const messages: Record<string, any>[] = [];
        const seenMessageIds = new Set<string>();
        let cursor = 0;
        let lastPage: GroupHistoryPage = {};

        while (messages.length < requestedCount) {
          const params = {
            groupId,
            globalMsgId: cursor,
            count: Math.min(50, requestedCount - messages.length),
            msgIds: [],
            imei: ctx.imei,
            src: 3,
          };
          const encryptedParams = utils.encodeAES(JSON.stringify(params));
          if (!encryptedParams) throw new Error('Không thể mã hóa yêu cầu lịch sử Zalo');

          const serviceUrl = utils.makeURL(
            `${serviceHost}/api/cm/getrecentv2`,
            { params: encryptedParams, nretry: 0 },
          );
          const response = await utils.request(serviceUrl, { method: 'GET' });
          lastPage = await utils.resolve(response, (result: any) => {
            const data = result.data;
            return typeof data === 'string' ? JSON.parse(data) : (data ?? {});
          });

          const pageMessages = Array.isArray(lastPage.groupMsgs) ? lastPage.groupMsgs : [];
          for (const message of pageMessages) {
            const messageId = String(message.msgId ?? '');
            if (!messageId || seenMessageIds.has(messageId)) continue;
            seenMessageIds.add(messageId);
            messages.push(message);
            if (messages.length >= requestedCount) break;
          }

          const nextCursor = Number(lastPage.lastMsgId);
          if (!lastPage.hasMore || !nextCursor || nextCursor === cursor) break;
          cursor = nextCursor;
        }

        return {
          ...lastPage,
          groupMsgs: messages.map((message) => new GroupMessage(ctx.uid, message)),
        };
      },
    );
  }

  const groupId = rawGroupId.startsWith('g') ? rawGroupId.slice(1) : rawGroupId;
  return api[CUSTOM_METHOD]({ groupId, count });
}
