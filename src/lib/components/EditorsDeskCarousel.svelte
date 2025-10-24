<svelte:options runes={true} />

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import DOMPurify from 'isomorphic-dompurify';
	import { getCuratorName, type EditorsDeskPick } from '$lib/utils/editorsDeskUtils';
	import SaveButton from './SaveButton.svelte';

	const props = $props<{
		items?: EditorsDeskPick[];
		canCurate?: boolean;
		onRemove?: (pickId: string) => void;
	}>();
	const items = $derived(props.items ?? []);
	const canCurate = $derived(props.canCurate ?? false);
	const onRemove = $derived(props.onRemove ?? (() => {}));

	let viewport = $state<HTMLDivElement | null>(null);
	let atStart = $state(true);
	let atEnd = $state(false);

	const sanitizeMultiline = (value?: string | null) => {
		if (!value) return '';
		// Replace newlines with <br /> tags, then sanitize
		const withBreaks = value.replace(/(?:\r\n|\r|\n)/g, '<br />');
		return DOMPurify.sanitize(withBreaks, {
			ALLOWED_TAGS: ['br'],
			ALLOWED_ATTR: []
		});
	};

	const getContentLink = (pick: EditorsDeskPick): string => {
		if (pick.discussion_id) {
			return `/discussions/${pick.discussion_id}`;
		} else if (pick.post_id) {
			// For posts, we need to link to the discussion containing the post
			// This would require additional data or we can just link to discussions
			return `/discussions`; // Fallback
		}
		return '/';
	};

	const handleCardClick = (pick: EditorsDeskPick) => {
		const user = nhost.auth.getUser();
		const targetUrl = getContentLink(pick);

		if (!user) {
			// Redirect to login with return URL
			goto(`/login?redirectTo=${encodeURIComponent(targetUrl)}`);
		} else {
			goto(targetUrl);
		}
	};

	const updateScrollState = () => {
		if (!viewport) return;
		const { scrollLeft, scrollWidth, clientWidth } = viewport;
		atStart = scrollLeft <= 4;
		atEnd = scrollLeft + clientWidth >= scrollWidth - 4;
	};

	const scrollByPage = (direction: 'prev' | 'next') => {
		if (!viewport) return;
		const amount = viewport.clientWidth * 0.8;
		viewport.scrollBy({ left: direction === 'next' ? amount : -amount, behavior: 'smooth' });
	};

	onMount(() => {
		const handle = () => updateScrollState();
		handle();
		const observer = new ResizeObserver(handle);
		if (viewport) observer.observe(viewport);
		return () => observer.disconnect();
	});
</script>

