import type { NhostClient } from '@nhost/nhost-js';

export type DraftPublishOptions = {
	draft: any;
	discussion: any;
	userId: string;
	goodFaithResult: any;
	canPublish: boolean;
	analyzeFunction?: () => Promise<any>;
	graphqlRequest: (query: string, variables?: any) => Promise<any>;
};

/**
 * Publishes a draft discussion
 * Handles the complex workflow of:
 * 1. Running analysis if needed
 * 2. Checking for existing comments on current published version
 * 3. Archiving old published version
 * 4. Publishing the new draft
 *
 * @param options - Publishing configuration
 * @returns Success status and any error
 */
export async function publishDraft(
	options: DraftPublishOptions
): Promise<{ success: boolean; error?: string }> {
	const { draft, discussion, goodFaithResult, canPublish, analyzeFunction, graphqlRequest } =
		options;

	try {
		// Step 1: Ensure we have valid good faith analysis
		let analysisData = null;

		if (canPublish) {
			// Use existing analysis
			console.log('Using existing good faith analysis (newer than draft)');
			analysisData = {
				score: goodFaithResult.good_faith_score,
				label: goodFaithResult.good_faith_label,
				analysis: goodFaithResult
			};
		} else if (analyzeFunction) {
			// Need to run new analysis
			console.log('Running new good faith analysis for publish');
			analysisData = await analyzeFunction();

			if (!analysisData) {
				return {
					success: false,
					error: 'Could not verify good-faith score. Cannot publish discussion.'
				};
			}
		} else {
			return {
				success: false,
				error: 'Analysis required but no analysis function provided'
			};
		}

		// Step 2: Check for existing published version and its comments
		const commentsCheck = await graphqlRequest(
			`
			query CheckVersionComments($discussionId: uuid!) {
				discussion_version(
					where: {
						discussion_id: { _eq: $discussionId }
						version_type: { _eq: "published" }
					}
				) {
					id
					version_number
				}
				post_aggregate(
					where: {
						discussion_id: { _eq: $discussionId }
						context_version_id: { _is_null: false }
					}
				) {
					aggregate {
						count
					}
					nodes {
						context_version_id
					}
				}
			}
		`,
			{ discussionId: discussion.id }
		);

		if (commentsCheck.error) {
			console.error('Comments check GraphQL error:', commentsCheck.error);
			throw new Error(`Failed to check for comments: ${JSON.stringify(commentsCheck.error)}`);
		}

		const currentPublished = commentsCheck.data?.discussion_version?.[0];
		const allPosts = commentsCheck.data?.post_aggregate?.nodes || [];

		console.log('Comments check result:', {
			currentPublished,
			allPostsCount: allPosts.length,
			allPosts
		});

		// Check if current published version has comments on it specifically
		const commentsOnCurrentVersion = allPosts.filter(
			(post: any) => post.context_version_id === currentPublished?.id
		).length;

		console.log('Publishing analysis:', {
			currentPublishedId: currentPublished?.id,
			commentsOnCurrentVersion,
			hasComments: commentsOnCurrentVersion > 0
		});

		// Step 3: Archive existing published version if it exists
		if (currentPublished) {
			console.log(
				commentsOnCurrentVersion > 0
					? `Archiving version with ${commentsOnCurrentVersion} comments`
					: 'Archiving published version without comments'
			);

			const archiveResult = await graphqlRequest(
				`
				mutation ArchiveVersion($versionId: uuid!) {
					update_discussion_version_by_pk(
						pk_columns: { id: $versionId }
						_set: { version_type: "archived" }
					) {
						id
						version_type
					}
				}
			`,
				{ versionId: currentPublished.id }
			);

			if (archiveResult.error) {
				console.error('Archive version GraphQL error:', archiveResult.error);
				throw new Error(
					`Failed to archive existing version: ${JSON.stringify(archiveResult.error)}`
				);
			}

			if (!archiveResult.data?.update_discussion_version_by_pk) {
				console.error('Archive operation returned no data, likely permissions issue');
				throw new Error(
					'Archive operation failed - likely insufficient permissions to update published versions'
				);
			}

			console.log('Successfully archived published version:', currentPublished.id);
		}

		// Step 4: Verify no published version exists before publishing
		const verifyCheck = await graphqlRequest(
			`
			query VerifyNoPublished($discussionId: uuid!) {
				discussion_version(
					where: {
						discussion_id: { _eq: $discussionId }
						version_type: { _eq: "published" }
					}
				) {
					id
					version_number
					version_type
				}
			}
		`,
			{ discussionId: discussion.id }
		);

		const remainingPublished = verifyCheck.data?.discussion_version || [];
		console.log('Verification before publish:', {
			remainingPublished,
			shouldBeEmpty: remainingPublished.length === 0
		});

		// Step 5: Publish the draft
		const result = await graphqlRequest(
			`
			mutation PublishDraft($draftId: uuid!) {
				update_discussion_version_by_pk(
					pk_columns: { id: $draftId }
					_set: {
						version_type: "published"
					}
				) {
					id
					version_type
				}
			}
		`,
			{ draftId: draft.id }
		);

		if (result.error) {
			console.error('Publish draft GraphQL error:', result.error);
			throw new Error(`Failed to publish draft: ${JSON.stringify(result.error)}`);
		}

		return { success: true };
	} catch (err: any) {
		console.error('Error publishing draft:', err);
		return {
			success: false,
			error: err.message || 'Failed to publish draft'
		};
	}
}
