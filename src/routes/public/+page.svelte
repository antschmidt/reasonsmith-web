<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import {
		GET_PUBLIC_SHOWCASE_ADMIN,
		CREATE_PUBLIC_SHOWCASE_ITEM,
		UPDATE_PUBLIC_SHOWCASE_ITEM,
		DELETE_PUBLIC_SHOWCASE_ITEM
	} from '$lib/graphql/queries';
	import AnimatedLogo from '$lib/components/AnimatedLogo.svelte';

	type ShowcaseItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		media_type?: string | null;
		creator?: string | null;
		source_url?: string | null;
		summary?: string | null;
		analysis?: string | null;
		tags?: string[] | null;
		date_published?: string | null;
		display_order: number;
		published: boolean;
		created_at: string;
		updated_at: string;
	};

	type ShowcaseForm = {
		id: string | null;
		title: string;
		subtitle: string;
		media_type: string;
		creator: string;
		source_url: string;
		summary: string;
		analysis: string;
		tags: string;
		date_published: string;
		display_order: number;
		published: boolean;
	};

	const blankForm: ShowcaseForm = {
		id: null,
		title: '',
		subtitle: '',
		media_type: '',
		creator: '',
		source_url: '',
		summary: '',
		analysis: '',
		tags: '',
		date_published: '',
		display_order: 0,
		published: true
	};

	let checkingAuth = $state(true);
	let hasAccess = $state(false);
	let user = $state(nhost.auth.getUser());
	let items = $state<ShowcaseItem[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let deleting = $state<string | null>(null);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let form = $state<ShowcaseForm>({ ...blankForm });
	let rawContent = $state('');
	let analyzing = $state(false);
	let analysisStatus = $state<string | null>(null);
	let analysisError = $state<string | null>(null);
	let extractedExamples = $state('');
	let analysisProvider = $state<'claude' | 'openai'>('claude');
	let skipFactChecking = $state(false);

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

	async function ensureAuth() {
		try {
			await nhost.auth.isAuthenticatedAsync();
		} catch {}
		user = nhost.auth.getUser();

		if (!user) {
			hasAccess = false;
			checkingAuth = false;
			error = 'You must be logged in to view this page.';
			return;
		}

		// First check if user has authenticated 'me' role
		const roles = collectRoles(user);
		if (!roles.includes('me')) {
			hasAccess = false;
			checkingAuth = false;
			error = 'You must be authenticated to view this page.';
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

			const currentUserRole = result.data?.contributor_by_pk?.role || 'user';
			hasAccess = ['admin', 'slartibartfast'].includes(currentUserRole);

			checkingAuth = false;
			if (!hasAccess) {
				error = 'You do not have permission to view this page.';
			} else {
				await loadItems();
			}
		} catch (err) {
			console.error('Failed to get user role:', err);
			hasAccess = false;
			checkingAuth = false;
			error = 'Failed to verify permissions.';
		}
	}

	async function loadItems() {
		loading = true;
		error = null;
		try {
			const { data, error: gqlError } = await nhost.graphql.request(GET_PUBLIC_SHOWCASE_ADMIN);
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			items = (data as any)?.public_showcase_item ?? [];
		} catch (e: any) {
			error = e?.message ?? 'Failed to load showcase items.';
		} finally {
			loading = false;
		}
	}

	function resetForm(keepOrder = false) {
		const reset = { ...blankForm };
		if (keepOrder) reset.display_order = form.display_order;
		form = reset;
		success = null;
		error = null;
		rawContent = '';
		analysisStatus = null;
		analysisError = null;
		extractedExamples = '';
	}

	function editItem(item: ShowcaseItem) {
		form = {
			id: item.id,
			title: item.title ?? '',
			subtitle: item.subtitle ?? '',
			media_type: item.media_type ?? '',
			creator: item.creator ?? '',
			source_url: item.source_url ?? '',
			summary: item.summary ?? '',
			analysis: item.analysis ?? '',
			tags: item.tags?.join(', ') ?? '',
			date_published: item.date_published ?? '',
			display_order: item.display_order ?? 0,
			published: !!item.published
		};
		rawContent = '';
		analysisStatus = null;
		analysisError = null;
		extractedExamples = '';
		if (item.analysis) {
			try {
				const parsed = JSON.parse(item.analysis);
				extractedExamples = extractExamples(parsed);
			} catch {
				extractedExamples = '';
			}
		}
	}

	function parseTags(input: string): string[] {
		return input
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
	}

	async function saveForm() {
		if (!hasAccess) return;
		if (!form.title.trim()) {
			error = 'Title is required.';
			return;
		}
		saving = true;
		error = null;
		success = null;
		const payload: Record<string, any> = {
			title: form.title.trim(),
			subtitle: form.subtitle.trim() || null,
			media_type: form.media_type.trim() || null,
			creator: form.creator.trim() || null,
			source_url: form.source_url.trim() || null,
			summary: form.summary.trim() || null,
			analysis: form.analysis.trim() || null,
			tags: parseTags(form.tags),
			date_published: form.date_published.trim() || null,
			display_order: form.display_order ?? 0,
			published: form.published
		};
		try {
			if (form.id) {
				const { data, error: gqlError } = await nhost.graphql.request(UPDATE_PUBLIC_SHOWCASE_ITEM, {
					id: form.id,
					changes: { ...payload, updated_at: new Date().toISOString() }
				});
				if (gqlError)
					throw Array.isArray(gqlError)
						? new Error(gqlError.map((e: any) => e.message).join('; '))
						: gqlError;
				const updated = (data as any)?.update_public_showcase_item_by_pk;
				items = items.map((it) => (it.id === updated.id ? updated : it));
				success = 'Showcase item updated.';
			} else {
				const { data, error: gqlError } = await nhost.graphql.request(CREATE_PUBLIC_SHOWCASE_ITEM, {
					input: payload
				});
				if (gqlError)
					throw Array.isArray(gqlError)
						? new Error(gqlError.map((e: any) => e.message).join('; '))
						: gqlError;
				const created = (data as any)?.insert_public_showcase_item_one;
				items = [created, ...items];
				success = 'Showcase item created.';
				resetForm(true);
			}
		} catch (e: any) {
			error = e?.message ?? 'Failed to save showcase item.';
		} finally {
			saving = false;
		}
	}

	function buildSummaryFromAnalysis(result: any, fallbackSummary: string): string {
		if (!result || typeof result !== 'object') return fallbackSummary;
		const sections: string[] = [];
		if (Array.isArray(result.good_faith) && result.good_faith.length > 0) {
			sections.push(
				`Good Faith: ${result.good_faith
					.map((item: any) => item?.name)
					.filter(Boolean)
					.join(', ')}`
			);
		}
		if (Array.isArray(result.logical_fallacies) && result.logical_fallacies.length > 0) {
			sections.push(
				`Fallacies: ${result.logical_fallacies
					.map((item: any) => item?.name)
					.filter(Boolean)
					.join(', ')}`
			);
		}
		if (Array.isArray(result.cultish_language) && result.cultish_language.length > 0) {
			sections.push(
				`Cultish Language: ${result.cultish_language
					.map((item: any) => item?.name)
					.filter(Boolean)
					.join(', ')}`
			);
		}
		if (Array.isArray(result.fact_checking) && result.fact_checking.length > 0) {
			const flagged = result.fact_checking
				.map(
					(item: any) => `${item?.claim ? item.claim + ' — ' : ''}${item?.verdict || 'Unverified'}`
				)
				.slice(0, 3)
				.join('; ');
			if (flagged) sections.push(`Fact Check Highlights: ${flagged}`);
		}
		return sections.length > 0 ? sections.join('\n') : fallbackSummary;
	}

	function extractExamples(result: any): string {
		if (!result || typeof result !== 'object') return '';
		const sections: string[] = [];

		const collect = (items: any, label: string) => {
			if (!Array.isArray(items) || items.length === 0) return;
			const examples: string[] = [];
			for (const item of items) {
				const raw = Array.isArray(item?.examples)
					? item.examples
					: typeof item?.example === 'string'
						? [item.example]
						: [];
				for (const example of raw) {
					if (typeof example === 'string') {
						const trimmed = example.trim();
						if (trimmed.length > 0) examples.push(trimmed);
					}
				}
			}
			if (examples.length > 0) {
				sections.push(`${label}:\n${examples.map((ex) => `• ${ex}`).join('\n')}`);
			}
		};

		collect(result.good_faith, 'Good Faith Examples');
		collect(result.logical_fallacies, 'Fallacy Examples');
		collect(result.cultish_language, 'Cultish Language Examples');
		collect(result.fact_checking, 'Fact Check Examples');

		return sections.join('\n\n');
	}

	$effect(() => {
		const text = form.analysis;
		if (typeof text !== 'string' || text.trim().length === 0) {
			extractedExamples = '';
			return;
		}
		try {
			const parsed = JSON.parse(text);
			extractedExamples = extractExamples(parsed);
		} catch {
			extractedExamples = '';
		}
	});

	async function generateFeaturedAnalysis(options?: { force?: boolean }) {
		if (!hasAccess) return;
		const force = options?.force ?? false;
		analysisError = null;
		analysisStatus = null;
		success = null;
		extractedExamples = '';
		if (!rawContent.trim()) {
			analysisError = 'Provide source text to analyze first.';
			return;
		}
		analyzing = true;
		try {
			const response = await fetch(`/api/goodFaithClaudeFeatured${force ? '?force=1' : ''}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: rawContent, provider: analysisProvider, skipFactChecking })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				throw new Error(payload?.error || 'Failed to analyze content.');
			}
			const result = await response.json();
			const formatted = JSON.stringify(result, null, 2);
			const tagsFromResult = new Set<string>();
			if (Array.isArray(result.good_faith))
				result.good_faith.forEach((item: any) => item?.name && tagsFromResult.add(item.name));
			if (Array.isArray(result.logical_fallacies))
				result.logical_fallacies.forEach(
					(item: any) => item?.name && tagsFromResult.add(item.name)
				);
			if (Array.isArray(result.cultish_language))
				result.cultish_language.forEach((item: any) => item?.name && tagsFromResult.add(item.name));
			const tagString = Array.from(tagsFromResult).join(', ');
			const summaryText = buildSummaryFromAnalysis(result, force ? '' : form.summary);
			extractedExamples = extractExamples(result);
			form = {
				...form,
				summary: summaryText,
				analysis: formatted,
				tags: tagString
			};

			const providerLabel = analysisProvider === 'openai' ? 'OpenAI' : 'Claude';
			const statusPrefix = force ? `Forced ${providerLabel}` : `${providerLabel}`;

			if (form.id) {
				try {
					const { data, error: gqlError } = await nhost.graphql.request(
						UPDATE_PUBLIC_SHOWCASE_ITEM,
						{
							id: form.id,
							changes: {
								summary: summaryText || null,
								analysis: formatted,
								tags: parseTags(tagString),
								updated_at: new Date().toISOString()
							}
						}
					);
					if (gqlError)
						throw Array.isArray(gqlError)
							? new Error(gqlError.map((e: any) => e.message).join('; '))
							: gqlError;
					const updated = (data as any)?.update_public_showcase_item_by_pk;
					if (updated) {
						items = items.map((it) => (it.id === updated.id ? updated : it));
						analysisStatus = `${statusPrefix} analysis generated and saved.`;
					} else {
						analysisStatus = `${statusPrefix} analysis generated; review and save changes.`;
					}
				} catch (saveError: any) {
					analysisStatus = `${statusPrefix} analysis generated; review before saving.`;
					analysisError = saveError?.message || 'Failed to auto-save analysis.';
				}
			} else {
				analysisStatus = `${statusPrefix} analysis generated successfully. Review and adjust before saving.`;
			}
		} catch (e: any) {
			analysisError = e?.message || 'Failed to generate analysis.';
		} finally {
			analyzing = false;
		}
	}

	async function removeItem(id: string) {
		if (!hasAccess) return;
		if (!confirm('Delete this showcase item?')) return;
		deleting = id;
		error = null;
		success = null;
		try {
			const { error: gqlError } = await nhost.graphql.request(DELETE_PUBLIC_SHOWCASE_ITEM, { id });
			if (gqlError)
				throw Array.isArray(gqlError)
					? new Error(gqlError.map((e: any) => e.message).join('; '))
					: gqlError;
			items = items.filter((it) => it.id !== id);
			if (form.id === id) resetForm();
			success = 'Showcase item deleted.';
		} catch (e: any) {
			error = e?.message ?? 'Failed to delete showcase item.';
		} finally {
			deleting = null;
		}
	}

	onMount(() => {
		const off = nhost.auth.onAuthStateChanged(async () => {
			user = nhost.auth.getUser();
			const roles = collectRoles(user);
			hasAccess = roles.includes('me');
			if (hasAccess && !loading && items.length === 0) {
				await loadItems();
			}
			if (!hasAccess && !checkingAuth) {
				error = 'You do not have permission to view this page.';
			}
		});
		ensureAuth();
		return () => {
			try {
				(off as any)?.();
			} catch {}
		};
	});

	function viewLanding() {
		goto('/');
	}

	function viewDiscussions() {
		goto('/discussions');
	}
</script>

{#if checkingAuth}
	<div class="page-container">
		<p>Checking access…</p>
	</div>
{:else if !hasAccess}
	<div class="page-container">
		<div class="access-denied">
			<h1>Restricted</h1>
			<p>{error ?? 'You do not have permission to view this page.'}</p>
			<div class="nav-links">
				<button type="button" class="btn-secondary" onclick={viewLanding}>Back to Home</button>
			</div>
		</div>
	</div>
{:else}
	<div class="page-container">
		<header class="page-header">
			<div>
				<h1>Public Showcase Manager</h1>
				<p class="lead">
					Curate external analyses to highlight on the landing page and discussions hub.
				</p>
			</div>
			<div class="nav-links">
				<button type="button" class="btn-secondary" onclick={viewLanding}>View Landing</button>
				<button type="button" class="btn-secondary" onclick={viewDiscussions}
					>View Discussions</button
				>
			</div>
		</header>

		<section class="content">
			<aside class="list-panel">
				<div class="panel-header">
					<h2>Existing Entries</h2>
					<button type="button" class="btn-secondary" onclick={() => resetForm()}>New Item</button>
				</div>
				{#if loading}
					<p>Loading showcase items…</p>
				{:else if error}
					<p class="error">{error}</p>
				{:else if items.length === 0}
					<p>No showcase items yet. Create your first entry using the form.</p>
				{:else}
					<ul class="item-list">
						{#each items as item}
							<li class:inactive={!item.published}>
								<button type="button" class="item-button" onclick={() => editItem(item)}>
									<div class="item-title">{item.title}</div>
									<div class="item-meta">
										{#if item.media_type}<span>{item.media_type}</span>{/if}
										{#if item.creator}<span>{item.creator}</span>{/if}
										<span>Order: {item.display_order}</span>
										<span>{item.published ? 'Published' : 'Hidden'}</span>
									</div>
								</button>
								<button
									type="button"
									class="delete-button"
									aria-label={`Delete ${item.title}`}
									onclick={() => removeItem(item.id)}
									disabled={deleting === item.id}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6m4-6v6"/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</aside>

			<section class="form-panel">
				<h2>{form.id ? 'Edit Showcase Item' : 'Create Showcase Item'}</h2>
				<form
					onsubmit={(event) => {
						event.preventDefault();
						saveForm();
					}}
				>
					<div class="form-grid">
						<label>
							<span>Title *</span>
							<input type="text" bind:value={form.title} required />
						</label>
						<label>
							<span>Subtitle</span>
							<input type="text" bind:value={form.subtitle} />
						</label>
						<label>
							<span>Media Type</span>
							<input
								type="text"
								bind:value={form.media_type}
								placeholder="Speech, Podcast, Essay…"
							/>
						</label>
						<label>
							<span>Creator / Speaker</span>
							<input
								type="text"
								bind:value={form.creator}
								placeholder="Name of the author or speaker"
							/>
						</label>
						<label>
							<span>Date Published (optional)</span>
							<input
								type="date"
								bind:value={form.date_published}
								placeholder="When was the source material originally published?"
							/>
						</label>
						<label>
							<span>Source URL</span>
							<input type="url" bind:value={form.source_url} placeholder="https://" />
						</label>
						<label>
							<span>Display Order</span>
							<input type="number" bind:value={form.display_order} min="0" />
						</label>
						<label class="checkbox">
							<input type="checkbox" bind:checked={form.published} />
							<span>Published</span>
						</label>
					</div>

					<section class="analysis-generator">
						<div class="analysis-header">
							<h3>Generate Featured Analysis</h3>
							<p>
								Paste relevant excerpts or notes and let Claude produce the structured assessment.
							</p>
						</div>
						<textarea
							rows="30"
							bind:value={rawContent}
							placeholder="Paste transcript excerpts, statements, or notes to analyze…"
						></textarea>
						<div class="analysis-provider" role="group" aria-label="Choose analysis model">
							<span class="provider-label">Model</span>
							<label class={`provider-option ${analysisProvider === 'claude' ? 'is-active' : ''}`}>
								<input
									type="radio"
									value="claude"
									bind:group={analysisProvider}
									disabled={analyzing}
								/>
								<span>Claude</span>
							</label>
							<label class={`provider-option ${analysisProvider === 'openai' ? 'is-active' : ''}`}>
								<input
									type="radio"
									value="openai"
									bind:group={analysisProvider}
									disabled={analyzing}
								/>
								<span>OpenAI</span>
							</label>
						</div>
						<div class="analysis-options">
							<label class="fact-check-toggle">
								<input type="checkbox" bind:checked={skipFactChecking} disabled={analyzing} />
								<span>Skip fact checking (recommended for current events)</span>
							</label>
						</div>
						<div class="analysis-actions">
							<button
								type="button"
								class="btn-secondary"
								onclick={() => generateFeaturedAnalysis()}
								disabled={analyzing}
							>
								{#if analyzing}
									<AnimatedLogo size="20px" isAnimating={true} /> Analyzing…
								{:else}
									Analyze with Claude
								{/if}
							</button>
							<button
								type="button"
								class="btn-secondary"
								onclick={() => generateFeaturedAnalysis({ force: true })}
								disabled={analyzing}
							>
								{#if analyzing}
									<AnimatedLogo size="20px" isAnimating={true} /> Analyzing…
								{:else}
									Force fresh Claude run
								{/if}
							</button>
							{#if analysisStatus}
								<span class="analysis-status success">{analysisStatus}</span>
							{:else if analysisError}
								<span class="analysis-status error">{analysisError}</span>
							{/if}
						</div>
						{#if extractedExamples}
							<div class="analysis-examples">
								<h4>Extracted Examples</h4>
								<pre>{extractedExamples}</pre>
							</div>
						{/if}
					</section>

					<label>
						<span>Highlights</span>
						<textarea
							rows="3"
							bind:value={form.summary}
							placeholder="Short context for the source material."
						></textarea>
					</label>

					<label>
						<span>Analysis</span>
						<textarea
							rows="6"
							bind:value={form.analysis}
							placeholder="Key findings from the good-faith analysis."
						></textarea>
					</label>

					<label>
						<span>Tags (comma separated)</span>
						<input type="text" bind:value={form.tags} placeholder="ethics, policy, rhetoric" />
					</label>

					<div class="form-actions">
						<button type="submit" class="btn-primary" disabled={saving}
							>{saving ? 'Saving…' : form.id ? 'Update Item' : 'Create Item'}</button
						>
						<button
							type="button"
							class="btn-secondary"
							onclick={() => resetForm(true)}
							disabled={saving}>Reset</button
						>
					</div>
					{#if success}<p class="success">{success}</p>{/if}
					{#if error && !loading}<p class="error">{error}</p>{/if}
				</form>
			</section>
		</section>
	</div>
{/if}

<style>
	.page-container {
		max-width: 1100px;
		margin: 2rem auto;
		padding: 0 1.5rem 3rem;
	}
	.page-header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 2rem;
		border-radius: 24px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
	.page-header h1 {
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
	.nav-links {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.content {
		display: grid;
		grid-template-columns: minmax(280px, 350px) 1fr;
		gap: 2rem;
	}
	.list-panel {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		padding: 1.5rem;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
		position: relative;
		overflow: hidden;
	}
	.list-panel::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 24px 24px 0 0;
	}
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}
	.panel-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		color: var(--color-text-primary);
	}
	.item-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.item-list li {
		display: flex;
		align-items: stretch;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.item-list li:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
	.item-list li.inactive {
		opacity: 0.6;
	}
	.item-button {
		flex: 1;
		text-align: left;
		padding: 1rem;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		transition: background 0.2s ease;
	}
	.item-button:hover {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}
	.item-title {
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
		font-size: 1rem;
	}
	.item-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}
	.delete-button {
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		width: 2.5rem;
		height: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		border-radius: var(--border-radius-sm);
	}
	.delete-button svg {
		width: 20px;
		height: 20px;
		opacity: 0.6;
		transition: all 0.2s ease;
	}
	.delete-button:hover:not(:disabled) {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
	}
	.delete-button:hover:not(:disabled) svg {
		opacity: 1;
	}
	.delete-button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.form-panel {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		padding: 2rem;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-primary) 8%, transparent);
		position: relative;
		overflow: hidden;
	}
	.form-panel::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 24px 24px 0 0;
	}
	.form-panel h2 {
		margin-top: 0;
		font-size: 1.5rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		color: var(--color-text-primary);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	label span {
		font-weight: 600;
		color: var(--color-text-primary);
	}
	input[type='text'],
	input[type='url'],
	input[type='number'],
	input[type='date'],
	textarea {
		width: 100%;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		box-sizing: border-box;
		transition: all 0.3s ease;
		font-size: 0.95rem;
	}
	input[type='text']:focus,
	input[type='url']:focus,
	input[type='number']:focus,
	input[type='date']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
	textarea {
		min-height: 5rem;
		resize: vertical;
	}
	.analysis-generator {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 16px;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(15px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		box-shadow: 0 4px 15px color-mix(in srgb, var(--color-primary) 6%, transparent);
	}
	.analysis-header h3 {
		margin: 0;
		font-size: 1rem;
	}
	.analysis-header p {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}
	.analysis-generator textarea {
		min-height: 8rem;
		resize: vertical;
		font-size: 0.95rem;
		padding: 0.75rem;
	}
	.analysis-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.analysis-provider {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.analysis-provider .provider-label {
		font-weight: 600;
		margin-right: 0.25rem;
	}
	.provider-option {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}
	.provider-option input {
		margin: 0;
	}
	.provider-option.is-active {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
	}
	.provider-option input:disabled + span {
		opacity: 0.6;
	}
	.analysis-options {
		margin: 0.75rem 0;
	}
	.fact-check-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.fact-check-toggle input {
		margin: 0;
	}
	.fact-check-toggle input:disabled + span {
		opacity: 0.6;
	}
	.analysis-examples {
		padding: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, var(--color-surface) 88%, var(--color-background));
	}
	.analysis-examples h4 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}
	.analysis-examples pre {
		margin: 0;
		white-space: pre-wrap;
		font-size: 0.75rem;
		line-height: 1.4;
	}
	.analysis-status {
		font-size: 0.85rem;
	}
	.analysis-status.success {
		color: color-mix(in srgb, var(--color-primary) 85%, transparent);
	}
	.analysis-status.error {
		color: #ef4444;
	}
	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}
	.checkbox {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	.form-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 12px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.95rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 15px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}
	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}
	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		padding: 0.7rem 1.4rem;
		border-radius: 12px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.95rem;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.btn-secondary:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		transform: translateY(-1px);
	}
	.error {
		color: #ef4444;
		font-size: 0.9rem;
	}
	.success {
		color: #10b981;
		font-size: 0.9rem;
	}
	.access-denied {
		max-width: 460px;
		margin: 4rem auto;
		text-align: center;
		padding: 2rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface);
	}
	@media (max-width: 900px) {
		.content {
			grid-template-columns: 1fr;
		}
	}
</style>
