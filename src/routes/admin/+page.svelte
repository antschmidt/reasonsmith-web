<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		UPDATE_CONTRIBUTOR_ANALYSIS_SETTINGS,
		RESET_ANALYSIS_USAGE,
		UPDATE_CONTRIBUTOR_ROLE
	} from '$lib/graphql/queries';
	import { refreshUserRole, debugAdminRequest } from '$lib/nhostClient';

	type Contributor = {
		id: string;
		handle: string;
		display_name: string;
		email: string;
		role: string;
		analysis_enabled: boolean;
		analysis_limit: number | null;
		analysis_count_used: number;
		analysis_count_reset_at: string;
	};

	let user = nhost.auth.getUser();
	let hasAccess = false;
	let currentUserRole = 'user';
	let isAdmin = false;
	let contributors: Contributor[] = [];
	let loading = false;
	let saving = false;
	let error: string | null = null;
	let success: string | null = null;

	const GET_ALL_CONTRIBUTORS = `
    query GetAllContributors {
      contributor(order_by: { display_name: asc }) {
        id
        handle
        display_name
        email
        role
        analysis_enabled
        analysis_limit
        analysis_count_used
        analysis_count_reset_at
      }
    }
  `;

	function collectRoles(u: any): string[] {
		if (!u) return [];
		const roles = new Set<string>();
		const direct = (u as any).roles;
		if (Array.isArray(direct)) direct.forEach((r) => typeof r === 'string' && roles.add(r));
		const defaultRole = (u as any).defaultRole ?? (u as any).default_role;
		if (typeof defaultRole === 'string') roles.add(defaultRole);
		const metadataRoles = (u as any).metadata?.roles;
		if (Array.isArray(metadataRoles))
			metadataRoles.forEach((r: any) => typeof r === 'string' && roles.add(r));
		const appMetadataRoles = (u as any).app_metadata?.roles;
		if (Array.isArray(appMetadataRoles))
			appMetadataRoles.forEach((r: any) => typeof r === 'string' && roles.add(r));
		const userRole = (u as any).role;
		if (typeof userRole === 'string') roles.add(userRole);
		return Array.from(roles);
	}

	async function checkAccess() {
		try {
			await nhost.auth.isAuthenticatedAsync();
		} catch {}
		user = nhost.auth.getUser();

		if (!user) {
			hasAccess = false;
			return;
		}

		// First check if user has authenticated 'me' role
		const roles = collectRoles(user);
		if (!roles.includes('me')) {
			hasAccess = false;
			return;
		}

		// Get current user's role from contributor table for admin permissions
		try {
			const result = await nhost.graphql.request(
				`
        query GetCurrentUserRole($userId: uuid!) {
          contributor_by_pk(id: $userId) {
            role
          }
        }
      `,
				{ userId: user.id }
			);

			currentUserRole = result.data?.contributor_by_pk?.role || 'user';
			isAdmin = currentUserRole === 'admin';
			hasAccess = ['admin', 'slartibartfast'].includes(currentUserRole);
		} catch (err) {
			console.error('Failed to get user role:', err);
			hasAccess = false;
		}
	}

	async function loadContributors() {
		if (!hasAccess) return;

		loading = true;
		error = null;

		try {
			const result = await nhost.graphql.request(GET_ALL_CONTRIBUTORS);

			if (result.error) {
				throw new Error(result.error.message);
			}

			contributors = result.data?.contributor || [];
		} catch (err: any) {
			error = err.message || 'Failed to load contributors';
			console.error('Error loading contributors:', err);
		} finally {
			loading = false;
		}
	}

	async function updateAnalysisSettings(
		contributorId: string,
		analysisEnabled: boolean,
		analysisLimit: number | null
	) {
		saving = true;
		error = null;
		success = null;

		// Debug what role we're using
		debugAdminRequest('updateAnalysisSettings');

		try {
			const result = await nhost.graphql.request(UPDATE_CONTRIBUTOR_ANALYSIS_SETTINGS, {
				contributorId,
				analysisEnabled,
				analysisLimit
			});

			if (result.error) {
				throw new Error(result.error.message);
			}

			// Update local state
			contributors = contributors.map((c) =>
				c.id === contributorId
					? { ...c, analysis_enabled: analysisEnabled, analysis_limit: analysisLimit }
					: c
			);

			success = 'Analysis settings updated successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to update analysis settings';
			console.error('Error updating analysis settings:', err);
		} finally {
			saving = false;
		}
	}

	async function resetAnalysisCount(contributorId: string) {
		saving = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(RESET_ANALYSIS_USAGE, {
				contributorId
			});

			if (result.error) {
				throw new Error(result.error.message);
			}

			// Update local state
			contributors = contributors.map((c) =>
				c.id === contributorId
					? { ...c, analysis_count_used: 0, analysis_count_reset_at: new Date().toISOString() }
					: c
			);

			success = 'Analysis count reset successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to reset analysis count';
			console.error('Error resetting analysis count:', err);
		} finally {
			saving = false;
		}
	}

	async function updateUserRole(contributorId: string, newRole: string) {
		// Only admin can assign admin role
		if (!isAdmin && newRole === 'admin') {
			error = 'Only admin can assign admin roles';
			setTimeout(() => (error = null), 3000);
			return;
		}

		// Prevent users from changing their own role (except admin)
		if (contributorId === user?.id && !isAdmin) {
			error = 'You cannot change your own role';
			setTimeout(() => (error = null), 3000);
			return;
		}

		saving = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(UPDATE_CONTRIBUTOR_ROLE, {
				contributorId,
				role: newRole
			});

			if (result.error) {
				throw new Error(result.error.message);
			}

			// If we changed our own role, refresh the role headers
			if (contributorId === user?.id) {
				await refreshUserRole();
			}

			// Update local state
			contributors = contributors.map((c) =>
				c.id === contributorId ? { ...c, role: newRole } : c
			);

			success = `Role updated to ${newRole} successfully`;
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to update user role';
			console.error('Error updating user role:', err);
		} finally {
			saving = false;
		}
	}

	onMount(async () => {
		await checkAccess();
		if (hasAccess) {
			await loadContributors();
		}
	});
