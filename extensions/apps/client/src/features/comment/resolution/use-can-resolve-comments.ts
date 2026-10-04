/**
 * Comment resolution is always available in this build. The server endpoint
 * is provided by our own CommentResolutionModule and the server still checks
 * that the user may comment on the page.
 */
export function useCanResolveComments(): boolean {
  return true;
}
