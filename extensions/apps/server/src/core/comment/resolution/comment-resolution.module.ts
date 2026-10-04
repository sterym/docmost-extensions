import { Module } from '@nestjs/common';
import { CollaborationModule } from '../../../collaboration/collaboration.module';
import { CommentResolutionController } from './comment-resolution.controller';
import { CommentResolutionService } from './comment-resolution.service';

@Module({
  imports: [CollaborationModule],
  controllers: [CommentResolutionController],
  providers: [CommentResolutionService],
})
export class CommentResolutionModule {}