</script>

<svelte:head>
	<title>Admin - User Management</title>
</svelte:head>

<div class="admin-container">
	{#if !hasAccess}
		<div class="access-denied">
			<h1>Access Denied</h1>
			<p>You don't have permission to access this page.</p>
		</div>
	{:else}
		<header class="admin-header">
			<h1>User Management</h1>
			<p class="lead">Manage analysis permissions and usage limits for all users</p>
		</header>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		{#if success}
			<div class="success-message">{success}</div>
		{/if}

		{#if loading}
			<div class="loading">Loading contributors...</div>
		{:else}
			<div class="contributors-table">
				<table>
					<thead>
						<tr>
							<th>User</th>
							<th>Role</th>
							<th>Analysis Enabled</th>
							<th>Usage Limit</th>
							<th>Used / Reset</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each contributors as contributor (contributor.id)}
							<tr class="contributor-row">
								<td class="user-info">
									<div class="user-name">
										{contributor.display_name || contributor.handle || 'Unnamed'}
									</div>
									<div class="user-email">{contributor.email}</div>
								</td>
								<td>
									{#if isAdmin || (currentUserRole === 'slartibartfast' && !['admin'].includes(contributor.role))}
										<select
											class="role-select"
											value={contributor.role}
											disabled={saving || (contributor.id === user?.id && !isAdmin)}
											onchange={(e) => updateUserRole(contributor.id, e.currentTarget.value)}
										>
											<option value="user">User</option>
											<option value="slartibartfast">Site Manager</option>
											{#if isAdmin}
												<option value="admin">Root Admin</option>
											{/if}
										</select>
									{:else}
										<span class="role-badge role-{contributor.role}">{contributor.role}</span>
									{/if}
								</td>
								<td>
									<label class="toggle">
										<input
											type="checkbox"
											checked={contributor.analysis_enabled}
											disabled={saving || contributor.role === 'admin'}
											onchange={(e) =>
												updateAnalysisSettings(
													contributor.id,
													e.currentTarget.checked,
													contributor.analysis_limit
												)}
										/>
										<span class="toggle-slider"></span>
									</label>
								</td>
								<td>
									<input
										type="number"
										class="limit-input"
										value={contributor.analysis_limit || ''}
										placeholder="Unlimited"
										min="0"
										disabled={saving || contributor.role === 'me'}
										onblur={(e) => {
											const value = e.currentTarget.value ? parseInt(e.currentTarget.value) : null;
											updateAnalysisSettings(contributor.id, contributor.analysis_enabled, value);
										}}
									/>
								</td>
								<td class="usage-info">
									<div class="usage-count">
										{contributor.analysis_count_used}
										{#if contributor.analysis_limit}
											/ {contributor.analysis_limit}
										{/if}
									</div>
									<div class="reset-date">
										Reset: {new Date(contributor.analysis_count_reset_at).toLocaleDateString()}
									</div>
								</td>
								<td>
									<button
										class="btn-secondary reset-btn"
										disabled={saving || contributor.role === 'me'}
										onclick={() => resetAnalysisCount(contributor.id)}
									>
										Reset Count
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>

<style>
	.admin-container {
		max-width: 1200px;
		margin: 2rem auto;
		padding: 0 1.5rem 3rem;
	}

	.access-denied {
		text-align: center;
		padding: 4rem 2rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.admin-header {
		margin-bottom: 2rem;
		padding: 2rem;
		border-radius: 24px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.admin-header h1 {
		margin: 0;
		font-size: 2rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.lead {
		margin: 0.5rem 0 0;
		color: var(--color-text-secondary);
		font-size: 1.1rem;
		line-height: 1.6;
	}

	.error-message,
	.success-message {
		padding: 1rem 1.5rem;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		font-weight: 600;
	}

	.error-message {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		color: #ef4444;
	}

	.success-message {
		background: color-mix(in srgb, #10b981 15%, transparent);
		border: 1px solid color-mix(in srgb, #10b981 30%, transparent);
		color: #10b981;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
		font-size: 1.1rem;
	}

	.contributors-table {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	th {
		padding: 1rem 1.25rem;
		text-align: left;
		font-weight: 700;
		color: var(--color-text-primary);
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.contributor-row {
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		transition: background 0.2s ease;
	}

	.contributor-row:hover {
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	td {
		padding: 1.25rem;
		vertical-align: middle;
	}

	.user-info {
		min-width: 200px;
	}

	.user-name {
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
	}

	.user-email {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.role-badge {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.role-admin {
		background: linear-gradient(135deg, #9333ea, #c084fc);
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, #9333ea 30%, transparent);
	}

	.role-slartibartfast {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.role-user {
		background: color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
		color: var(--color-text-secondary);
	}

	.role-select {
		padding: 0.5rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		color: var(--color-text-primary);
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 0.2s ease;
		cursor: pointer;
	}

	.role-select:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	.role-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.toggle {
		position: relative;
		display: inline-block;
		width: 3rem;
		height: 1.5rem;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--color-text-secondary) 30%, transparent);
		transition: 0.3s;
		border-radius: 1.5rem;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 1.125rem;
		width: 1.125rem;
		left: 0.1875rem;
		bottom: 0.1875rem;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	input:checked + .toggle-slider {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
	}

	input:checked + .toggle-slider:before {
		transform: translateX(1.5rem);
	}

	input:disabled + .toggle-slider {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.limit-input {
		width: 100px;
		padding: 0.5rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		transition: all 0.3s ease;
	}

	.limit-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.usage-info {
		min-width: 120px;
	}

	.usage-count {
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
	}

	.reset-date {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		transition: all 0.3s ease;
	}

	.btn-secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		transform: translateY(-1px);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	@media (max-width: 768px) {
		.contributors-table {
			overflow-x: auto;
		}

		table {
			min-width: 700px;
		}

		.admin-container {
			padding: 0 1rem 3rem;
		}
	}
</style>
