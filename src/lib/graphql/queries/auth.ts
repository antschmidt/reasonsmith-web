import { gql } from '@apollo/client/core';
import { SECURITY_KEY_FIELDS } from '../fragments';

// ============================================
// Security Keys (WebAuthn) Queries
// ============================================

export const GET_USER_SECURITY_KEYS = gql`
	query GetUserSecurityKeys($userId: uuid!) {
		authUserSecurityKeys(where: { userId: { _eq: $userId } }) {
			...SecurityKeyFields
		}
	}
	${SECURITY_KEY_FIELDS}
`;

// ============================================
// Security Keys Mutations
// ============================================

export const DELETE_SECURITY_KEY = gql`
	mutation DeleteSecurityKey($id: uuid!) {
		deleteAuthUserSecurityKey(id: $id) {
			id
		}
	}
`;

// ============================================
// Subscription Plans
// ============================================

export const GET_SUBSCRIPTION_PLANS = gql`
	query GetSubscriptionPlans {
		subscription_plan(order_by: { price_monthly: asc }) {
			id
			name
			price_monthly
			features
			display_name
			description
		}
	}
`;
