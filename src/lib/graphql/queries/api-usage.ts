import { gql } from '@apollo/client/core';

// ============================================
// API Usage Queries
// For tracking Claude/OpenAI token usage per user
// ============================================

// Get a user's API usage summary (aggregated stats)
export const GET_MY_API_USAGE_SUMMARY = gql`
	query GetMyApiUsageSummary($contributorId: uuid!) {
		api_usage_summary(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { last_used_at: desc }
		) {
			id
			contributor_id
			endpoint
			provider
			model
			total_input_tokens
			total_output_tokens
			total_tokens
			request_count
			first_used_at
			last_used_at
		}
	}
`;

// Get a user's detailed API usage logs (individual requests)
export const GET_MY_API_USAGE_LOGS = gql`
	query GetMyApiUsageLogs($contributorId: uuid!, $limit: Int = 50, $offset: Int = 0) {
		api_usage_log(
			where: { contributor_id: { _eq: $contributorId } }
			order_by: { created_at: desc }
			limit: $limit
			offset: $offset
		) {
			id
			contributor_id
			endpoint
			provider
			model
			input_tokens
			output_tokens
			total_tokens
			created_at
		}
		api_usage_log_aggregate(where: { contributor_id: { _eq: $contributorId } }) {
			aggregate {
				count
			}
		}
	}
`;

// Get total token usage for a user (all endpoints combined)
export const GET_MY_TOTAL_TOKEN_USAGE = gql`
	query GetMyTotalTokenUsage($contributorId: uuid!) {
		api_usage_summary_aggregate(where: { contributor_id: { _eq: $contributorId } }) {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
	}
`;

// Admin: Get all API usage summaries (for slartibartfast role)
export const GET_ALL_API_USAGE_SUMMARIES = gql`
	query GetAllApiUsageSummaries($limit: Int = 100, $offset: Int = 0) {
		api_usage_summary(order_by: { last_used_at: desc }, limit: $limit, offset: $offset) {
			id
			contributor_id
			endpoint
			provider
			model
			total_input_tokens
			total_output_tokens
			total_tokens
			request_count
			first_used_at
			last_used_at
			contributor {
				id
				display_name
				avatar_url
			}
		}
		api_usage_summary_aggregate {
			aggregate {
				count
			}
		}
	}
`;

// Admin: Get platform-wide token usage totals
export const GET_PLATFORM_TOKEN_USAGE = gql`
	query GetPlatformTokenUsage {
		api_usage_summary_aggregate {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
	}
`;

// Admin: Get usage breakdown by endpoint
export const GET_USAGE_BY_ENDPOINT = gql`
	query GetUsageByEndpoint {
		goodFaithClaude: api_usage_summary_aggregate(
			where: { endpoint: { _eq: "goodFaithClaude" } }
		) {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
		goodFaithClaudeFeatured: api_usage_summary_aggregate(
			where: { endpoint: { _eq: "goodFaithClaudeFeatured" } }
		) {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
	}
`;

// Admin: Get usage breakdown by provider
export const GET_USAGE_BY_PROVIDER = gql`
	query GetUsageByProvider {
		claude: api_usage_summary_aggregate(where: { provider: { _eq: "claude" } }) {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
		openai: api_usage_summary_aggregate(where: { provider: { _eq: "openai" } }) {
			aggregate {
				sum {
					total_input_tokens
					total_output_tokens
					total_tokens
					request_count
				}
			}
		}
	}
`;

// Admin: Get top users by token usage
export const GET_TOP_USERS_BY_USAGE = gql`
	query GetTopUsersByUsage($limit: Int = 10) {
		api_usage_summary(
			order_by: { total_tokens: desc }
			limit: $limit
			distinct_on: contributor_id
		) {
			contributor_id
			contributor {
				id
				display_name
				avatar_url
			}
		}
	}
`;
