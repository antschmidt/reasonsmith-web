import { nhost } from '$lib/nhostClient';
import { CHECK_POST_DELETABLE, DELETE_POST, CHECK_DISCUSSION_DELETABLE, DELETE_DISCUSSION } from '$lib/graphql/queries';

export interface DeletionCheckResult {
  canDelete: boolean;
  reason?: string;
}

export async function checkPostDeletable(
  postId: string,
  authorId: string, 
  discussionId: string,
  createdAt: string
): Promise<DeletionCheckResult> {
  try {
    const { data, error } = await nhost.graphql.request(CHECK_POST_DELETABLE, {
      authorId,
      discussionId,
      postCreatedAt: createdAt,
      postIdString: `%${postId}%` // Use LIKE pattern to find references
    });

    if (error) {
      throw error;
    }

    if (data.laterPosts && data.laterPosts.length > 0) {
      return {
        canDelete: false,
        reason: 'Other users have commented after this post'
      };
    }

    if (data.referencingPosts && data.referencingPosts.length > 0) {
      return {
        canDelete: false,
        reason: 'This post has been referenced by others'
      };
    }

    return { canDelete: true };
  } catch (error) {
    console.error('Error checking if post can be deleted:', error);
    return {
      canDelete: false,
      reason: 'Error checking deletion eligibility'
    };
  }
}

export async function checkDiscussionDeletable(
  discussionId: string,
  createdBy: string
): Promise<DeletionCheckResult> {
  try {
    const { data, error } = await nhost.graphql.request(CHECK_DISCUSSION_DELETABLE, {
      discussionId,
      createdBy,
      discussionIdString: `%${discussionId}%` // Use LIKE pattern to find references
    });

    if (error) {
      throw error;
    }

    if (data.otherUserPosts && data.otherUserPosts.length > 0) {
      return {
        canDelete: false,
        reason: 'Other users have commented on this discussion'
      };
    }

    if (data.referencingPosts && data.referencingPosts.length > 0) {
      return {
        canDelete: false,
        reason: 'This discussion has been referenced by others'
      };
    }

    return { canDelete: true };
  } catch (error) {
    console.error('Error checking if discussion can be deleted:', error);
    return {
      canDelete: false,
      reason: 'Error checking deletion eligibility'
    };
  }
}

export async function deletePost(postId: string): Promise<boolean> {
  try {
    const { error } = await nhost.graphql.request(DELETE_POST, { postId });
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    return false;
  }
}

export async function deleteDiscussion(discussionId: string, createdBy: string): Promise<boolean> {
  try {
    const { error } = await nhost.graphql.request(DELETE_DISCUSSION, { discussionId, createdBy });
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error deleting discussion:', error);
    return false;
  }
}

export function confirmDeletion(type: 'post' | 'discussion', title?: string): boolean {
  const itemName = type === 'post' ? 'comment' : 'discussion';
  const message = title 
    ? `Are you sure you want to delete this ${itemName} "${title}"?`
    : `Are you sure you want to delete this ${itemName}?`;
  
  return confirm(message);
}