import { IsString } from 'class-validator';

export class CreateAgentRecipeSessionDto {
  @IsString()
  assessmentId!: string;
}

export class SendAgentRecipeMessageDto {
  @IsString()
  content!: string;
}
