<script lang="ts">
	import { onMount } from 'svelte';
	import { nhost } from '$lib/nhostClient';
	import {
		UPDATE_CONTRIBUTOR_ANALYSIS_SETTINGS,
		RESET_ANALYSIS_USAGE,
		UPDATE_CONTRIBUTOR_ROLE,
		SET_PURCHASED_CREDITS,
		ANONYMIZE_AND_DELETE_USER,
		GET_SITE_SETTING,
		UPDATE_SITE_SETTING,
		type PromptCacheTTL
	} from '$lib/graphql/queries';
	import { refreshUserRole, debugAdminRequest, debugCurrentRole } from '$lib/nhostClient';
	import { collectRoles } from '$lib/utils/authHelpers';

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
		monthly_credits_remaining: number | null;
		monthly_credits_reset_at: string | null;
		purchased_credits_total: number | null;
		purchased_credits_used: number | null;
		purchased_credits_remaining: number | null;
		subscription_tier: string | null;
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

	// Site settings state
	let promptCacheTTL: PromptCacheTTL = 'off';
	let loadingSettings = false;
	let savingSettings = false;

	const GET_ALL_CONTRIBUTORS = `
    query GetAllContributors {
      contributor(order_by: { display_name: asc }) {
        id
        handle
        display_name
        email
        auth_email
        role
        analysis_enabled
        analysis_limit
        analysis_count_used
        analysis_count_reset_at
        monthly_credits_remaining
        monthly_credits_reset_at
        purchased_credits_total
        purchased_credits_used
        purchased_credits_remaining
        subscription_tier
      }
    }
  `;

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
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to load contributors'
					: result.error.message || 'Failed to load contributors';
				throw new Error(errorMessage);
			}

			contributors = result.data?.contributor || [];
		} catch (err: any) {
			error = err.message || 'Failed to load contributors';
			console.error('Error loading contributors:', err);
		} finally {
			loading = false;
		}
	}

	async function loadSiteSettings() {
		if (!hasAccess) return;

		loadingSettings = true;

		try {
			const result = await nhost.graphql.request(GET_SITE_SETTING, {
				key: 'prompt_cache_ttl'
			});

			if (result.error) {
				console.error('Failed to load site settings:', result.error);
				return;
			}

			const setting = result.data?.site_settings_by_pk;
			if (setting?.value) {
				// Value is stored as JSON string, so parse it
				const value =
					typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value);
				promptCacheTTL = value.replace(/"/g, '') as PromptCacheTTL;
			}
		} catch (err: any) {
			console.error('Error loading site settings:', err);
		} finally {
			loadingSettings = false;
		}
	}

	async function updatePromptCacheTTL(newValue: PromptCacheTTL) {
		savingSettings = true;
		error = null;
		success = null;

		try {
			const result = await nhost.graphql.request(UPDATE_SITE_SETTING, {
				key: 'prompt_cache_ttl',
				value: newValue,
				updatedBy: user?.id
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to update setting'
					: result.error.message || 'Failed to update setting';
				throw new Error(errorMessage);
			}

			promptCacheTTL = newValue;
			success = `Prompt cache TTL updated to ${newValue === 'off' ? 'disabled' : newValue}`;
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to update prompt cache TTL';
			console.error('Error updating prompt cache TTL:', err);
		} finally {
			savingSettings = false;
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
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to load contributors'
					: result.error.message || 'Failed to load contributors';
				throw new Error(errorMessage);
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
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to load contributors'
					: result.error.message || 'Failed to load contributors';
				throw new Error(errorMessage);
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

	async function updatePurchasedCredits(contributorId: string, remainingCredits: number) {
		saving = true;
		error = null;
		success = null;

		try {
			// Get the current contributor to calculate the new total
			const currentContributor = contributors.find((c) => c.id === contributorId);
			if (!currentContributor) {
				throw new Error('Contributor not found');
			}

			const currentUsed = currentContributor.purchased_credits_used ?? 0;

			// Calculate new total: used + remaining
			const newTotal = currentUsed + remainingCredits;

			const result = await nhost.graphql.request(SET_PURCHASED_CREDITS, {
				contributorId,
				totalCredits: newTotal,
				usedCredits: currentUsed
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to update purchased credits'
					: result.error.message || 'Failed to update purchased credits';
				throw new Error(errorMessage);
			}

			// Update local state
			contributors = contributors.map((c) =>
				c.id === contributorId
					? {
							...c,
							purchased_credits_remaining: remainingCredits,
							purchased_credits_total: newTotal
						}
					: c
			);

			success = 'Purchased credits updated successfully';
			setTimeout(() => (success = null), 3000);
		} catch (err: any) {
			error = err.message || 'Failed to update purchased credits';
			console.error('Error updating purchased credits:', err);
		} finally {
			saving = false;
		}
	}

	async function deleteUser(contributorId: string, contributorName: string) {
		// Only admin can delete users
		if (!isAdmin) {
			error = 'Only admin can delete users';
			setTimeout(() => (error = null), 3000);
			return;
		}

		// Prevent admin from deleting themselves
		if (contributorId === user?.id) {
			error = 'You cannot delete your own account';
			setTimeout(() => (error = null), 3000);
			return;
		}

		// Confirm deletion
		const confirmed = confirm(
			`Are you sure you want to delete ${contributorName}?\n\n` +
				`This will:\n` +
				`• Anonymize all their discussions and posts\n` +
				`• Delete their contributor profile\n` +
				`• This action CANNOT be undone`
		);

		if (!confirmed) return;

		saving = true;
		error = null;
		success = null;

		try {
			// Debug: Check current role before mutation
			console.log('[deleteUser] Checking role before mutation:');
			debugCurrentRole();

			// Force role refresh to ensure we have admin role
			console.log('[deleteUser] Forcing role refresh...');
			await refreshUserRole();

			// Debug: Check role after refresh
			console.log('[deleteUser] Checking role after refresh:');
			debugCurrentRole();

			// Debug: Log mutation details
			console.log('[deleteUser] Calling mutation with:', {
				mutation: ANONYMIZE_AND_DELETE_USER,
				variables: { userId: contributorId },
				currentRole: window.sessionStorage.getItem('userActualRole')
			});

			const result = await nhost.graphql.request(ANONYMIZE_AND_DELETE_USER, {
				userId: contributorId
			});

			console.log('[deleteUser] Mutation result:', result);

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to delete user'
					: result.error.message || 'Failed to delete user';
				throw new Error(errorMessage);
			}

			// Remove from local state
			contributors = contributors.filter((c) => c.id !== contributorId);

			success = `User ${contributorName} deleted successfully. All their content has been anonymized.`;
			setTimeout(() => (success = null), 5000);
		} catch (err: any) {
			error = err.message || 'Failed to delete user';
			console.error('Error deleting user:', err);
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
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to load contributors'
					: result.error.message || 'Failed to load contributors';
				throw new Error(errorMessage);
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
			await Promise.all([loadContributors(), loadSiteSettings()]);
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
			<h1>Admin Dashboard</h1>
			<p class="lead">Manage site settings, users, and system configuration</p>
		</header>

		<!-- Site Settings Section -->
		<section class="settings-section">
			<h2>Site Settings</h2>
			<div class="settings-grid">
				<div class="setting-card">
					<div class="setting-header">
						<h3>Claude Prompt Cache</h3>
						<p class="setting-description">
							Cache the system prompt to reduce API costs. Higher TTL = more savings but slower
							prompt updates.
						</p>
					</div>
					<div class="setting-control">
						{#if loadingSettings}
							<span class="loading-text">Loading...</span>
						{:else}
							<div class="ttl-options">
								<button
									class="ttl-btn"
									class:active={promptCacheTTL === 'off'}
									disabled={savingSettings}
									onclick={() => updatePromptCacheTTL('off')}
								>
									Off
								</button>
								<button
									class="ttl-btn"
									class:active={promptCacheTTL === '5m'}
									disabled={savingSettings}
									onclick={() => updatePromptCacheTTL('5m')}
								>
									5 min
								</button>
								<button
									class="ttl-btn"
									class:active={promptCacheTTL === '1h'}
									disabled={savingSettings}
									onclick={() => updatePromptCacheTTL('1h')}
								>
									1 hour
								</button>
							</div>
							<p class="setting-hint">
								{#if promptCacheTTL === 'off'}
									Caching disabled - each request sends full system prompt
								{:else if promptCacheTTL === '5m'}
									Cache expires after 5 minutes of inactivity
								{:else}
									Cache expires after 1 hour of inactivity (best for high traffic)
								{/if}
							</p>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- User Management Section -->
		<section class="users-section">
			<h2>User Management</h2>

			{#if loading}
				<div class="loading">Loading contributors...</div>
			{:else}
				<div class="contributors-table">
					<table class="users-table">
						<thead>
							<tr>
								<th>User</th>
								<th>Role</th>
								<th>Subscription</th>
								<th>Monthly Credits</th>
								<th>Purchased Credits</th>
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
											{contributor.display_name ||
												contributor.handle ||
												contributor.auth_email ||
												'Unnamed'}
										</div>
										{#if contributor.display_name || contributor.handle}
											<div class="user-email">{contributor.auth_email}</div>
										{/if}
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
										<span class="subscription-badge tier-{contributor.subscription_tier || 'free'}">
											{contributor.subscription_tier || 'free'}
										</span>
									</td>
									<td class="credits-info">
										<div class="credits-count">
											{contributor.monthly_credits_remaining ?? 0}
										</div>
										{#if contributor.monthly_credits_reset_at}
											<div class="reset-date">
												Reset: {new Date(contributor.monthly_credits_reset_at).toLocaleDateString()}
											</div>
										{/if}
									</td>
									<td class="credits-info">
										<div class="credits-edit-container">
											<label class="credits-label">Remaining:</label>
											<input
												type="number"
												class="credits-input"
												value={contributor.purchased_credits_remaining ?? 0}
												min="0"
												disabled={saving}
												onblur={(e) => {
													const remaining = parseInt(e.currentTarget.value) || 0;
													updatePurchasedCredits(contributor.id, remaining);
												}}
											/>
										</div>
										<div class="reset-date">
											Total: {contributor.purchased_credits_total ?? 0} / Used: {contributor.purchased_credits_used ??
												0}
										</div>
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
												const value = e.currentTarget.value
													? parseInt(e.currentTarget.value)
													: null;
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
										<div class="action-buttons">
											<button
												class="btn-secondary reset-btn"
												disabled={saving || contributor.role === 'me'}
												onclick={() => resetAnalysisCount(contributor.id)}
												title="Reset analysis count"
											>
												Reset Count
											</button>
											{#if isAdmin && contributor.id !== user?.id}
												<button
													class="btn-danger delete-btn"
													disabled={saving}
													onclick={() =>
														deleteUser(
															contributor.id,
															contributor.display_name || contributor.handle || contributor.email
														)}
													title="Delete user and anonymize their content"
												>
													Delete User
												</button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>

<!-- Toast notifications -->
{#if error}
	<div class="toast toast-error">
		<div class="toast-content">
			<span class="toast-icon">⚠️</span>
			<span class="toast-message">{error}</span>
		</div>
	</div>
{/if}

{#if success}
	<div class="toast toast-success">
		<div class="toast-content">
			<span class="toast-icon">✓</span>
			<span class="toast-message">{success}</span>
		</div>
	</div>
{/if}

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
		border-radius: var(--border-radius-xl);
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.admin-header {
		margin-bottom: 2rem;
		padding: 2rem;
		border-radius: var(--border-radius-xl);
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

	/* Settings Section */
	.settings-section,
	.users-section {
		margin-bottom: 2rem;
	}

	.settings-section h2,
	.users-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 1rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.setting-card {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.5rem;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.setting-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.setting-description {
		margin: 0 0 1rem 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.setting-control {
		margin-top: 1rem;
	}

	.loading-text {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.ttl-options {
		display: flex;
		gap: 0.5rem;
	}

	.ttl-btn {
		flex: 1;
		padding: 0.6rem 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.ttl-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
		color: var(--color-text-primary);
	}

	.ttl-btn.active {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		border-color: transparent;
		color: white;
		font-weight: 600;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.ttl-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.setting-hint {
		margin: 0.75rem 0 0 0;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Toast notifications */
	.toast {
		position: fixed;
		top: 2rem;
		right: 2rem;
		z-index: 1000;
		min-width: 300px;
		max-width: 500px;
		padding: 1rem 1.5rem;
		border-radius: var(--border-radius-md);
		font-weight: 600;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		animation: slideIn 0.3s ease-out;
		backdrop-filter: blur(20px);
	}

	@keyframes slideIn {
		from {
			transform: translateX(120%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.toast-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.toast-icon {
		font-size: 1.25rem;
		line-height: 1;
	}

	.toast-message {
		flex: 1;
	}

	.toast-error {
		background: color-mix(in srgb, #ef4444 20%, var(--color-surface));
		border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
		color: #ef4444;
	}

	.toast-success {
		background: color-mix(in srgb, #10b981 20%, var(--color-surface));
		border: 1px solid color-mix(in srgb, #10b981 40%, transparent);
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
		border-radius: var(--border-radius-xl);
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	thead {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
	}

	th {
		padding: 1rem 1.25rem;
		text-align: left;
		font-weight: 700;
		color: var(--color-text-primary);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	th:nth-child(1) {
		width: 18%;
	} /* User */
	th:nth-child(2) {
		width: 10%;
	} /* Role */
	th:nth-child(3) {
		width: 9%;
	} /* Subscription */
	th:nth-child(4) {
		width: 11%;
	} /* Monthly Credits */
	th:nth-child(5) {
		width: 13%;
	} /* Purchased Credits */
	th:nth-child(6) {
		width: 9%;
	} /* Analysis Enabled */
	th:nth-child(7) {
		width: 9%;
	} /* Usage Limit */
	th:nth-child(8) {
		width: 11%;
	} /* Used / Reset */
	th:nth-child(9) {
		width: 10%;
	} /* Actions */

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
		overflow: hidden;
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
		border-radius: var(--border-radius-md);
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

	.subscription-badge {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		border-radius: var(--border-radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: capitalize;
		letter-spacing: 0.05em;
	}

	.tier-free {
		background: color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
		color: var(--color-text-secondary);
	}

	.tier-basic {
		background: linear-gradient(135deg, #3b82f6, #60a5fa);
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, #3b82f6 30%, transparent);
	}

	.tier-pro {
		background: linear-gradient(135deg, #8b5cf6, #a78bfa);
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, #8b5cf6 30%, transparent);
	}

	.tier-enterprise {
		background: linear-gradient(135deg, #f59e0b, #fbbf24);
		color: white;
		box-shadow: 0 2px 8px color-mix(in srgb, #f59e0b 30%, transparent);
	}

	.credits-info {
		min-width: 140px;
	}

	.credits-count {
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
		font-size: 0.95rem;
	}

	.credits-edit-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.credits-label {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-weight: 500;
		white-space: nowrap;
	}

	.credits-input {
		width: 80px;
		min-width: 80px;
		max-width: 80px;
		padding: 0.4rem 0.6rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 0.85rem;
		font-weight: 600;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
		box-sizing: border-box;
	}

	.credits-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.credits-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.role-select {
		padding: 0.5rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-sm);
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
		min-width: 100px;
		max-width: 100px;
		padding: 0.5rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
		box-sizing: border-box;
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

	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: stretch;
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
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

	.btn-danger {
		background: color-mix(in srgb, #ef4444 15%, var(--color-surface));
		backdrop-filter: blur(10px);
		color: #ef4444;
		border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		transition: all 0.3s ease;
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, #ef4444 25%, var(--color-surface));
		border-color: #ef4444;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, #ef4444 25%, transparent);
	}

	.btn-danger:disabled {
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
