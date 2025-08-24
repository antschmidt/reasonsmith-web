import { gql } from '@apollo/client/core';

// Fragments to reuse common field selections
const CONTRIBUTOR_FIELDS = gql`
  fragment ContributorFields on contributor {
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
  good_faith_score
  good_faith_label
  good_faith_last_evaluated
    contributor {
      ...ContributorFields
    }
  }
  ${CONTRIBUTOR_FIELDS}
`;

// Query for the main dashboard view
export const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($userId: uuid!) {
    # Discussions created by the user
    myDiscussions: discussion(where: { created_by: { _eq: $userId } }, order_by: { created_at: desc }, limit: 10) {
      id
      title
      description
      created_at
      contributor {
        ...ContributorFields
      }
    }

    # Discussions the user has replied to (exclude those created by the user)
    repliedDiscussions: discussion(
      where: { created_by: { _neq: $userId }, posts: { author_id: { _eq: $userId } } }
      order_by: { created_at: desc }
      limit: 10
    ) {
      id
      title
      description
      created_at
      contributor {
        ...ContributorFields
      }
    }

    # Get the current user's drafts; include related discussion title for reply drafts
    myDrafts: post(
      where: { author_id: { _eq: $userId }, status: { _in: ["draft", "pending"] } }
      order_by: { updated_at: desc }
    ) {
      id
      draft_content
      discussion_id
      status
      updated_at
      discussion { id title }
    }
  }
  ${CONTRIBUTOR_FIELDS}
`;

// Query to get the details of a single discussion and its approved posts
export const GET_DISCUSSION_DETAILS = gql`
  query GetDiscussionDetails($discussionId: uuid!) {
    discussion_by_pk(id: $discussionId) {
      id
      title
      description
      created_at
      contributor {
        ...ContributorFields
      }
      posts(where: { status: { _eq: "approved" } }, order_by: { created_at: asc }) {
        ...PostFields
      }
    }
  }
  ${CONTRIBUTOR_FIELDS}
  ${POST_FIELDS}
`;

// Mutation to create a new discussion (created_by should be set by client or preset)
export const CREATE_DISCUSSION = gql`
  mutation CreateDiscussion($title: String!, $description: String, $createdBy: uuid!) {
    insert_discussion_one(
      object: { title: $title, description: $description, created_by: $createdBy }
    ) {
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
        status: "pending"
        content: draft_content
        draft_content: ""
      }
    ) {
      id
      status
      content
      created_at
      good_faith_score
      good_faith_label
      good_faith_last_evaluated
      contributor { id display_name email role }
    }
  }
`;

// Mutation to update draft content (autosave)
export const UPDATE_POST_DRAFT = gql`
  mutation UpdatePostDraft($postId: uuid!, $draftContent: String!) {
    update_post_by_pk(pk_columns: { id: $postId }, _set: { draft_content: $draftContent }) {
      id
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