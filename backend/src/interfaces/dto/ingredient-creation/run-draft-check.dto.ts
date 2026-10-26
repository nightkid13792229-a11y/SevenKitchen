import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { CheckDomain } from '../../../application/ingredient-creation/ingredient-check-run.service';
import { CHECK_DOMAINS } from './ingredient-creation.constants';

/**
 * `POST drafts/:id/checks`：跑某一域（原料 / 营养）的核验。
 *
 * 只收 `domain`。触发方式与操作人由服务端决定（controller 固定 `USER` + 当前
 * 登录人），前端传 `trigger: 'AGENT'` 会被白名单丢掉，不会冒充 AI 自检。
 */
export class RunDraftCheckDto {
  @ApiProperty({
    description: '要核验哪一域：原料档案 / 营养档案',
    enum: CHECK_DOMAINS,
    example: 'INGREDIENT',
  })
  @IsIn(CHECK_DOMAINS)
  domain!: CheckDomain;
}
