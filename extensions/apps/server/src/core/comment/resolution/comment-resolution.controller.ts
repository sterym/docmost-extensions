import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../../common/decorators/oauth-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { PageAccessService } from '../../page/page-access/page-access.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { CommentResolutionService } from './comment-resolution.service';
import { ResolveCommentDto } from './resolve-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentResolutionController {
  constructor(
    private readonly commentResolutionService: CommentResolutionService,
    private readonly commentRepo: CommentRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('resolve')
  @OAuthScope('write')
  async resolve(
    @Body() dto: ResolveCommentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const comment = await this.commentRepo.findById(dto.commentId, {
      includeCreator: true,
      includeResolvedBy: true,
    });
    if (!comment || comment.pageId !== dto.pageId) {
      throw new NotFoundException('Comment not found');
    }

    const page = await this.pageRepo.findById(comment.pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    // Anyone allowed to comment on the page may resolve or re-open threads.
    await this.pageAccessService.validateCanComment(page, user, workspace.id);

    const updated = await this.commentResolutionService.setResolved(
      comment,
      page,
      dto.resolved,
      user,
    );

    this.auditService.log({
      event: dto.resolved
        ? AuditEvent.COMMENT_RESOLVED
        : AuditEvent.COMMENT_REOPENED,
      resourceType: AuditResource.COMMENT,
      resourceId: comment.id,
      spaceId: page.spaceId,
      metadata: {
        pageId: page.id,
      },
    });

    return updated;
  }
}
