interface QuoteableMessage {
  id: string;
  zaloMsgId: string | null;
  zaloCliMsgId: string | null;
  senderUid: string | null;
  senderName: string | null;
  content: string | null;
  contentType: string;
  sentAt: Date;
}

export interface StoredMessageReply {
  messageId: string | null;
  zaloMsgId: string | null;
  zaloCliMsgId: string | null;
  senderUid: string | null;
  senderName: string | null;
  content: string | null;
  contentType: string;
}

const ZALO_MESSAGE_TYPES: Record<string, string> = {
  text: 'webchat',
  image: 'chat.photo',
  sticker: 'chat.sticker',
  video: 'chat.video.msg',
  voice: 'chat.voice',
  gif: 'chat.gif',
  file: 'share.file',
  link: 'chat.link',
  location: 'chat.location.new',
};

const QUOTE_CONTENT_TYPES: Record<number, string> = {
  1: 'text',
  31: 'voice',
  32: 'image',
  36: 'sticker',
  38: 'link',
  43: 'location',
  44: 'video',
  46: 'file',
  49: 'gif',
};

function parsedQuoteContent(message: QuoteableMessage): any {
  if (message.contentType === 'text' || !message.content) return message.content || '';
  try {
    return JSON.parse(message.content);
  } catch {
    return message.content;
  }
}

export function buildZaloQuote(message: QuoteableMessage) {
  if (!message.zaloMsgId || !message.zaloCliMsgId || !message.senderUid) return null;
  return {
    content: parsedQuoteContent(message),
    msgType: ZALO_MESSAGE_TYPES[message.contentType] || 'webchat',
    propertyExt: undefined,
    uidFrom: message.senderUid,
    msgId: message.zaloMsgId,
    cliMsgId: message.zaloCliMsgId,
    ts: String(message.sentAt.getTime()),
    ttl: 0,
  };
}

export function storedReplyFromMessage(message: QuoteableMessage): StoredMessageReply {
  return {
    messageId: message.id,
    zaloMsgId: message.zaloMsgId,
    zaloCliMsgId: message.zaloCliMsgId,
    senderUid: message.senderUid,
    senderName: message.senderName,
    content: message.content,
    contentType: message.contentType,
  };
}

export function storedReplyFromZaloQuote(quote: any): StoredMessageReply | null {
  if (!quote || typeof quote !== 'object') return null;
  const cliType = Number(quote.cliMsgType || 1);
  return {
    messageId: null,
    zaloMsgId: quote.globalMsgId == null ? null : String(quote.globalMsgId),
    zaloCliMsgId: quote.cliMsgId == null ? null : String(quote.cliMsgId),
    senderUid: quote.ownerId == null ? null : String(quote.ownerId),
    senderName: typeof quote.fromD === 'string' ? quote.fromD : null,
    content: typeof quote.msg === 'string'
      ? quote.msg
      : typeof quote.attach === 'string'
        ? quote.attach
        : null,
    contentType: QUOTE_CONTENT_TYPES[cliType] || 'text',
  };
}
