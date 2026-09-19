import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 成品鲜食链路漏斗事件上报入参。
 *
 * 允许匿名（登录前的浏览/点击同样要采集），因此没有任何字段是强制的；
 * customerId 由服务端从 Authorization 解析，**不接受客户端传入**，避免被随意伪造归属。
 */
export class TrackFunnelEventDto {
  @IsString()
  @MaxLength(64)
  eventName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  step?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  dogId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entrySource?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, any>;
}
