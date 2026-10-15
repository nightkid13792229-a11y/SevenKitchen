import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

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
  @IsString()
  notes?: string;

  /// 报告原件（2026-10-01 新增）：顾客可以补传/删掉疫苗本的照片
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  /*
   * ⚠️ 2026-10-15：**`kinds` 不再接受入参**（技术方案 1.1.2）。
   *    类别一律由后端算；传了也会被 ValidationPipe 的 whitelist 丢掉。
   */

  /**
   * 这一针**含哪些病种**（2026-10-06）。
   *
   * 取值 cdv/cpv/cav/cpi/rabies/lepto/ccov/bordetella/lyme（闭集，服务端会过滤）。
   * 顾客在界面上勾的就是这个 —— 类别由服务端按病种推导，不让他操心。
   * 传了它，kinds 会跟着重算；改了名字也会跟着新名字重算；
   * 两个都不传 = 都不动。
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
