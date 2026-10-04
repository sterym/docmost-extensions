import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCircleCheck, IconCircleCheckFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Editor } from "@tiptap/react";
import { isEditorReady } from "@docmost/editor-ext";
import { useResolveCommentMutation } from "./use-resolve-comment-mutation";

interface ResolveCommentButtonProps {
  editor: Editor | null;
  commentId: string;
  pageId: string;
  resolvedAt?: Date | string | null;
}

export default function ResolveCommentButton({
  editor,
  commentId,
  pageId,
  resolvedAt,
}: ResolveCommentButtonProps) {
  const { t } = useTranslation();
  const resolveCommentMutation = useResolveCommentMutation();
  const isResolved = resolvedAt != null;
  const label = isResolved ? t("Re-open comment") : t("Resolve comment");

  const toggle = async () => {
    try {
      await resolveCommentMutation.mutateAsync({
        commentId,
        pageId,
        resolved: !isResolved,
      });
      if (isEditorReady(editor)) {
        editor.commands.setCommentResolved(commentId, !isResolved);
      }
    } catch (error) {
      console.error("Failed to toggle resolved state:", error);
    }
  };

  return (
    <Tooltip label={label} position="top" withArrow>
      <ActionIcon
        variant="subtle"
        color={isResolved ? "green" : "gray"}
        size="sm"
        aria-label={label}
        loading={resolveCommentMutation.isPending}
        onClick={toggle}
      >
        {isResolved ? (
          <IconCircleCheckFilled size={18} />
        ) : (
          <IconCircleCheck size={18} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}
