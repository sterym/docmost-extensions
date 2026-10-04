import {
  InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { resolveComment } from "@/features/comment/services/comment-service";
import {
  IComment,
  IResolveComment,
} from "@/features/comment/types/comment.types";
import { RQ_KEY } from "@/features/comment/queries/comment-query";
import { IPagination } from "@/lib/types.ts";

export function useResolveCommentMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IComment, Error, IResolveComment>({
    mutationFn: (data) => resolveComment(data),
    onSuccess: (updatedComment, variables) => {
      const cache = queryClient.getQueryData(
        RQ_KEY(updatedComment.pageId),
      ) as InfiniteData<IPagination<IComment>> | undefined;

      if (cache) {
        queryClient.setQueryData(RQ_KEY(updatedComment.pageId), {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.map((comment) =>
              comment.id === updatedComment.id ? updatedComment : comment,
            ),
          })),
        });
      }

      notifications.show({
        message: variables.resolved
          ? t("Comment resolved successfully")
          : t("Comment re-opened successfully"),
      });
    },
    onError: () => {
      notifications.show({
        message: t("Failed to resolve comment"),
        color: "red",
      });
    },
  });
}
