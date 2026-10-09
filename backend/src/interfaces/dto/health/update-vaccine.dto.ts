import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VaccineStatus } from './create-vaccine.dto';

export class UpdateVaccineDto {
  @IsOptional()
  @IsUUID()
  dogId?: string;

  @IsOptional()
  @IsString()
  vaccineName?: string;

  @IsOptional()
  @IsDateString()
  vaccinationDate?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(VaccineStatus)
  status?: VaccineStatus;

  /// 报告原件（2026-10-01 新增）：顾客可以补传/删掉疫苗本的照片
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
   * 顾客在界面上勾的就是这个 —— 类别由服务端按病种推导，不让他操心。
   * 传了它，kinds 会跟着重算；两个都不传 = 都不动。
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  components?: string[];
  /**
   * 产品名有没有被人工核对过（2026-10-09 安全默认值）。
   * 顾客在卡片上点「我已对照本子核对」→ PATCH 传 true → 这一针才算进计划 ✓。
   */
  @IsOptional()
  @IsBoolean()
  productVerified?: boolean;
}
