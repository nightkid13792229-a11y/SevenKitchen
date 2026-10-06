import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum VaccineStatus {
  COMPLETED = 'COMPLETED',
  SCHEDULED = 'SCHEDULED',
  OVERDUE = 'OVERDUE',
}

export class CreateVaccineDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsString()
  vaccineName!: string;

  @IsDateString()
  vaccinationDate!: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(VaccineStatus)
  status?: VaccineStatus;

  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时把顾客拍的原图一并存下来。
  /// 与体检/病历/过敏记录同一个字段名、同一种存法（COS 图片 URL 数组）。
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  /**
   * 这条记录归成哪几类（2026-10-05）。
   *
   * 取值只能是 core / rabies / lepto / other（闭集，服务端会过滤非法值）。
   * **一支组合苗可以给多个** —— 卫佳捌既是核心疫苗又含钩端螺旋体。
   *
   * 为什么让调用方显式传：归类从此不再靠"读的时候拿名字猜"。
   * 以前猜不出来就默认当核心苗，一针驱虫药也能把核心苗的某一针标记成已完成。
   * 不传时服务端会按名字推一次作为兼容（老客户端），推不出来就是**未归类**，
   * 不会硬塞成核心苗。
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  kinds?: string[];

  /**
   * 这一针**含哪些病种**（2026-10-06）。
   *
   * 取值 cdv/cpv/cav/cpi/rabies/lepto/ccov/bordetella/lyme（闭集，服务端会过滤）。
   * 顾客勾的就是它；类别（kinds）由服务端按病种推导，不再让顾客操心。
   * 不传时服务端按名字查产品库补上。
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  components?: string[];
}
