import { gql } from '@apollo/client/core';

// Fragments to reuse common field selections
const USER_FIELDS = gql`
  fragment UserFields on user {
    id
    display_name
    email
    role
  }
`;

const POST_FIELDS = gql`
  fragment PostFields on post {
    id
    content
    status
    created_at
    author {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

// Query for the main dashboard view
export const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($userId: uuid!) {
    # Get the 5 most recent discussions
    recentDiscussions: discussion(order_by: { created_at: desc }, limit: 5) {
      id
      title
      description
      created_at
      creator: user {
        ...UserFields
      }
    }

    # Get the current user's drafts
    myDrafts: post(
      where: { author_id: { _eq: $userId }, status: { _eq: "draft" } }
      order_by: { updated_at: desc }
    ) {
      id
      draft_content
      discussion_id
      updated_at
    }

    # Pinned threads would require a separate table, e.g., user_pinned_discussion
    # For now, this is a placeholder.
  }
  ${USER_FIELDS}
`;

// Query to get the details of a single discussion and its approved posts
export const GET_DISCUSSION_DETAILS = gql`
  query GetDiscussionDetails($discussionId: uuid!) {
    discussion_by_pk(id: $discussionId) {
      id
      title
      description
      created_at
      creator: user {
        ...UserFields
      }
      posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
        ...PostFields
      }
    }
  }
  ${USER_FIELDS}
  ${POST_FIELDS}
`;

// Mutation to create a new discussion
export const CREATE_DISCUSSION = gql`
  mutation CreateDiscussion($title: String!, $description: String, $userId: uuid!) {
    insert_discussion_one(object: { title: $title, description: $description, created_by: $userId }) {
      id
      title
    }
  }
`;

// Mutation to create a new post (as a draft)
export const CREATE_POST_DRAFT = gql`
  mutation CreatePostDraft($discussionId: uuid!, $authorId: uuid!, $draftContent: String!) {
    insert_post_one(
      object: {
        discussion_id: $discussionId
        author_id: $authorId
        draft_content: $draftContent
        status: "draft"
      }
    ) {
      id
    }
  }
`;

// Mutation to publish a draft
export const PUBLISH_POST = gql`
  mutation PublishPost($postId: uuid!) {
    update_post_by_pk(
      pk_columns: { id: $postId }
      _set: {
        status: "pending" # Or "approved" if you don't have a review step
        content: draft_content # Copies draft content to final content
        draft_content: ""
      }
    ) {
      id
      status
    }
  }
`;

/*
NOTE ON METRICS (Good-Faith Rate, Source Accuracy, Reputation Score):
Calculating these percentages and scores directly on the client is inefficient.
The best practice is to create database VIEWS or FUNCTIONS in Hasura/Nhost
that perform these aggregations on the server. You can then query these views
as if they were tables.

For example, a view `user_stats` could provide these metrics per user:

CREATE VIEW user_stats AS
SELECT
  u.id AS user_id,
  -- Good-Faith Rate
  COALESCE(SUM(CASE WHEN ml.is_good_faith THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(ml.id), 0), 0) AS good_faith_rate,
  -- Source Accuracy
  COALESCE(SUM(CASE WHEN ps.is_valid AND ps.is_relevant THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(ps.id), 0), 0) AS source_accuracy
FROM
  "user" u
LEFT JOIN post p ON u.id = p.author_id
LEFT JOIN moderation_log ml ON p.id = ml.post_id
LEFT JOIN post_source ps ON p.id = ps.post_id
GROUP BY
  u.id;

You could then query this view easily:
query GetUserStats($userId: uuid!) {
  user_stats_by_pk(user_id: $userId) {
    good_faith_rate
    source_accuracy
    # Reputation score would be another calculated column
  }
}
*/