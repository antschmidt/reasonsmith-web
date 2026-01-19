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
	import AnimatedLogo from '$lib/components/ui/AnimatedLogo.svelte';
	import { collectRoles } from '$lib/utils/authHelpers';
	import { estimateTokens, formatTokenCount } from '$lib/utils/tokenEstimate';

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
	let enableFactChecking = $state(false);
	let showForm = $state(false);
	let draggedIndex = $state<number | null>(null);
	let savingOrder = $state(false);
	let activeTab = $state<'edit' | 'preview'>('edit');

	const DRAFT_STORAGE_KEY = 'showcase-form-draft';

	type DraftData = {
		form: ShowcaseForm;
		rawContent: string;
		analysisProvider: 'claude' | 'openai';
		enableFactChecking: boolean;
		savedAt: string;
	};

	function saveDraft() {
		if (typeof localStorage === 'undefined') return;
		// Only save if there's meaningful content (not just editing an existing item)
		if (form.id) return;

		const draft: DraftData = {
			form: { ...form },
			rawContent,
			analysisProvider,
			enableFactChecking,
			savedAt: new Date().toISOString()
		};
		localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
	}

	function loadDraft(): DraftData | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
			if (!stored) return null;
			return JSON.parse(stored) as DraftData;
		} catch {
			return null;
		}
	}

	function clearDraft() {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(DRAFT_STORAGE_KEY);
	}

	function restoreDraft() {
		const draft = loadDraft();
		if (draft) {
			form = { ...draft.form };
			rawContent = draft.rawContent;
			analysisProvider = draft.analysisProvider;
			enableFactChecking = draft.enableFactChecking;
		}
	}

	// Auto-save draft when form changes (debounced via effect)
	let draftSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// Track all form-related state
		const _ = [form, rawContent, analysisProvider, enableFactChecking];

		if (draftSaveTimeout) clearTimeout(draftSaveTimeout);
		draftSaveTimeout = setTimeout(() => {
			saveDraft();
		}, 1000);
	});

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
			// Sort by display_order, then by created_at
			items.sort((a, b) => {
				if (a.display_order !== null && b.display_order !== null) {
					return a.display_order - b.display_order;
				}
				if (a.display_order !== null) return -1;
				if (b.display_order !== null) return 1;
				return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			});
		} catch (e: any) {
			error = e?.message ?? 'Failed to load showcase items.';
		} finally {
			loading = false;
		}
	}

	function resetForm(keepOrder = false, hideForm = false) {
		const reset = { ...blankForm };
		if (keepOrder) reset.display_order = form.display_order;
		form = reset;
		success = null;
		error = null;
		rawContent = '';
		analysisStatus = null;
		analysisError = null;
		extractedExamples = '';
		if (hideForm) showForm = false;
	}

	function openCreateForm() {
		resetForm();
		// Restore any saved draft
		restoreDraft();
		showForm = true;
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
		showForm = true;
		activeTab = 'edit';
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

		// For new items, calculate display_order to put at front (0 or lower than current min)
		let newDisplayOrder = form.display_order;
		if (!form.id) {
			const minOrder = items.length > 0 ? Math.min(...items.map((i) => i.display_order ?? 0)) : 0;
			newDisplayOrder = minOrder > 0 ? 0 : minOrder - 1;
		}

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
			display_order: newDisplayOrder,
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
				clearDraft();
				resetForm(true);
				showForm = false;
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

	// Preview data derivations
	const previewStructuredAnalysis = $derived(() => {
		if (!form.analysis) return null;
		try {
			return JSON.parse(form.analysis);
		} catch {
			return null;
		}
	});

	const previewSections = $derived(() => {
		const analysis = previewStructuredAnalysis();
		if (!analysis) return [];
		return [
			{
				key: 'good_faith',
				title: 'Good Faith Indicators',
				icon: '🤝',
				tone: 'positive',
				items: analysis.good_faith ?? [],
				emptyCopy: 'No clear good-faith signals were identified in this excerpt.'
			},
			{
				key: 'logical_fallacies',
				title: 'Logical Fallacies',
				icon: '⚠️',
				tone: 'warning',
				items: analysis.logical_fallacies ?? [],
				emptyCopy: 'No explicit logical fallacies were detected.'
			},
			{
				key: 'cultish_language',
				title: 'Cultish / Manipulative Language',
				icon: '🧠',
				tone: 'alert',
				items: analysis.cultish_language ?? [],
				emptyCopy: 'No manipulative language patterns were highlighted.'
			}
		];
	});

	const previewFactChecks = $derived(() => {
		const analysis = previewStructuredAnalysis();
		return analysis?.fact_checking ?? [];
	});

	const previewSummary = $derived(() => {
		const analysis = previewStructuredAnalysis();
		return analysis?.summary ?? null;
	});

	const previewSummaryStats = $derived(() => {
		const sections = previewSections();
		const factChecks = previewFactChecks();
		if (sections.length === 0) return [];
		return sections
			.map((section) => ({
				key: section.key,
				label: section.title,
				icon: section.icon,
				tone: section.tone,
				count: Array.isArray(section.items) ? section.items.length : 0
			}))
			.concat([
				{
					key: 'fact_checking',
					label: 'Fact Checks',
					icon: '🔍',
					tone: 'fact',
					count: Array.isArray(factChecks) ? factChecks.length : 0
				}
			]);
	});

	const formatMultiline = (value?: string | null) => {
		if (!value) return '';
		const escaped = value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
		return escaped.replace(/(?:\r\n|\r|\n)/g, '<br />');
	};

	const getPreviewExamples = (entry: any): string[] => {
		if (!entry || typeof entry !== 'object') return [];
		const collected: string[] = [];
		if (Array.isArray(entry.examples)) {
			for (const example of entry.examples) {
				if (typeof example === 'string') {
					const trimmed = example.trim();
					if (trimmed.length > 0) {
						collected.push(trimmed);
					}
				}
			}
		}
		if (typeof entry.example === 'string') {
			const trimmed = entry.example.trim();
			if (trimmed.length > 0 && !collected.includes(trimmed)) {
				collected.push(trimmed);
			}
		}
		return collected;
	};

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
				body: JSON.stringify({
					content: rawContent,
					provider: analysisProvider,
					skipFactChecking: !enableFactChecking,
					includeMultiPass: true,
					showcaseItemId: form.id || undefined
				})
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

	onMount(async () => {
		// Wait for initial auth state to load before checking access
		await new Promise<void>((resolve) => {
			const unsubscribe = nhost.auth.onAuthStateChanged(() => {
				unsubscribe();
				resolve();
			});
			// Timeout in case auth never fires
			setTimeout(resolve, 2000);
		});

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

		await ensureAuth();

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

	// Drag and drop handlers
	function handleDragStart(index: number) {
		draggedIndex = index;
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (draggedIndex === null || draggedIndex === index) return;

		// Reorder items in memory
		const newItems = [...items];
		const [draggedItem] = newItems.splice(draggedIndex, 1);
		newItems.splice(index, 0, draggedItem);
		items = newItems;
		draggedIndex = index;
	}

	async function handleDragEnd() {
		if (draggedIndex !== null) {
			draggedIndex = null;
			await saveOrder();
		}
	}

	async function saveOrder() {
		if (!hasAccess || savingOrder) return;
		savingOrder = true;
		error = null;
		success = null;

		try {
			// Update display_order for all items based on their current position
			const updates = items.map((item, index) => ({
				id: item.id,
				display_order: index
			}));

			// Update each item's display_order
			for (const update of updates) {
				const { error: gqlError } = await nhost.graphql.request(UPDATE_PUBLIC_SHOWCASE_ITEM, {
					id: update.id,
					changes: { display_order: update.display_order, updated_at: new Date().toISOString() }
				});
				if (gqlError) {
					throw Array.isArray(gqlError)
						? new Error(gqlError.map((e: any) => e.message).join('; '))
						: gqlError;
				}
			}

			// Update local items with new display_order values
			items = items.map((item, index) => ({ ...item, display_order: index }));
			success = 'Order saved successfully.';
		} catch (e: any) {
			error = e?.message ?? 'Failed to save order.';
		} finally {
			savingOrder = false;
		}
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
					<button type="button" class="btn-secondary" onclick={openCreateForm}>
						Create Showcase Item
					</button>
				</div>
				{#if loading}
					<p>Loading showcase items…</p>
				{:else if error && !showForm}
					<p class="error">{error}</p>
				{:else if items.length === 0}
					<p>No showcase items yet. Create your first entry using the button below.</p>
				{:else}
					<p class="drag-hint">Drag items to reorder</p>
					<ul class="item-list">
						{#each [...items].reverse() as item, revIndex}
							{@const originalIndex = items.length - 1 - revIndex}
							<li
								class:inactive={!item.published}
								class:dragging={draggedIndex === originalIndex}
								draggable="true"
								ondragstart={() => handleDragStart(originalIndex)}
								ondragover={(e) => handleDragOver(e, originalIndex)}
								ondragend={handleDragEnd}
							>
								<div class="item-number">{revIndex + 1}</div>
								<div class="drag-handle" aria-label="Drag to reorder">
									<svg viewBox="0 0 24 24" fill="currentColor">
										<path
											d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
										/>
									</svg>
								</div>
								<button type="button" class="item-button" onclick={() => editItem(item)}>
									<div class="item-title">{item.title}</div>
									<div class="item-meta">
										{#if item.media_type}<span>{item.media_type}</span>{/if}
										{#if item.creator}<span>{item.creator}</span>{/if}
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
										<path
											d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6m4-6v6"
										/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if success && !showForm}<p class="success">{success}</p>{/if}
			</aside>

			{#if showForm}
				<section class="form-panel">
					<div class="form-header">
						<h2>{form.id ? 'Edit Showcase Item' : 'Create Showcase Item'}</h2>
						<button
							type="button"
							class="close-button"
							aria-label="Close form"
							onclick={() => resetForm(false, true)}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>

					<div class="tab-bar">
						<button
							type="button"
							class="tab-button"
							class:active={activeTab === 'edit'}
							onclick={() => (activeTab = 'edit')}
						>
							Edit
						</button>
						<button
							type="button"
							class="tab-button"
							class:active={activeTab === 'preview'}
							onclick={() => (activeTab = 'preview')}
						>
							Preview
						</button>
					</div>

					{#if activeTab === 'edit'}
						<form
							onsubmit={(event) => {
								event.preventDefault();
								saveForm();
							}}
						>
							<!-- Basic Info Section -->
							<fieldset class="form-section">
								<legend>
									<span class="section-number">1</span>
									Basic Information
								</legend>
								<label class="field-full">
									<span>Title <span class="required">*</span></span>
									<input
										type="text"
										bind:value={form.title}
										required
										placeholder="Enter a descriptive title for this showcase item"
									/>
								</label>
								<label class="field-full">
									<span>Subtitle</span>
									<input
										type="text"
										bind:value={form.subtitle}
										placeholder="Optional secondary headline or context"
									/>
								</label>
								<div class="field-row">
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
											placeholder="Author or speaker name"
										/>
									</label>
								</div>
								<div class="field-row">
									<label>
										<span>Date Published</span>
										<input type="date" bind:value={form.date_published} />
									</label>
									<label>
										<span>Source URL</span>
										<input
											type="url"
											bind:value={form.source_url}
											placeholder="https://example.com/article"
										/>
									</label>
								</div>
							</fieldset>

							<!-- AI Analysis Section -->
							<fieldset class="form-section analysis-section">
								<legend>
									<span class="section-number">2</span>
									AI Analysis
								</legend>
								<p class="section-description">
									Paste source content below and generate a structured good-faith analysis using AI.
								</p>

								<label class="field-full">
									<span>Source Content</span>
									<textarea
										id="analysis-input"
										rows="12"
										bind:value={rawContent}
										placeholder="Paste transcript excerpts, statements, or notes to analyze…"
									></textarea>
									<div class="token-counter">
										{formatTokenCount(estimateTokens(rawContent))} tokens
									</div>
								</label>

								<div class="analysis-controls">
									<div class="control-group">
										<span class="control-label">Model</span>
										<div class="button-toggle-group">
											<button
												type="button"
												class="toggle-btn"
												class:is-active={analysisProvider === 'claude'}
												disabled={analyzing}
												onclick={() => (analysisProvider = 'claude')}
											>
												Claude
											</button>
											<button
												type="button"
												class="toggle-btn"
												class:is-active={analysisProvider === 'openai'}
												disabled={analyzing}
												onclick={() => (analysisProvider = 'openai')}
											>
												OpenAI
											</button>
										</div>
									</div>

									<div class="control-group">
										<span class="control-label">Fact Check</span>
										<div class="button-toggle-group">
											<button
												type="button"
												class="toggle-btn"
												class:is-active={!enableFactChecking}
												disabled={analyzing}
												onclick={() => (enableFactChecking = false)}
											>
												Off
											</button>
											<button
												type="button"
												class="toggle-btn"
												class:is-active={enableFactChecking}
												disabled={analyzing}
												onclick={() => (enableFactChecking = true)}
											>
												On
											</button>
										</div>
									</div>
								</div>

								<div class="analysis-actions">
									<button
										type="button"
										class="btn-analyze"
										onclick={() => generateFeaturedAnalysis()}
										disabled={analyzing || !rawContent.trim()}
									>
										{#if analyzing}
											<AnimatedLogo size="18px" isAnimating={true} />
											<span>Analyzing…</span>
										{:else}
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
											</svg>
											<span>Generate Analysis</span>
										{/if}
									</button>
									<button
										type="button"
										class="btn-secondary btn-small"
										onclick={() => generateFeaturedAnalysis({ force: true })}
										disabled={analyzing || !rawContent.trim()}
									>
										Force Refresh
									</button>
								</div>

								{#if analysisStatus}
									<div class="analysis-feedback success">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
											<polyline points="22 4 12 14.01 9 11.01" />
										</svg>
										<span>{analysisStatus}</span>
									</div>
								{:else if analysisError}
									<div class="analysis-feedback error">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10" />
											<line x1="12" y1="8" x2="12" y2="12" />
											<line x1="12" y1="16" x2="12.01" y2="16" />
										</svg>
										<span>{analysisError}</span>
									</div>
								{/if}

								{#if extractedExamples}
									<details class="analysis-examples">
										<summary>View Extracted Examples</summary>
										<pre>{extractedExamples}</pre>
									</details>
								{/if}
							</fieldset>

							<!-- Results Section -->
							<fieldset class="form-section">
								<legend>
									<span class="section-number">3</span>
									Results & Display
								</legend>

								<label class="field-full">
									<span>Highlights</span>
									<textarea
										id="highlights"
										rows="3"
										bind:value={form.summary}
										placeholder="Key takeaways that will be shown prominently on the card"
									></textarea>
								</label>

								<label class="field-full">
									<span>Full Analysis (JSON)</span>
									<textarea
										id="analysis"
										rows="6"
										bind:value={form.analysis}
										placeholder="Detailed analysis data in JSON format"
										class="code-textarea"
									></textarea>
								</label>

								<label class="field-full">
									<span>Tags</span>
									<input
										type="text"
										bind:value={form.tags}
										placeholder="Comma-separated: ethics, policy, rhetoric"
									/>
									<span class="field-hint">Tags help categorize and filter showcase items</span>
								</label>

								<label class="publish-toggle">
									<span class="toggle-track" class:is-active={form.published}>
										<span class="toggle-thumb"></span>
									</span>
									<input type="checkbox" bind:checked={form.published} class="sr-only" />
									<span class="toggle-label">{form.published ? 'Published' : 'Draft'}</span>
								</label>
							</fieldset>

							<!-- Form Actions -->
							<div class="form-actions">
								{#if success}<p class="success">{success}</p>{/if}
								{#if error && !loading}<p class="error">{error}</p>{/if}
								<div class="action-buttons">
									<button
										type="button"
										class="btn-secondary"
										onclick={() => resetForm(true)}
										disabled={saving}
									>
										Reset Form
									</button>
									<button type="submit" class="btn-primary" disabled={saving}>
										{#if saving}
											Saving…
										{:else if form.id}
											Update Item
										{:else}
											Create Item
										{/if}
									</button>
								</div>
							</div>
						</form>
					{:else}
						<!-- Preview Tab -->
						<div class="preview-panel">
							<article class="preview-card">
								<header class="preview-header">
									<h1>{form.title || 'Untitled'}</h1>
									{#if form.subtitle}
										<p class="preview-subtitle">{@html formatMultiline(form.subtitle)}</p>
									{/if}
									<div class="preview-meta">
										{#if form.media_type}<span>{form.media_type}</span>{/if}
										{#if form.creator}<span>{form.creator}</span>{/if}
										<span>
											{form.date_published
												? new Date(form.date_published + 'T12:00:00').toLocaleDateString()
												: new Date().toLocaleDateString()}
										</span>
									</div>

									{#if form.tags}
										{@const tagList = parseTags(form.tags)}
										{#if tagList.length > 0}
											<ul class="preview-tag-list">
												{#each tagList as tag}
													<li>{tag}</li>
												{/each}
											</ul>
										{/if}
									{/if}
								</header>

								{#if previewSummary()}
									<div class="preview-section-body" style="margin-top: 1.5rem;">
										<strong>Overall summary:</strong>
										{@html formatMultiline(previewSummary())}
									</div>
								{/if}

								{#if form.summary}
									<section class="preview-section">
										<h2>Highlights</h2>
										<div class="preview-section-body">{@html formatMultiline(form.summary)}</div>
									</section>
								{/if}

								{#if previewStructuredAnalysis()}
									<section class="preview-summary">
										<div class="preview-summary-grid">
											{#each previewSummaryStats() as stat}
												<div class={`preview-summary-card tone-${stat.tone}`}>
													<div class="preview-summary-icon">{stat.icon}</div>
													<div class="preview-summary-meta">
														<span class="preview-summary-count">{stat.count}</span>
														<span class="preview-summary-label">{stat.label}</span>
													</div>
												</div>
											{/each}
										</div>
									</section>

									{#each previewSections() as section}
										<section class="preview-section">
											<div class="preview-section-heading">
												<h2>{section.icon} {section.title}</h2>
												{#if section.items.length > 0}
													<span class="preview-section-count">
														{section.items.length} finding{section.items.length === 1 ? '' : 's'}
													</span>
												{/if}
											</div>
											{#if section.items.length > 0}
												<div class="preview-insight-grid">
													{#each section.items as entry}
														{@const examples = getPreviewExamples(entry)}
														<article class={`preview-insight-card tone-${section.tone}`}>
															<header>
																<h3>{entry.name}</h3>
																{#if entry.description}
																	<p class="preview-description">{entry.description}</p>
																{/if}
															</header>
															{#if examples.length > 0}
																<div class="preview-example">
																	<strong>{examples.length === 1 ? 'Example' : 'Examples'}:</strong>
																	<ul>
																		{#each examples as example}
																			<li>{example}</li>
																		{/each}
																	</ul>
																</div>
															{/if}
															{#if entry.why}
																<p class="preview-rationale">
																	<strong>Why it matters:</strong>
																	{entry.why}
																</p>
															{/if}
														</article>
													{/each}
												</div>
											{:else}
												<p class="preview-section-empty">{section.emptyCopy}</p>
											{/if}
										</section>
									{/each}

									<section class="preview-section">
										<div class="preview-section-heading">
											<h2>🔍 Fact Checking</h2>
											{#if previewFactChecks().length > 0}
												<span class="preview-section-count">
													{previewFactChecks().length} claim{previewFactChecks().length === 1
														? ''
														: 's'}
												</span>
											{/if}
										</div>
										{#if previewFactChecks().length > 0}
											<div class="preview-fact-grid">
												{#each previewFactChecks() as check}
													<article
														class={`preview-fact-card verdict-${(check.verdict || 'Unverified').toLowerCase()}`}
													>
														<header>
															<h3>{check.verdict || 'Unverified'}</h3>
														</header>
														{#if check.claim}
															<p class="preview-claim">{check.claim}</p>
														{/if}
														{#if check.source?.name || check.source?.url}
															<p class="preview-source">
																<strong>Source:</strong>
																{#if check.source?.url}
																	<a href={check.source.url} target="_blank" rel="noopener">
																		{check.source?.name || check.source.url}
																	</a>
																{:else if check.source?.name}
																	{check.source.name}
																{/if}
															</p>
														{/if}
													</article>
												{/each}
											</div>
										{:else}
											<p class="preview-section-empty">
												No fact-checkable claims were highlighted.
											</p>
										{/if}
									</section>
								{:else if form.analysis}
									<section class="preview-section">
										<h2>Analysis</h2>
										<div class="preview-section-body">{@html formatMultiline(form.analysis)}</div>
									</section>
								{/if}

								{#if form.source_url}
									<a
										class="preview-source-link"
										href={form.source_url}
										target="_blank"
										rel="noopener"
									>
										Original source ↗
									</a>
								{/if}
							</article>
						</div>
					{/if}
				</section>
			{/if}
		</section>
	</div>
{/if}

<style>
	.page-container {
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
		border-radius: var(--border-radius-xl);
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
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	.list-panel {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-xl);
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
		border-radius: var(--border-radius-xl) 24px 0 0;
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
	@media (min-width: 768px) {
		.item-list {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 1rem;
		}
	}
	.item-list li {
		display: flex;
		align-items: stretch;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-lg);
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	@media (min-width: 768px) {
		.item-list li {
			flex: 1 1 280px;
			max-width: 400px;
		}
	}
	.item-list li:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
	}
	.item-list li.inactive {
		opacity: 0.6;
	}
	.item-list li.dragging {
		opacity: 0.5;
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: var(--color-primary);
	}
	.item-number {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		padding: 0 0.5rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-right: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}
	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		padding: 0 0.25rem;
		cursor: grab;
		color: var(--color-text-secondary);
		opacity: 0.5;
		transition: opacity 0.2s ease;
	}
	.drag-handle:hover {
		opacity: 1;
	}
	.drag-handle:active {
		cursor: grabbing;
	}
	.drag-handle svg {
		width: 16px;
		height: 16px;
	}
	.drag-hint {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0 0 0.75rem;
		opacity: 0.7;
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
		border-radius: var(--border-radius-xl);
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
		border-radius: var(--border-radius-xl) 24px 0 0;
	}
	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.form-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-family: var(--font-family-display);
		font-weight: 700;
		color: var(--color-text-primary);
	}
	.close-button {
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.close-button:hover {
		background: color-mix(in srgb, var(--color-text-secondary) 15%, transparent);
		color: var(--color-text-primary);
	}
	.close-button svg {
		width: 24px;
		height: 24px;
	}
	.create-button-container {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}
	.create-button-container .btn-primary {
		width: 100%;
	}
	.btn-small {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Form Sections */
	.form-section {
		border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.5rem;
		margin: 0;
		background: color-mix(in srgb, var(--color-surface) 30%, transparent);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.form-section legend {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		padding: 0 0.5rem;
	}
	.section-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border-radius: 50%;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.section-description {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	.analysis-section {
		background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface) 30%);
		border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
	}

	/* Field Layout */
	.field-full {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	@media (max-width: 600px) {
		.field-row {
			grid-template-columns: 1fr;
		}
	}
	.field-hint {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-weight: 400;
		margin-top: 0.25rem;
	}
	.required {
		color: #ef4444;
	}

	/* Labels and Inputs */
	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	label > span:first-child {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	input[type='text'],
	input[type='url'],
	input[type='date'],
	textarea {
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		border-radius: var(--border-radius-md);
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		color: var(--color-text-primary);
		box-sizing: border-box;
		transition: all 0.2s ease;
		font-size: 0.95rem;
	}
	input[type='text']::placeholder,
	input[type='url']::placeholder,
	textarea::placeholder {
		color: var(--color-text-secondary);
		opacity: 0.6;
	}
	input[type='text']:focus,
	input[type='url']:focus,
	input[type='date']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: var(--color-surface);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
	}
	textarea {
		min-height: 5rem;
		resize: vertical;
		line-height: 1.5;
	}
	.code-textarea {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.token-counter {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-align: right;
		margin-top: 0.25rem;
	}

	/* Analysis Controls */
	.analysis-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1.5rem;
		padding: 0.75rem 0;
	}
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.control-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.button-toggle-group {
		display: flex;
		border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		border-radius: var(--border-radius-md);
		overflow: hidden;
	}
	.toggle-btn {
		padding: 0.5rem 1rem;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.toggle-btn:not(:last-child) {
		border-right: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}
	.toggle-btn:hover:not(:disabled):not(.is-active) {
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		color: var(--color-text-primary);
	}
	.toggle-btn.is-active {
		background: var(--color-primary);
		color: white;
		font-weight: 600;
	}
	.toggle-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.analysis-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	/* Analyze Button */
	.btn-analyze {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border: none;
		padding: 0.65rem 1.25rem;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}
	.btn-analyze svg {
		width: 18px;
		height: 18px;
	}
	.btn-analyze:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-primary) 35%, transparent);
	}
	.btn-analyze:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* Analysis Feedback */
	.analysis-feedback {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: var(--border-radius-md);
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.analysis-feedback svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		margin-top: 0.1rem;
	}
	.analysis-feedback.success {
		background: color-mix(in srgb, #10b981 12%, transparent);
		color: #059669;
		border: 1px solid color-mix(in srgb, #10b981 25%, transparent);
	}
	.analysis-feedback.error {
		background: color-mix(in srgb, #ef4444 12%, transparent);
		color: #dc2626;
		border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
	}

	/* Analysis Examples */
	.analysis-examples {
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: var(--border-radius-md);
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		overflow: hidden;
	}
	.analysis-examples summary {
		padding: 0.75rem 1rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		transition: all 0.2s ease;
	}
	.analysis-examples summary:hover {
		color: var(--color-text-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}
	.analysis-examples pre {
		margin: 0;
		padding: 1rem;
		white-space: pre-wrap;
		font-size: 0.8rem;
		line-height: 1.5;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		max-height: 300px;
		overflow-y: auto;
	}

	/* Publish Toggle */
	.publish-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		padding: 0.5rem 0;
	}
	.toggle-track {
		position: relative;
		width: 48px;
		height: 26px;
		background: color-mix(in srgb, var(--color-text-secondary) 30%, transparent);
		border-radius: 13px;
		transition: background 0.2s ease;
	}
	.toggle-track.is-active {
		background: var(--color-primary);
	}
	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		background: white;
		border-radius: 50%;
		transition: transform 0.2s ease;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
	.toggle-track.is-active .toggle-thumb {
		transform: translateX(22px);
	}
	.toggle-label {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--color-text-primary);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}

	/* Form Actions */
	.form-actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
	}
	.action-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}
	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-md);
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
		border-radius: var(--border-radius-md);
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

	/* Tab Bar */
	.tab-bar {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		padding-bottom: 0;
	}
	.tab-button {
		background: transparent;
		border: none;
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tab-button:hover:not(.active) {
		color: var(--color-text-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}
	.tab-button.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	/* Preview Panel */
	.preview-panel {
		padding: 1rem 0;
	}
	.preview-card {
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
		border-radius: var(--border-radius-xl);
		padding: 2rem;
		position: relative;
		overflow: hidden;
	}
	.preview-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
	}
	.preview-header h1 {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 900;
		line-height: 1.1;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
		letter-spacing: -0.02em;
		margin-bottom: 1rem;
	}
	.preview-subtitle {
		margin: 0 0 1rem;
		font-size: 1.1rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
	}
	.preview-meta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.preview-meta span + span::before {
		content: '•';
		margin-right: 0.5rem;
		color: color-mix(in srgb, var(--color-text-secondary) 60%, transparent);
	}
	.preview-tag-list {
		list-style: none;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0;
		margin: 1rem 0 0;
	}
	.preview-tag-list li {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-primary);
	}
	.preview-section {
		margin-top: 2rem;
	}
	.preview-section h2 {
		margin: 0 0 1rem;
		font-size: 1.35rem;
		font-weight: 800;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}
	.preview-section-heading {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.preview-section-heading h2 {
		margin: 0;
	}
	.preview-section-count {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		border-radius: var(--border-radius-md);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}
	.preview-section-body {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-text-primary);
	}
	.preview-section-empty {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}
	.preview-summary {
		margin-top: 2rem;
	}
	.preview-summary-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	}
	.preview-summary-card {
		border-radius: var(--border-radius-lg);
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
	}
	.preview-summary-icon {
		font-size: 1.5rem;
	}
	.preview-summary-meta {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.preview-summary-count {
		font-size: 1.25rem;
		font-weight: 900;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}
	.preview-summary-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}
	.preview-insight-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}
	.preview-insight-card {
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: var(--border-radius-lg);
		padding: 1.25rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		position: relative;
		overflow: hidden;
	}
	.preview-insight-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
	}
	.preview-insight-card h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}
	.preview-description {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}
	.preview-example {
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.preview-example strong {
		display: block;
		margin-bottom: 0.25rem;
	}
	.preview-example ul {
		margin: 0;
		padding-left: 1rem;
	}
	.preview-example li {
		margin: 0.1rem 0;
	}
	.preview-rationale {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.preview-fact-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}
	.preview-fact-card {
		border-radius: var(--border-radius-lg);
		padding: 1.25rem;
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		position: relative;
		overflow: hidden;
	}
	.preview-fact-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
	}
	.preview-fact-card header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-primary);
	}
	.preview-claim {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--color-text-primary);
	}
	.preview-source {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}
	.preview-source a {
		color: var(--color-primary);
		text-decoration: none;
	}
	.preview-source a:hover {
		text-decoration: underline;
	}
	.preview-source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 2rem;
		color: var(--color-primary);
		font-weight: 600;
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border-radius: var(--border-radius-lg);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
		transition: all 0.2s ease;
	}
	.preview-source-link:hover {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	/* Tone colors for preview cards */
	.preview-summary-card.tone-positive,
	.preview-insight-card.tone-positive {
		border-color: color-mix(in srgb, #10b981 50%, transparent);
	}
	.preview-summary-card.tone-warning,
	.preview-insight-card.tone-warning {
		border-color: color-mix(in srgb, #f59e0b 50%, transparent);
	}
	.preview-summary-card.tone-alert,
	.preview-insight-card.tone-alert {
		border-color: color-mix(in srgb, #ef4444 50%, transparent);
	}
	.preview-summary-card.tone-fact {
		border-color: color-mix(in srgb, #3b82f6 50%, transparent);
	}
	.preview-fact-card.verdict-true {
		border-color: color-mix(in srgb, #10b981 50%, transparent);
	}
	.preview-fact-card.verdict-true::before {
		background: linear-gradient(90deg, #10b981, #34d399);
	}
	.preview-fact-card.verdict-false {
		border-color: color-mix(in srgb, #ef4444 50%, transparent);
	}
	.preview-fact-card.verdict-false::before {
		background: linear-gradient(90deg, #ef4444, #f87171);
	}
	.preview-fact-card.verdict-misleading {
		border-color: color-mix(in srgb, #f59e0b 50%, transparent);
	}
	.preview-fact-card.verdict-misleading::before {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
	}
</style>
