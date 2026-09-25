import { Module } from '@nestjs/common';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';
import { SupplementLabelService } from './supplement-label.service';

@Module({
  controllers: [LabelController],
  // 补剂标签与鲜食标签是两个独立实现：前者给补剂分装工单用（60×40mm），
  // 后者是既有产线（70×100mm）。放在同一个模块只是为了共用字体资源。
  providers: [LabelService, SupplementLabelService],
  exports: [LabelService, SupplementLabelService],
})
export class LabelModule {}
