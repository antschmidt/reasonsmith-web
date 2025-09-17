<script lang="ts">
	import { nhost, ensureContributor } from '$lib/nhostClient';
	import { onMount } from 'svelte';

	let user = nhost.auth.getUser();
	let loading = false;
	let fetching = false;
	let success: string | null = null;
	let error: string | null = null;

	// Profile fields
	let displayName = '';
	let bio = '';
	let website = '';
	let handle = '';
	let social = {
		twitter: '',
		github: '',
		linkedin: '',
		mastodon: '',
		bluesky: '',
		facebook: '',
		instagram: '',
		youtube: '',
		tiktok: ''
	} as Record<string, string>;

	const GET_PROFILE = `
    query GetProfile($id: uuid!) {
      contributor_by_pk(id: $id) {
        id
        display_name
        handle
        bio
        website
        social_links
      }
    }
  `;

	const UPDATE_PROFILE = `
    mutation UpdateProfile($id: uuid!, $display_name: String, $handle: String, $bio: String, $website: String, $social_links: jsonb) {
      update_contributor_by_pk(pk_columns: { id: $id }, _set: {
        display_name: $display_name,
        handle: $handle,
        bio: $bio,
        website: $website,
        social_links: $social_links
      }) { id }
    }
  `;

	onMount(async () => {
		user = nhost.auth.getUser();
		if (!user) return;
		await loadProfile();
	});

	async function loadProfile() {
		try {
			fetching = true;
			error = null;
			const { data, error: gqlError } = await nhost.graphql.request(GET_PROFILE, { id: user!.id });
			if (gqlError) throw gqlError;
			const c = (data as any)?.contributor_by_pk;
			if (c) {
				displayName = c.display_name || '';
				handle = c.handle || '';
				bio = c.bio || '';
				website = c.website || '';
				const links = c.social_links || {};
				for (const k of Object.keys(social)) social[k] = links[k] || '';
			}
		} catch (e: any) {
			error = e?.message || 'Failed to load profile.';
		} finally {
			fetching = false;
		}
	}

	function normUrl(u: string) {
		const s = u.trim();
		if (!s) return '';
		if (/^https?:\/\//i.test(s)) return s;
		return 'https://' + s;
	}

	async function save() {
		if (!user) return;
		loading = true;
		error = null;
		success = null;
		try {
			const trimmed = (displayName ?? '').trim();
			if (trimmed.length > 50) {
				error = 'Display name must be 50 characters or fewer.';
				return;
			}
			// Normalize and validate handle (optional)
			const normalizedHandle = (handle ?? '').trim().toLowerCase();
			if (normalizedHandle) {
				if (!/^[a-z0-9_.-]{3,30}$/.test(normalizedHandle)) {
					error = 'Handle must be 3–30 chars: a–z, 0–9, _ . -';
					return;
				}
			}
			// Build compact social_links payload with only filled values
			const social_links: Record<string, string> = {};
			for (const [k, v] of Object.entries(social)) {
				const val = (v || '').trim();
				if (!val) continue;
				// For known fields, accept handles or URLs; keep as provided
				social_links[k] = val;
			}
			const payload = {
				id: user.id,
				display_name: trimmed || null,
				handle: normalizedHandle || null,
				bio: bio?.trim() || null,
				website: website?.trim() ? normUrl(website) : null,
				social_links
			};
			const { data, error: gqlError } = await nhost.graphql.request(UPDATE_PROFILE, payload);
			if (gqlError) throw gqlError;
			if (!data?.update_contributor_by_pk) {
				// Contributor row might not exist yet; initialize then retry
				await ensureContributor();
				const retry = await nhost.graphql.request(UPDATE_PROFILE, payload);
				if (retry.error) throw retry.error;
			}
			success = 'Profile saved.';
		} catch (e: any) {
			const msg = e?.message || 'Failed to save profile.';
			// Surface uniqueness issues clearly
			if (/duplicate key value violates unique constraint/i.test(msg)) {
				error = 'That handle is taken. Please choose another.';
			} else if (/handle.*format/i.test(msg)) {
				error = 'Handle format invalid. Use 3–30 chars: a–z, 0–9, _ . -';
			} else {
				error = msg;
			}
		} finally {
			loading = false;
		}
	}
</script>

<div class="profile-container">
	<h1>Your Profile</h1>

	{#if !user}
		<p>Please sign in to edit your profile.</p>
	{:else}
		<form class="profile-form" on:submit|preventDefault={save}>
			<fieldset disabled={loading || fetching}>
				<label class="field">
					<span>Display Name</span>
					<input
						type="text"
						bind:value={displayName}
						placeholder="Your display name"
						maxlength="50"
					/>
				</label>

				<label class="field">
					<span>Handle</span>
					<input
						type="text"
						bind:value={handle}
						placeholder="yourname"
						maxlength="30"
						on:input={() => (handle = (handle || '').toLowerCase())}
					/>
					<small class="hint"
						>Profile URL: {handle
							? `${location.origin}/u/${handle}`
							: `${location.origin}/u/your-handle`}</small
					>
				</label>

				<label class="field">
					<span>Short Bio</span>
					<textarea rows="4" bind:value={bio} placeholder="Tell others a bit about you (optional)"
					></textarea>
				</label>

				<label class="field">
					<span>Website</span>
					<input type="url" bind:value={website} placeholder="https://example.com (optional)" />
				</label>

				<div class="social-grid">
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M18.244 2H21.5l-7.5 8.57L22.5 22H15.93l-5.07-5.88L5 22H1.744l8.1-9.26L.5 2H7.242l4.57 5.273L18.244 2Zm-1.155 18h1.92L7.01 4h-1.92l12 16Z"
									/></svg
								></span
							>Twitter / X</label
						>
						<input
							type="text"
							bind:value={social.twitter}
							placeholder="@handle or https://x.com/username"
						/>
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										fill-rule="evenodd"
										d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.54v-1.9c-3.05.66-3.7-1.27-3.7-1.27-.5-1.26-1.22-1.6-1.22-1.6-1-.7.08-.68.08-.68 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.18 3.2.9.1-.7.38-1.18.68-1.45-2.43-.27-4.98-1.22-4.98-5.43 0-1.2.43-2.18 1.13-2.95-.1-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.13.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.44 3.1-1.13 3.1-1.13.6 1.55.2 2.7.1 2.98.7.77 1.12 1.75 1.12 2.95 0 4.22-2.56 5.16-5 5.43.4.35.74 1.03.74 2.08v3.08c0 .3.2.65.76.54 4.35-1.45 7.5-5.57 7.5-10.43C23.02 5.24 18.27.5 12 .5Z"
										clip-rule="evenodd"
									/></svg
								></span
							>GitHub</label
						>
						<input
							type="text"
							bind:value={social.github}
							placeholder="username or https://github.com/username"
						/>
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v2h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.08V23h-4v-5.9c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V23h-4V8.5z"
									/></svg
								></span
							>LinkedIn</label
						>
						<input type="text" bind:value={social.linkedin} placeholder="profile URL" />
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M21.57 13.19c-.29 1.48-2.62 3.1-5.3 3.43-1.4.18-2.78.35-4.25.28-2.4-.11-4.31-.57-4.31-.57 0 .23.01.46.04.68.31 2.35 2.34 2.49 4.25 2.56 1.93.07 3.65-.47 3.65-.47l.08 1.8s-1.35.73-3.76.86c-1.33.07-2.99-.03-4.92-.52-4.18-1.06-4.9-5.35-4.99-9.69-.03-1.34-.01-2.6-.01-3.65 0-4.99 3.27-6.46 3.27-6.46 1.65-.76 4.49-1.08 7.45-1.1h.07c2.96.02 5.8.34 7.45 1.1 0 0 3.27 1.47 3.27 6.46 0 0 .04 3.02-.99 5.69zM17.55 6.6h-2.22v6.85h-2.53V6.6h-2.21V4.44h6.96V6.6z"
									/></svg
								></span
							>Mastodon</label
						>
						<input
							type="text"
							bind:value={social.mastodon}
							placeholder="@user@instance or profile URL"
						/>
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M12 9.8C9.5 6.5 6.3 3.7 3 2c1.2 3.6 3 7.1 6 9-3 1.9-4.8 5.4-6 9 3.3-1.7 6.5-4.5 9-7.8 2.5 3.3 5.7 6.1 9 7.8-1.2-3.6-3-7.1-6-9 3-1.9 4.8-5.4 6-9-3.3 1.7-6.5 4.5-9 7.8z"
									/></svg
								></span
							>Bluesky</label
						>
						<input type="text" bind:value={social.bluesky} placeholder="handle or profile URL" />
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.1 5.66 21.2 10.44 22v-7.02H7.9v-2.9h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.62.77-1.62 1.56v1.88h2.77l-.44 2.9h-2.33V22C18.34 21.2 22 17.1 22 12.07z"
									/></svg
								></span
							>Facebook</label
						>
						<input type="text" bind:value={social.facebook} placeholder="profile/page URL" />
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.3 2.4.6.6.3 1 .6 1.5 1.1.5.5.8.9 1.1 1.5.3.5.5 1.2.6 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.9-.6 2.4-.3.6-.6 1-1.1 1.5-.5.5-.9.8-1.5 1.1-.5.3-1.2.5-2.4.6-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.3-2.4-.6-.6-.3-1-.6-1.5-1.1-.5-.5-.8-.9-1.1-1.5-.3-.5-.5-1.2-.6-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.9.6-2.4.3-.6.6-1 1.1-1.5.5-.5.9-.8 1.5-1.1.5-.3 1.2-.5 2.4-.6C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.7.2 4.8.4 4 .8 3.2 1.2 2.5 1.7 1.7 2.5 1 3.2.5 3.9.1 4.7c-.4.8-.6 1.7-.7 3C-.7 9 .7 9.4 0 12c.7 2.6.4 3 .4 5.3.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.7 2.3.8.8 1.5 1.2 2.3 1.6.8.4 1.7.6 3 .7 1.3.1 1.7.1 5.3.1s4 0 5.3-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.3-1.6.8-.4 1.3-1.1 1.7-2.3.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5.3s0-4-.1-5.3c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.7-2.3C21.5.5 20.8 0 20 0c-.8-.4-1.7-.6-3-.7C15.6-.8 15.2-.8 12-.8z"
									/><circle cx="12" cy="12" r="3.2" /><circle cx="18.4" cy="5.6" r="1.2" /></svg
								></span
							>Instagram</label
						>
						<input type="text" bind:value={social.instagram} placeholder="@handle or profile URL" />
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.8.5 9.3.5 9.3.5s7.5 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2 32 32 0 0 0 .5-5.8 32 32 0 0 0-.5-5.8zM9.7 15.5V8.5l6.2 3.5-6.2 3.5z"
									/></svg
								></span
							>YouTube</label
						>
						<input type="text" bind:value={social.youtube} placeholder="channel URL" />
					</div>
					<div class="social-field">
						<label
							><span class="icon" aria-hidden="true"
								><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
									><path
										d="M19 7.5c-2 0-3.7-1.6-3.7-3.6V3h-3.2v10.6c0 1.5-1.2 2.7-2.8 2.7S6.5 15 6.5 13.6s1.2-2.7 2.8-2.7c.3 0 .6 0 .9.1V7.7c-.3 0-.6-.1-.9-.1-3.1 0-5.6 2.4-5.6 5.4S6.2 18.5 9.3 18.5s5.6-2.4 5.6-5.4v-4c1 1 2.4 1.7 4 1.7V7.5H19z"
									/></svg
								></span
							>TikTok</label
						>
						<input type="text" bind:value={social.tiktok} placeholder="@handle or profile URL" />
					</div>
				</div>

				{#if error}<div class="error">{error}</div>{/if}
				{#if success}<div class="success">{success}</div>{/if}
				<button class="btn-primary" type="submit" disabled={loading}>
					{#if loading}Saving…{:else}Save Profile{/if}
				</button>
			</fieldset>
		</form>
	{/if}
</div>

<style>
	.profile-container {
		max-width: 820px;
		margin: 2rem auto;
		padding: 1.5rem;
	}
	h1 {
		margin-bottom: 1rem;
	}
	.profile-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 100%;
	}
	.profile-form fieldset {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	input[type='text'],
	input[type='url'],
	textarea {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.5rem;
    margin-bottom: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		background: var(--color-input-bg);
		color: var(--color-text-primary);
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
	}
	.social-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		width: 100%;
	}
	.social-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.social-field label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.social-field label .icon {
		display: inline-flex;
		width: 16px;
		height: 16px;
		color: var(--color-text-secondary);
	}
	.social-field label .icon svg {
		width: 16px;
		height: 16px;
		display: block;
	}
	.btn-primary {
		align-self: flex-start;
		background: var(--color-primary);
		color: var(--color-surface);
		padding: 0.55rem 1rem;
		border-radius: var(--border-radius-md);
		border: none;
		cursor: pointer;
		font-weight: 600;
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.error {
		color: #ef4444;
		font-size: 0.9rem;
	}
	.success {
		color: #059669;
		font-size: 0.9rem;
	}
	.hint {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
</style>
