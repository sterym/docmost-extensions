import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { Comment, Page, User } from '@docmost/db/types/entity.types';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import { WsService } from '../../../ws/ws.service';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { ICommentResolvedNotificationJob } from '../../../integrations/queue/constants/queue.interface';

/**
 * Marks a top-level comment thread as resolved or re-opens it.
 *
 * Upstream Docmost ships this endpoint only in its enterprise edition. This is
 * an independent implementation on top of the open-source building blocks
 * that already exist in core: the `resolved_at` / `resolved_by_id` columns,
 * the `resolveCommentMark` collaboration handler, the `commentResolved`
 * websocket event and the comment-resolved notification job.
 */
@Injectable()
export class CommentResolutionService {
  private readonly logger = new Logger(CommentResolutionService.name);

  constructor(
    private readonly commentRepo: CommentRepo,
    private readonly wsService: WsService,
    private readonly collaborationGateway: CollaborationGateway,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async setResolved(
    comment: Comment,
    page: Page,
    resolved: boolean,
    actor: User,
  ): Promise<Comment> {
    if (comment.parentCommentId) {
      throw new BadRequestException(
        'Only top-level comments can be resolved',
      );
    }

    const alreadyInState = Boolean(comment.resolvedAt) === resolved;
    if (!alreadyInState) {
      const now = new Date();
      await this.commentRepo.updateComment(
        {
          resolvedAt: resolved ? now : null,
          resolvedById: resolved ? actor.id : null,
          updatedAt: now,
        },
        comment.id,
      );
    }

    // Keep the inline highlight in the collaborative document in sync for
    // everyone, including clients that did not trigger the change.
    try {
      await this.collaborationGateway.handleYjsEvent(
        'resolveCommentMark',
        `page.${page.id}`,
        { commentId: comment.id, resolved, user: actor },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update comment mark for comment ${comment.id}; the comment state was saved`,
        error,
      );
    }

    const updated = await this.commentRepo.findById(comment.id, {
      includeCreator: true,
      includeResolvedBy: true,
    });

    if (resolved && !alreadyInState) {
      const jobData: ICommentResolvedNotificationJob = {
        commentId: comment.id,
        commentCreatorId: comment.creatorId,
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: actor.id,
      };
      this.notificationQueue
        .add(QueueJob.COMMENT_RESOLVED_NOTIFICATION, jobData)
        .catch((err) =>
          this.logger.warn(
            `Failed to queue comment-resolved notification: ${err.message}`,
          ),
        );
    }

    this.wsService.emitCommentEvent(page.spaceId, page.id, {
      operation: 'commentResolved',
      pageId: page.id,
      comment: updated,
    });

    return updated;
  }
}