{#if items.length > 0}
	<div class="editors-desk-carousel" aria-label="Editors' Desk featured picks carousel">
		<button
			class="nav-button prev"
			type="button"
			onclick={() => scrollByPage('prev')}
			disabled={atStart}
			aria-label="Scroll to previous featured pick"
		>
			‹
		</button>

		<div class="carousel-viewport" bind:this={viewport} role="list" onscroll={updateScrollState}>
			{#each items as item (item.id)}
				<div role="listitem" class="carousel-card">
					<div class="card-actions-top">
						<SaveButton editorsDeskPickId={item.id} size="small" />
						{#if canCurate}
							<button
								class="remove-button"
								onclick={(e) => {
									e.stopPropagation();
									onRemove(item.id);
								}}
								title="Remove from Editors' Desk"
								aria-label="Remove from Editors' Desk"
								type="button"
							>
								×
							</button>
						{/if}
					</div>
					<button class="card-link" onclick={() => handleCardClick(item)} type="button">
						<header class="card-header">
							<div class="meta-tags">
								<span class="editors-badge">Editors' Desk</span>
								<span>{new Date(item.created_at).toLocaleDateString()}</span>
							</div>
							<h3>{item.title}</h3>
							{#if item.excerpt}
								<p class="excerpt">{@html sanitizeMultiline(item.excerpt)}</p>
							{/if}
						</header>
						{#if item.editor_note}
							<div class="editor-note">
								<div class="note-label">Editor's Note:</div>
								<p>{@html sanitizeMultiline(item.editor_note)}</p>
							</div>
						{/if}
						<footer class="card-footer">
							<span class="card-cta">Read full piece</span>
							<span class="card-arrow" aria-hidden="true">→</span>
						</footer>
					</button>
				</div>
			{/each}
		</div>

		<button
			class="nav-button next"
			type="button"
			onclick={() => scrollByPage('next')}
			disabled={atEnd}
			aria-label="Scroll to next featured pick"
		>
			›
		</button>
	</div>
{/if}

<style>
	.editors-desk-carousel {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.75rem;
		align-items: center;
	}

	.carousel-viewport {
		position: relative;
		display: flex;
		gap: 1.5rem;
		overflow-x: auto;
		padding: 1rem 0.5rem;
		scroll-snap-type: x mandatory;
		scroll-behavior: smooth;
		scrollbar-width: thin;
	}

	.carousel-viewport::-webkit-scrollbar {
		height: 8px;
	}

	.carousel-viewport::-webkit-scrollbar-track {
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border-radius: var(--border-radius-md);
	}

	.carousel-viewport::-webkit-scrollbar-thumb {
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: var(--border-radius-md);
		border: 2px solid transparent;
		background-clip: content-box;
	}

	.carousel-viewport::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-primary) 80%, transparent),
			color-mix(in srgb, var(--color-accent) 80%, transparent)
		);
	}

	.carousel-card {
		scroll-snap-align: start;
		min-width: clamp(280px, 45vw, 480px);
		position: relative;
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		backdrop-filter: blur(20px) saturate(1.2);
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-accent) 12%, transparent);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
		background: color-mix(in srgb, var(--color-surface) 95%, transparent);
	}

	.card-actions-top {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		z-index: 10;
	}

	.remove-button {
		position: relative;
		top: 0;
		right: 0;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--border-radius-md);
		background: color-mix(in srgb, var(--color-surface) 90%, transparent);
		backdrop-filter: blur(20px);
		color: var(--color-text-secondary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		font-size: 1.25rem;
		font-weight: 300;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 0.6;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 8%, transparent);
	}

	.carousel-card:hover .remove-button {
		opacity: 1;
	}

	.remove-button:hover {
		background: color-mix(in srgb, #ef4444 90%, transparent);
		color: white;
		border-color: #ef4444;
		transform: translateY(-2px);
		box-shadow: 0 8px 20px color-mix(in srgb, #ef4444 25%, transparent);
	}

	.remove-button:active {
		transform: translateY(0);
		box-shadow: 0 4px 12px color-mix(in srgb, #ef4444 20%, transparent);
	}

	.card-link {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		color: inherit;
		text-decoration: none;
		background: transparent;
		border: none;
		text-align: left;
		width: 100%;
		cursor: pointer;
	}

	.carousel-card:hover {
		transform: translateY(-8px);
		box-shadow: 0 20px 50px color-mix(in srgb, var(--color-accent) 20%, transparent);
		background: var(--color-surface);
		border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
	}

	.card-link:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 4px;
	}

	.card-header {
		display: flex;
		flex-direction: column;
	}

	.card-header h3 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.3;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.excerpt {
		margin: 0.5rem 0 0;
		text-align: left;
		font-size: 0.95rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.editor-note {
		margin: 0;
		text-align: left;
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
		padding: 1rem;
		border-radius: var(--border-radius-md);
		border-left: 3px solid color-mix(in srgb, var(--color-accent) 60%, transparent);
	}

	.note-label {
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-accent);
		margin-bottom: 0.5rem;
	}

	.editor-note p {
		margin: 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.meta-tags {
		order: -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.editors-badge {
		background: linear-gradient(135deg, #575858, var(--color-primary));
		color: #000000;
		padding: 0.25rem 0.6rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.7rem;
	}

	.meta-tags span + span::before {
		content: '•';
		margin-right: 0.45rem;
		color: color-mix(in srgb, var(--color-text-secondary) 55%, transparent);
	}

	.card-footer {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-accent);
		margin-top: auto;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.card-cta {
		margin: 0;
	}

	.card-arrow {
		display: inline-flex;
		transition: transform var(--transition-speed) ease;
	}

	.carousel-card:hover .card-arrow {
		transform: translateX(2px);
	}

	.nav-button {
		width: 3rem;
		height: 3rem;
		border-radius: var(--border-radius-xl);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		backdrop-filter: blur(20px);
		color: var(--color-text-primary);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.nav-button:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-alt) 80%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-accent) 18%, transparent);
		border-color: color-mix(in srgb, var(--color-accent) 25%, transparent);
	}

	.nav-button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	@media (max-width: 768px) {
		.carousel-card {
			min-width: 90vw; /* clamp(250px, 85vw, 420px); */
		}

		.card-link {
			padding: 1rem;
		}

		.card-header h3 {
			font-size: 1.125rem;
		}

		.nav-button {
			width: 2.5rem;
			height: 2.5rem;
			font-size: 1.25rem;
		}
	}

	@media (max-width: 640px) {
		.editors-desk-carousel {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.nav-button {
			display: none;
		}

		.carousel-viewport {
			order: 2;
			margin: 0 -1rem;
			padding: 1rem;
			gap: 1rem;
		}

		.carousel-card {
			min-width: clamp(240px, 80vw, 460px);
		}
	}
</style>
