import { IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVaccineDto {
  @IsOptional()
  @IsUUID()
  dogId?: string; // Optional since it comes from URL parameter :dogId

  @IsString()
  vaccineName!: string;

  @IsDateString()
  vaccinationDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时把顾客拍的原图一并存下来。
  /// 与体检/病历/过敏记录同一个字段名、同一种存法（COS 图片 URL 数组）。
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  /*
   * ⚠️ 2026-10-15：**`kinds` 不再接受入参**（技术方案 1.1.2）。
   *
   * 类别一律由后端算：有 `components`（顾客勾的病种）就由它推，
   * 没有就按名字字面判，两条都判不出就**不保存**（需求 R6）。
   * 让前端传类别会让"改了病种但类别没跟着变"再次发生（冲突 A13）。
   */

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
  /**
   * 这一针的产品名**有没有被人工核对过**（2026-10-09 安全默认值）。
   *
   * 不传 = true（手工填写、老客户端都照旧算数 ✓）；
   * 识别出来且我们有理由怀疑的（品牌对不上 / 复核读到不一样的字 / 狂犬）
   * 由小程序显式传 false，等顾客点「我已对照本子核对」再传 true ✓。
   */
  @IsOptional()
  @IsBoolean()
  productVerified?: boolean;
}
