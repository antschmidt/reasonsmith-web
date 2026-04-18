<!--
  Settings page (Plans 7 + 8)

  Houses the contributor's editable preferences:
    - Reviewer voice (register) — via ReviewerRegisterPicker
    - Plain-language labels — boolean toggle
    - Growth visibility — hidden / quiet / normal
    - Level display mode — craft / academic / hidden

  Data source: the contributor store (populated by the root +layout.svelte
  auth cycle). All mutations go directly through nhost.graphql and update
  the store optimistically so downstream components react immediately.

  The route is gated client-side: if there's no authenticated contributor in
  the store, we show a sign-in prompt rather than the form. A future
  enhancement would promote this to a server-side load with redirect, but
  the project currently does all auth client-side so we match that pattern.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { nhost } from '$lib/nhostClient';
	import { contributorStore } from '$lib/stores/contributorStore';
	import type { GrowthVisibility } from '$lib/stores/contributorStore';
	import type { LevelDisplayMode } from '$lib/utils/growthUtils';
	import type { ReviewerRegister } from '$lib/goodFaith';
	import ReviewerRegisterPicker from '$lib/components/settings/ReviewerRegisterPicker.svelte';

	const UPDATE_PREFS_MUTATION = `
		mutation UpdateContributorPreferences(
			$contributorId: uuid!
			$prefersPlainLanguage: Boolean
			$growthVisibility: String
			$levelDisplayMode: String
		) {
			update_contributor_by_pk(
				pk_columns: { id: $contributorId }
				_set: {
					prefers_plain_language: $prefersPlainLanguage
					growth_visibility: $growthVisibility
					level_display_mode: $levelDisplayMode
				}
			) {
				id
				prefers_plain_language
				growth_visibility
				level_display_mode
			}
		}
	`;

	let contributorId = $state<string | null>(null);
	let register = $state<ReviewerRegister>('editor');
	let prefersPlainLanguage = $state(false);
	let growthVisibility = $state<GrowthVisibility>('normal');
	let levelDisplayMode = $state<LevelDisplayMode>('craft');

	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveErrorMessage = $state<string | null>(null);
	let isAuthenticated = $state(false);
	let hasHydrated = $state(false);

	const unsubscribe = contributorStore.subscribe((data) => {
		if (data?.id) {
			isAuthenticated = true;
			contributorId = data.id;
			register = (data.reviewer_register as ReviewerRegister) ?? 'editor';
			prefersPlainLanguage = Boolean(data.prefers_plain_language);
			growthVisibility = (data.growth_visibility as GrowthVisibility) ?? 'normal';
			levelDisplayMode = (data.level_display_mode as LevelDisplayMode) ?? 'craft';
		} else {
			isAuthenticated = false;
			contributorId = null;
		}
		hasHydrated = true;
	});
	onDestroy(unsubscribe);

	async function savePreferences() {
		if (!contributorId) return;
		saveStatus = 'saving';
		saveErrorMessage = null;

		// Mirror optimistically to the store so downstream surfaces
		// (AnalysisCoachCard, GrowthDashboard) update immediately.
		contributorStore.updatePreferences({
			prefers_plain_language: prefersPlainLanguage,
			growth_visibility: growthVisibility,
			level_display_mode: levelDisplayMode
		});

		try {
			const result = await nhost.graphql.request(UPDATE_PREFS_MUTATION, {
				contributorId,
				prefersPlainLanguage,
				growthVisibility,
				levelDisplayMode
			});
			const errors = (result as any)?.error ?? (result as any)?.errors;
			if (errors) {
				throw new Error(
					Array.isArray(errors)
						? errors[0]?.message ?? 'Save failed'
						: errors?.message ?? 'Save failed'
				);
			}
			saveStatus = 'saved';
			// Fade the confirmation after a moment so the form doesn't feel shouty.
			setTimeout(() => {
				if (saveStatus === 'saved') saveStatus = 'idle';
			}, 2500);
		} catch (err) {
			saveStatus = 'error';
			saveErrorMessage =
				err instanceof Error
					? err.message
					: "Couldn't save your preferences. Try again in a moment.";
		}
	}

	function handleRegisterChange(next: ReviewerRegister) {
		register = next;
	}
</script>

<svelte:head>
	<title>Settings · ReasonSmith</title>
</svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<h1>Settings</h1>
		<p class="settings-lede">
			How ReasonSmith talks to you, how much of the growth system you see, and how your coach
			reviews your drafts.
		</p>
	</header>

	{#if !hasHydrated}
		<p class="settings-status">Loading your preferences…</p>
	{:else if !isAuthenticated}
		<div class="settings-signed-out">
			<p>You need to be signed in to change your preferences.</p>
			<button type="button" onclick={() => goto('/login?redirect=/settings')}>
				Sign in
			</button>
		</div>
	{:else}
		<section class="settings-card" aria-labelledby="voice-heading">
			<h2 id="voice-heading" class="sr-only">Reviewer voice</h2>
			<ReviewerRegisterPicker
				value={register}
				{contributorId}
				onChange={handleRegisterChange}
			/>
		</section>

		<section class="settings-card" aria-labelledby="display-heading">
			<header class="card-header">
				<h2 id="display-heading">Display and language</h2>
				<p class="card-sub">
					Affects how labels and growth indicators look across the site. Scores and analysis are
					unchanged.
				</p>
			</header>

			<form
				class="card-body"
				onsubmit={(e) => {
					e.preventDefault();
					savePreferences();
				}}
			>
				<label class="pref-row">
					<input type="checkbox" bind:checked={prefersPlainLanguage} />
					<div class="pref-text">
						<span class="pref-title">Use plain-language labels</span>
						<span class="pref-hint">
							Replace forge-themed terms like "Send to the forge" with direct labels like
							"Analyze". Screen reader labels always stay plain regardless of this setting.
						</span>
					</div>
				</label>

				<fieldset class="pref-fieldset">
					<legend>
						<span class="pref-title">Growth visibility</span>
						<span class="pref-hint">
							How loud the XP, levels, and achievements surface feels.
						</span>
					</legend>
					<label class="radio-row">
						<input
							type="radio"
							name="growth-visibility"
							value="normal"
							bind:group={growthVisibility}
						/>
						<span>
							<strong>Normal</strong> — show XP, levels, and achievements as usual.
						</span>
					</label>
					<label class="radio-row">
						<input
							type="radio"
							name="growth-visibility"
							value="quiet"
							bind:group={growthVisibility}
						/>
						<span>
							<strong>Quiet</strong> — still show metrics, but dial back celebratory UI.
						</span>
					</label>
					<label class="radio-row">
						<input
							type="radio"
							name="growth-visibility"
							value="hidden"
							bind:group={growthVisibility}
						/>
						<span>
							<strong>Hidden</strong> — hide the growth surface entirely. Scores still count
							internally; you just won't see them.
						</span>
					</label>
				</fieldset>

				<fieldset class="pref-fieldset">
					<legend>
						<span class="pref-title">Level names</span>
						<span class="pref-hint">
							Choose how levels are titled. If you prefer no titles at all, pick Hidden.
						</span>
					</legend>
					<label class="radio-row">
						<input
							type="radio"
							name="level-display-mode"
							value="craft"
							bind:group={levelDisplayMode}
						/>
						<span>
							<strong>Craft</strong> — Apprentice, Journeyman, Smith… matches the forge
							metaphor.
						</span>
					</label>
					<label class="radio-row">
						<input
							type="radio"
							name="level-display-mode"
							value="academic"
							bind:group={levelDisplayMode}
						/>
						<span>
							<strong>Academic</strong> — Reader, Analyst, Rhetor… for a more scholarly feel.
						</span>
					</label>
					<label class="radio-row">
						<input
							type="radio"
							name="level-display-mode"
							value="hidden"
							bind:group={levelDisplayMode}
						/>
						<span>
							<strong>Hidden</strong> — show just the level number, no title.
						</span>
					</label>
				</fieldset>

				<div class="card-actions">
					<button
						type="submit"
						class="save-button"
						disabled={saveStatus === 'saving'}
					>
						{saveStatus === 'saving' ? 'Saving…' : 'Save preferences'}
					</button>
					{#if saveStatus === 'saved'}
						<span class="save-feedback save-feedback--ok" role="status">Saved.</span>
					{:else if saveStatus === 'error'}
						<span class="save-feedback save-feedback--err" role="alert">
							{saveErrorMessage}
						</span>
					{/if}
				</div>
			</form>
		</section>
	{/if}
</div>

<style>
	.settings-page {
		max-width: 780px;
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem);
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.settings-header h1 {
		font-family: var(--font-family-display, Georgia, serif);
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		margin: 0 0 0.5rem;
	}

	.settings-lede {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.55;
	}

	.settings-status,
	.settings-signed-out {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-lg, 12px);
		padding: 1.5rem;
		text-align: center;
	}

	.settings-signed-out button {
		margin-top: 0.75rem;
		padding: 0.55rem 1.2rem;
		border-radius: var(--border-radius-full, 999px);
		border: 1px solid var(--color-primary);
		background: transparent;
		color: var(--color-primary);
		cursor: pointer;
	}

	.settings-card {
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
		border-radius: var(--border-radius-lg, 12px);
		padding: clamp(1.25rem, 3vw, 1.75rem);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card-header h2 {
		margin: 0;
		font-family: var(--font-family-display, Georgia, serif);
		font-size: 1.25rem;
	}

	.card-sub {
		margin: 0.25rem 0 0;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.pref-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		cursor: pointer;
	}

	.pref-row input[type='checkbox'] {
		margin-top: 0.2rem;
	}

	.pref-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.pref-title {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.pref-hint {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.45;
	}

	.pref-fieldset {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pref-fieldset legend {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.35rem;
	}

	.radio-row {
		display: flex;
		gap: 0.65rem;
		align-items: flex-start;
		padding: 0.5rem 0.6rem;
		border-radius: var(--border-radius-sm, 6px);
		cursor: pointer;
	}

	.radio-row:hover {
		background: color-mix(in srgb, var(--color-surface-alt, #fafafa) 85%, transparent);
	}

	.radio-row input[type='radio'] {
		margin-top: 0.25rem;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.save-button {
		padding: 0.55rem 1.25rem;
		border-radius: var(--border-radius-full, 999px);
		border: 1px solid var(--color-primary);
		background: var(--color-primary);
		color: var(--color-on-primary, white);
		font-weight: 600;
		cursor: pointer;
	}

	.save-button:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.save-feedback {
		font-size: 0.9rem;
	}

	.save-feedback--ok {
		color: var(--color-success, #15803d);
	}

	.save-feedback--err {
		color: var(--color-danger, #b91c1c);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
