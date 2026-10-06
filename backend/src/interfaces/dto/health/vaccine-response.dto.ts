import { Expose, Transform } from 'class-transformer';
import { TimezoneUtil } from '../../../utils/timezone.util';

export class VaccineRecordResponseDto {
  @Expose()
  id!: string;

  @Expose()
  dogId!: string;

  @Expose()
  vaccineName!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return TimezoneUtil.toShanghaiDateString(value);
  })
  vaccinationDate!: string;

  @Expose()
  @Transform(({ value }) => {
    // 使用上海时区转换，避免UTC导致的日期偏移
    return value ? TimezoneUtil.toShanghaiDateString(value) : null;
  })
  nextDueDate!: string | null;

  @Expose()
  notes!: string | null;

  @Expose()
  status!: string;

  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时存下的原图 URL 数组。
  /// 老记录与手工填写的记录是空数组。
  @Expose()
  attachments!: string[];

  /**
   * 这条记录被归成哪几类（2026-10-05）。
   *
   * 老板问："系统是如何将其归类的呢？因为每一个种类的疫苗，它的接种窗口、
   * 间隔时间，这些都不一样。我们是否需要将其归类之后才能匹配呢？"
   * —— 是的，必须先归类；这一页把归的结果**显示给顾客看**，
   * 免得他改完疫苗名之后不知道"到底算哪一类、会不会影响提醒"。
   *
   * 取值：core（核心疫苗）/ rabies（狂犬）/ lepto（钩端螺旋体）。
   * 一支组合苗可能同时属于好几类 —— 卫佳捌既是 core 又含 lepto。
   */
  @Expose()
  kinds!: string[];

  /**
   * 这一针含哪些病种（2026-10-06）—— **顾客看的是这个**，不是上面的类别。
   *
   * 老板："记录上给顾客显示病种，而不显示核心疫苗这种分类。"
   * 顾客勾选、界面显示的也都是病种；类别只在后台用来排期。
   */
  components!: string[];

  /** 病种的中文名（犬瘟热 / 犬细小病毒 / 犬腺病毒 …） */
  componentLabels!: string[];

  /** 归类的中文名，直接给界面用（顺序与 kinds 一致） */
  @Expose()
  kindLabels!: string[];

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

export class VaccineRecordListResponseDto {
  @Expose()
  total!: number;

  @Expose()
  records!: VaccineRecordResponseDto[];
}
