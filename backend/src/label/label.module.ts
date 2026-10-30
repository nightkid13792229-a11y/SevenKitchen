import { Module } from '@nestjs/common';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';
import { SupplementLabelService } from './supplement-label.service';
import { LabelV10Service } from './label-v10.service';

@Module({
  controllers: [LabelController],
  // 补剂标签与鲜食标签是两个独立实现：前者给补剂分装工单用（40×60mm），
  // 后者是既有产线（70×100mm）。放在同一个模块只是为了共用字体资源。
  providers: [LabelService, SupplementLabelService, LabelV10Service],
  exports: [LabelService, SupplementLabelService, LabelV10Service],
})
export class LabelModule {}
