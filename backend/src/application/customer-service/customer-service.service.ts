import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createDecipheriv, createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

interface CallbackQuery {
  signature?: string;
  msg_signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
}

interface ParsedCustomerServicePayload {
  eventType?: string;
  messageType?: string;
  providerMessageId?: string;
  openKfid?: string;
  externalUserId?: string;
  content?: string;
  sourceType?: string;
  sourceTitle?: string;
  sourcePath?: string;
  orderId?: string;
  productId?: string;
  rawPayload: Record<string, unknown>;
}

interface RawCustomerServiceConfig {
  token: string | null;
  encodingAesKey: string | null;
  corpId: string | null;
}

@Injectable()
export class CustomerServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfigService: PlatformConfigService,
  ) {}

  async verifyWechatCallback(query: CallbackQuery) {
    const config = await this.getRawConfig();
    const token = this.normalize(config.token);
    const echostr = this.normalize(query.echostr);

    if (!echostr) {
      return { ok: false, echo: '' };
    }

    if (!token) {
      return { ok: false, echo: '' };
    }

    const signature = this.normalize(query.msg_signature || query.signature);
    const timestamp = this.normalize(query.timestamp);
    const nonce = this.normalize(query.nonce);
    const expectedSignature = this.sha1Sorted([token, timestamp, nonce, echostr]);
    const plainSignature = this.sha1Sorted([token, timestamp, nonce]);

    if (signature !== expectedSignature && signature !== plainSignature) {
      return { ok: false, echo: '' };
    }

    if (config.encodingAesKey) {
      try {
        return {
          ok: true,
          echo: this.decryptWechatCiphertext(
            echostr,
            config.encodingAesKey,
            config.corpId,
          ),
        };
      } catch (error) {
        console.error('[CustomerService] Failed to decrypt callback echo:', error);
        return { ok: false, echo: '' };
      }
    }

    return {
      ok: true,
      echo: echostr,
    };
  }

  async ingestWechatCallback(query: CallbackQuery, body: unknown) {
    const resolved = await this.resolveCallbackPayload(query, body);
    if (!resolved.ok) {
      return resolved;
    }

    const payload = this.parsePayload(resolved.payload);
    const now = new Date();
    const externalConversationId = this.buildExternalConversationId(payload);
    const source = this.resolveSource(payload);
    const customerId = await this.resolveCustomerId(payload, source.orderId);
    const existing = await this.prisma.customerServiceConversation.findUnique({
      where: {
        provider_externalConversationId: {
          provider: 'WECHAT_CUSTOMER_SERVICE',
          externalConversationId,
        },
      },
    });

    const metadata: Prisma.InputJsonObject = {
      callbackQuery: this.toJsonObject(query),
      rawOpenKfid: payload.openKfid || null,
      rawExternalUserId: payload.externalUserId || null,
      encrypted: resolved.encrypted,
      receiveId: resolved.receiveId || null,
    };

    const conversation = existing
      ? await this.prisma.customerServiceConversation.update({
          where: { id: existing.id },
          data: {
            openKfid: payload.openKfid || existing.openKfid,
            externalUserId: payload.externalUserId || existing.externalUserId,
            sourceType: source.sourceType || existing.sourceType,
            sourceTitle: source.sourceTitle || existing.sourceTitle,
            sourcePath: source.sourcePath || existing.sourcePath,
            orderId: source.orderId || existing.orderId,
            productId: source.productId || existing.productId,
            customerId: customerId || existing.customerId,
            lastMessageAt: now,
            metadata,
          },
        })
      : await this.prisma.customerServiceConversation.create({
          data: {
            provider: 'WECHAT_CUSTOMER_SERVICE',
            externalConversationId,
            openKfid: payload.openKfid || null,
            externalUserId: payload.externalUserId || null,
            sourceType: source.sourceType || 'GENERAL',
            sourceTitle: source.sourceTitle || null,
            sourcePath: source.sourcePath || null,
            orderId: source.orderId || null,
            productId: source.productId || null,
            customerId: customerId || null,
            lastMessageAt: now,
            metadata,
          },
        });

    const message = await this.prisma.customerServiceMessage.create({
      data: {
        conversationId: conversation.id,
        provider: 'WECHAT_CUSTOMER_SERVICE',
        providerMessageId: payload.providerMessageId || null,
        direction: 'INBOUND',
        eventType: payload.eventType || null,
        messageType: payload.messageType || null,
        content: payload.content || null,
        rawPayload: this.toJsonObject(payload.rawPayload),
      },
    });

    return { ok: true, conversation, message };
  }

  async updateConversationStatus(id: string, status: string, staffId?: string) {
    const normalized = status?.trim().toUpperCase();
    if (!['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(normalized)) {
      throw new Error('客服会话状态不正确');
    }

    const data: Prisma.CustomerServiceConversationUpdateInput = {
      status: normalized,
    };
    if (normalized === 'IN_PROGRESS' && staffId) {
      data.assignedStaffId = staffId;
    }
    if (normalized === 'OPEN') {
      data.assignedStaffId = null;
    }

    return this.prisma.customerServiceConversation.update({
      where: { id },
      data,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listConversations(query: {
    status?: string;
    orderId?: string;
    sourceType?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.max(1, Math.min(Number(query.pageSize || 20), 100));
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = query.orderId;
    if (query.sourceType) where.sourceType = query.sourceType;

    const [items, total] = await Promise.all([
      this.prisma.customerServiceConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.customerServiceConversation.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getConversation(id: string) {
    return this.prisma.customerServiceConversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private async getRawConfig(): Promise<RawCustomerServiceConfig> {
    const config = await this.prisma.customerServiceConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
    });
    return {
      token: config.token || null,
      encodingAesKey: config.encodingAesKey || null,
      corpId: config.corpId || null,
    };
  }

  private async resolveCallbackPayload(
    query: CallbackQuery,
    body: unknown,
  ): Promise<{
    ok: boolean;
    payload: unknown;
    encrypted: boolean;
    receiveId?: string | null;
    reason?: string;
  }> {
    const config = await this.getRawConfig();
    const token = this.normalize(config.token);
    const rawPayload = this.toRawPayload(body);
    const encryptedPayload = this.extractEncryptedPayload(rawPayload);

    if (encryptedPayload) {
      if (!token || !config.encodingAesKey) {
        return {
          ok: false,
          payload: rawPayload,
          encrypted: true,
          reason: 'Customer service callback encryption is not configured',
        };
      }

      const signature = this.normalize(query.msg_signature || query.signature);
      const expectedSignature = this.sha1Sorted([
        token,
        this.normalize(query.timestamp),
        this.normalize(query.nonce),
        encryptedPayload,
      ]);
      if (signature !== expectedSignature) {
        return {
          ok: false,
          payload: rawPayload,
          encrypted: true,
          reason: 'Customer service callback signature mismatch',
        };
      }

      const decryptedText = this.decryptWechatCiphertext(
        encryptedPayload,
        config.encodingAesKey,
        config.corpId,
      );
      return {
        ok: true,
        payload: decryptedText,
        encrypted: true,
        receiveId: config.corpId,
      };
    }

    const signature = this.normalize(query.msg_signature || query.signature);
    if (token && signature) {
      const timestamp = this.normalize(query.timestamp);
      const nonce = this.normalize(query.nonce);
      const plainSignature = this.sha1Sorted([token, timestamp, nonce]);
      if (signature !== plainSignature) {
        return {
          ok: false,
          payload: rawPayload,
          encrypted: false,
          reason: 'Customer service plain callback signature mismatch',
        };
      }
    }

    return { ok: true, payload: rawPayload, encrypted: false };
  }

  private parsePayload(body: unknown): ParsedCustomerServicePayload {
    const rawPayload = this.toRawPayload(body);
    const read = (...keys: string[]) => {
      for (const key of keys) {
        const value = rawPayload[key];
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value).trim();
        }
      }
      return undefined;
    };

    return {
      eventType: read('Event', 'event', 'event_type', 'EventType'),
      messageType: read('MsgType', 'msgtype', 'message_type', 'MessageType'),
      providerMessageId: read('MsgId', 'msgid', 'message_id', 'msg_id'),
      openKfid: read('OpenKfId', 'open_kfid', 'openKfid'),
      externalUserId: read(
        'ExternalUserId',
        'external_userid',
        'externalUserId',
        'FromUserName',
        'openid',
      ),
      content: read('Content', 'content', 'Text', 'text'),
      sourceType: read('sourceType', 'source_type', 'SourceType'),
      sourceTitle: read(
        'sourceTitle',
        'source_title',
        'Title',
        'SendMessageTitle',
        'send_message_title',
      ),
      sourcePath: read(
        'sourcePath',
        'source_path',
        'Path',
        'PagePath',
        'SendMessagePath',
        'send_message_path',
      ),
      orderId: read('orderId', 'order_id', 'OrderId'),
      productId: read('productId', 'product_id', 'ProductId'),
      rawPayload,
    };
  }

  private toRawPayload(body: unknown): Record<string, unknown> {
    if (!body) return {};
    if (typeof body === 'object' && !Buffer.isBuffer(body)) {
      return body as Record<string, unknown>;
    }

    const rawText = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    const trimmed = rawText.trim();
    if (!trimmed) return {};

    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return { rawText };
      }
    }

    return {
      rawText,
      ...this.parseSimpleXml(trimmed),
    };
  }

  private toJsonObject(input: object): Prisma.InputJsonObject {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, this.toJsonValue(value)]),
    ) as Prisma.InputJsonObject;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonValue(item)) as Prisma.InputJsonArray;
    }
    if (typeof value === 'object') {
      return this.toJsonObject(value as Record<string, unknown>);
    }
    return String(value);
  }

  private parseSimpleXml(xml: string): Record<string, string> {
    const data: Record<string, string> = {};
    const pattern = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      data[match[1]] = (match[2] ?? match[3] ?? '').trim();
    }
    return data;
  }

  private extractEncryptedPayload(rawPayload: Record<string, unknown>) {
    return this.normalize(
      rawPayload.Encrypt as string | undefined,
    ) || this.normalize(rawPayload.encrypt as string | undefined);
  }

  private decodeEncodingAesKey(encodingAesKey: string) {
    const normalized = this.normalize(encodingAesKey);
    if (normalized.length !== 43) {
      throw new Error('Invalid customer service EncodingAESKey length');
    }

    const aesKey = Buffer.from(`${normalized}=`, 'base64');
    if (aesKey.length !== 32) {
      throw new Error('Invalid customer service EncodingAESKey');
    }
    return aesKey;
  }

  private decryptWechatCiphertext(
    encryptedText: string,
    encodingAesKey: string,
    receiveId?: string | null,
  ) {
    const aesKey = this.decodeEncodingAesKey(encodingAesKey);
    const decipher = createDecipheriv(
      'aes-256-cbc',
      aesKey,
      aesKey.subarray(0, 16),
    );
    decipher.setAutoPadding(false);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64')),
      decipher.final(),
    ]);
    const plain = this.stripPkcs7Padding(decrypted);
    if (plain.length < 20) {
      throw new Error('Invalid customer service encrypted callback payload');
    }

    const messageLength = plain.readUInt32BE(16);
    const messageStart = 20;
    const messageEnd = messageStart + messageLength;
    const message = plain.subarray(messageStart, messageEnd).toString('utf8');
    const actualReceiveId = plain.subarray(messageEnd).toString('utf8');

    if (receiveId && actualReceiveId && receiveId !== actualReceiveId) {
      throw new Error('Customer service callback receiveId mismatch');
    }

    return message;
  }

  private stripPkcs7Padding(input: Buffer) {
    if (input.length === 0) return input;
    const pad = input[input.length - 1];
    if (pad < 1 || pad > 32 || pad > input.length) {
      return input;
    }
    return input.subarray(0, input.length - pad);
  }

  private buildExternalConversationId(payload: ParsedCustomerServicePayload) {
    if (payload.openKfid || payload.externalUserId) {
      return `${payload.openKfid || 'unknown-kf'}:${payload.externalUserId || 'unknown-user'}`;
    }
    if (payload.providerMessageId) {
      return `message:${payload.providerMessageId}`;
    }
    return `callback:${createHash('sha1')
      .update(JSON.stringify(payload.rawPayload))
      .digest('hex')}`;
  }

  private resolveSource(payload: ParsedCustomerServicePayload) {
    const sourcePath = payload.sourcePath;
    const fromPath = this.parseSourceFromPath(sourcePath);
    return {
      sourceType: payload.sourceType || fromPath.sourceType || 'GENERAL',
      sourceTitle: payload.sourceTitle || null,
      sourcePath: sourcePath || null,
      orderId: payload.orderId || fromPath.orderId || null,
      productId: payload.productId || fromPath.productId || null,
    };
  }

  private async resolveCustomerId(
    payload: ParsedCustomerServicePayload,
    orderId?: string | null,
  ) {
    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true },
      });
      if (order?.customerId) return order.customerId;
    }

    if (payload.externalUserId) {
      const identity = await this.prisma.userWechatIdentity.findFirst({
        where: { openid: payload.externalUserId },
        select: { userId: true },
      });
      if (identity?.userId) return identity.userId;

      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { wechatOpenid: payload.externalUserId },
            { wechatUnionid: payload.externalUserId },
          ],
        },
        select: { id: true },
      });
      if (user?.id) return user.id;
    }

    return null;
  }

  private parseSourceFromPath(path?: string) {
    if (!path) return {};
    const queryIndex = path.indexOf('?');
    const pathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
    const search = queryIndex >= 0 ? path.slice(queryIndex + 1) : '';
    const params = new URLSearchParams(search);
    const orderId = params.get('id') || params.get('orderId') || undefined;
    const productId = params.get('recipeId') || params.get('productId') || undefined;
    const sourceType = pathname.includes('order-detail')
      ? 'ORDER'
      : pathname.includes('recipe-detail')
        ? 'PRODUCT'
        : pathname.includes('aftersale')
          ? 'AFTERSALE'
          : undefined;
    return { sourceType, orderId, productId };
  }

  private normalize(value?: string | null) {
    const normalized = value?.trim();
    return normalized || '';
  }

  private sha1Sorted(values: string[]) {
    return createHash('sha1')
      .update(values.filter(Boolean).sort().join(''))
      .digest('hex');
  }
}
