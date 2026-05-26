import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class AgentSecretService {
  private key(): Buffer {
    const source =
      process.env.AGENT_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET;

    if (!source) {
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.NODE_ENV === 'development'
      ) {
        return crypto
          .createHash('sha256')
          .update('dev-agent-config-encryption-key')
          .digest();
      }

      throw new Error(
        'AGENT_CONFIG_ENCRYPTION_KEY or JWT_SECRET is required to encrypt agent config secrets',
      );
    }

    return crypto.createHash('sha256').update(source).digest();
  }

  encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
