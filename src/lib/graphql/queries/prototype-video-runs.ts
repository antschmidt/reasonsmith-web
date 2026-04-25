import { gql } from '@apollo/client/core';

// ============================================
// Prototype — Video-Anchored Analysis Runs
//
// These power the saved-runs panel on the
// /prototype/featured-video-anchored page. Each row is one user's
// aligned analysis of a YouTube video; dedup is enforced per
// (creator, video_id) via a unique constraint.
// ============================================

export const LIST_PROTOTYPE_VIDEO_RUNS = gql`
	query ListPrototypeVideoRuns {
		prototype_video_anchored_run(order_by: { updated_at: desc }) {
			id
			video_id
			title
			meta
			stats
			model_used
			input_tokens
			output_tokens
			estimated_cost_cents
			flattened_chars
			created_at
			updated_at
		}
	}
`;

/**
 * Full row including the heavy `analysis` + `annotated` blobs. Use
 * when loading a saved run back into the prototype; keep LIST_* for
 * the summary panel so list rendering stays light.
 */
export const GET_PROTOTYPE_VIDEO_RUN = gql`
	query GetPrototypeVideoRun($id: uuid!) {
		prototype_video_anchored_run_by_pk(id: $id) {
			id
			video_id
			title
			meta
			analysis
			annotated
			stats
			model_used
			input_tokens
			output_tokens
			estimated_cost_cents
			flattened_chars
			created_at
			updated_at
		}
	}
`;

/**
 * Upsert a run. `on_conflict` targets the (creator, video_id) unique
 * index so the second save for the same video replaces the first.
 * Hasura fills in `creator` from the X-Hasura-User-Id session
 * variable via the insert permission check; we include it here so
 * the client can provide it explicitly in variables.
 */
export const UPSERT_PROTOTYPE_VIDEO_RUN = gql`
	mutation UpsertPrototypeVideoRun(
		$creator: uuid!
		$video_id: String!
		$title: String!
		$meta: String!
		$analysis: jsonb!
		$annotated: jsonb!
		$stats: jsonb
		$model_used: String
		$input_tokens: Int
		$output_tokens: Int
		$estimated_cost_cents: numeric
		$flattened_chars: Int
	) {
		insert_prototype_video_anchored_run_one(
			object: {
				creator: $creator
				video_id: $video_id
				title: $title
				meta: $meta
				analysis: $analysis
				annotated: $annotated
				stats: $stats
				model_used: $model_used
				input_tokens: $input_tokens
				output_tokens: $output_tokens
				estimated_cost_cents: $estimated_cost_cents
				flattened_chars: $flattened_chars
			}
			on_conflict: {
				constraint: prototype_video_anchored_run_creator_video_unique
				update_columns: [
					title
					meta
					analysis
					annotated
					stats
					model_used
					input_tokens
					output_tokens
					estimated_cost_cents
					flattened_chars
				]
			}
		) {
			id
			video_id
			title
			meta
			stats
			created_at
			updated_at
		}
	}
`;

export const DELETE_PROTOTYPE_VIDEO_RUN = gql`
	mutation DeletePrototypeVideoRun($id: uuid!) {
		delete_prototype_video_anchored_run_by_pk(id: $id) {
			id
		}
	}
`;

/**
 * Delete every run for the signed-in user. The Hasura delete
 * permission is already scoped to creator = X-Hasura-User-Id so a
 * blank filter here is safe — it only touches the caller's rows.
 */
export const DELETE_ALL_PROTOTYPE_VIDEO_RUNS = gql`
	mutation DeleteAllPrototypeVideoRuns {
		delete_prototype_video_anchored_run(where: {}) {
			affected_rows
		}
	}
`;
