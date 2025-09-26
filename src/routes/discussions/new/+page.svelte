<script lang="ts">
	import { page } from '$app/stores';
	import { nhost } from '$lib/nhostClient';
	import { goto } from '$app/navigation';
	import {
		WRITING_STYLES,
		getStyleConfig,
		validateStyleRequirements,
		type WritingStyle,
		type StyleMetadata,
		type Citation
	} from '$lib/types/writingStyle';
	import CitationForm from '$lib/components/CitationForm.svelte';

	// --- State (Runes) ---
	let user = $state(nhost.auth.getUser());
	nhost.auth.onAuthStateChanged(() => {
		user = nhost.auth.getUser();
	});

	let title = $state('');
	let content = $state('');
	let discussionId = $state<string | null>(null);
	let publishing = $state(false);
	let publishError = $state<string | null>(null);
	let lastSavedAt = $state<number | null>(null);
	let autoSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	// Writing style state (automatically inferred)
	let styleMetadata = $state<StyleMetadata>({});
	let styleValidation = $state<{ isValid: boolean; issues: string[] }>({
		isValid: true,
		issues: []
	});
	let wordCount = $state(0);
	let showCitationReminder = $state(false);

	// Automatically infer writing style based on content length
	function getInferredStyle(): WritingStyle {
		if (wordCount <= 100) return 'quick_point';
		if (wordCount <= 500) return 'journalistic';
		return 'academic';
	}

	let selectedStyle = $derived(getInferredStyle());

	// Citation management
	let showCitationForm = $state(false);
	const hasCitations = $derived(Array.isArray(styleMetadata.citations) && styleMetadata.citations.length > 0);

	// GraphQL mutation documents (without writing style fields until migration is applied)
	const CREATE_DISCUSSION = `mutation CreateDiscussion($title: String!, $description: String, $authorId: uuid!) { insert_discussion_one(object:{ title:$title, description:$description, created_by:$authorId }) { id } }`;
	const UPDATE_DISCUSSION = `mutation UpdateDiscussion($id: uuid!, $title: String!, $description: String!) { update_discussion_by_pk(pk_columns: {id: $id}, _set: {title: $title, description: $description}) { id title description } }`;

	async function createDraftDiscussion() {
		if (!user || discussionId) return;
		console.log('Creating draft discussion...');
		try {
			const discTitle = title.trim() || 'Untitled Discussion';
			const { data: discData, error: discError } = await nhost.graphql.request(CREATE_DISCUSSION, {
				title: discTitle,
				description: content || '',
				authorId: user.id
			});
			if (discError) {
				console.error('Failed to create discussion:', discError);
				return;
			}

			const newDiscussionId = (discData as any)?.insert_discussion_one?.id;
			if (newDiscussionId) {
				discussionId = newDiscussionId;
				lastSavedAt = Date.now();
				console.log('Draft discussion created:', newDiscussionId);
			}
		} catch (e) {
			console.error('Failed to create draft discussion:', e);
		}
	}

	async function autoSaveDiscussion() {
		if (!discussionId || !user) return;

		try {
			const { error } = await nhost.graphql.request(UPDATE_DISCUSSION, {
				id: discussionId,
				title: title.trim() || 'Untitled Discussion',
				description: content || ''
			});

			if (!error) {
				lastSavedAt = Date.now();
				console.log('Discussion auto-saved');
			}
		} catch (e) {
			console.error('Auto-save failed:', e);
		}
	}

	function scheduleAutoSave() {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}
		autoSaveTimeout = setTimeout(() => {
			if (discussionId) {
				autoSaveDiscussion();
			} else if (user && (title.trim() || content.trim())) {
				createDraftDiscussion();
			}
		}, 1500); // Auto-save after 1.5 seconds of no typing
	}

	function onTitleInput(e: Event) {
		title = (e.target as HTMLInputElement).value;
		scheduleAutoSave();
	}

	function onContentInput(e: Event) {
		content = (e.target as HTMLTextAreaElement).value;

		// Calculate word count
		wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

		// Show citation reminder based on content and style
		const hasNoCitations = !styleMetadata.citations || styleMetadata.citations.length === 0;
		const hasSubstantialContent = wordCount >= 50; // Any meaningful content can benefit from citations
		showCitationReminder = hasSubstantialContent && hasNoCitations;

		// Update style validation using the derived selectedStyle
		styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);

		// Schedule auto-save
		scheduleAutoSave();
	}

	function addCitation(citation: Citation) {
		if (!styleMetadata.citations) {
			styleMetadata.citations = [];
		}
		styleMetadata.citations = [...styleMetadata.citations, citation];
		showCitationForm = false;

		// Update citation reminder status
		const hasSubstantialContent = wordCount >= 50;
		showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;

		styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
	}

	function removeCitation(id: string) {
		if (styleMetadata.citations) {
			styleMetadata.citations = styleMetadata.citations.filter((c) => c.id !== id);

			// Update citation reminder status
			const hasSubstantialContent = wordCount >= 50;
			showCitationReminder = hasSubstantialContent && styleMetadata.citations.length === 0;

			styleValidation = validateStyleRequirements(selectedStyle, content, styleMetadata);
		}
	}

	function showAddCitationForm() {
		showCitationForm = true;
	}

	async function publishNewDiscussion() {
		publishError = null;
		if (!user) {
			publishError = 'Sign in required.';
			return;
		}
		if (!title.trim()) {
			publishError = 'Title required.';
			return;
		}
		if (!content.trim()) {
			publishError = 'Content required.';
			return;
		}
		// Temporarily disable style validation until migration is applied
		// if (!styleValidation.isValid) {
		//   publishError = `Style requirements not met: ${styleValidation.issues.join(', ')}`;
		//   return;
		// }

		publishing = true;
		try {
			// If we don't have a discussion yet, create one
			if (!discussionId) {
				await createDraftDiscussion();
				if (!discussionId) {
					throw new Error('Failed to create discussion');
				}
			}

			// Final save with current content
			await autoSaveDiscussion();

			// Navigate to the discussion
			goto(`/discussions/${discussionId}`);
		} catch (e: any) {
			publishError = e.message || 'Failed to publish.';
		} finally {
			publishing = false;
		}
	}

	const canPublish = $derived(
		() => !!user && title.trim().length > 0 && content.trim().length > 0 && !publishing
	);
</script>

<!-- Immersive background -->
<div class="page-background">
  <div class="floating-gradient gradient-1"></div>
  <div class="floating-gradient gradient-2"></div>
  <div class="floating-gradient gradient-3"></div>
</div>

<div class="container">
	<div class="glass-card main-card">
		<h1 class="page-title">Create a New Discussion</h1>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				publishNewDiscussion();
			}}
		>
		<div class="form-group">
			<label for="title">Title</label>
			<input
				id="title"
				type="text"
				bind:value={title}
				placeholder="Enter a clear and concise title"
				oninput={onTitleInput}
				required
			/>
		</div>

		<div class="form-group">
			<label for="description">Description</label>
			<textarea
				id="description"
				bind:value={content}
				rows="8"
				placeholder="Share your thoughts... (Style will be automatically determined by length)"
				oninput={onContentInput}
			></textarea>
			<div class="word-count">
				<span class="word-count-label">Words: {wordCount}</span>
				<span class="style-indicator">({getStyleConfig(selectedStyle).label})</span>
			</div>

      		<!-- Word Count and Style Info -->
		<div class="form-group">
			<div class="writing-info">
				<div class="citation-reminder" class:active={showCitationReminder}>
					<div class="reminder-icon">📚</div>
					<div class="reminder-text">
						<strong>{showCitationReminder ? 'Add citations' : 'Cite your sources'}</strong>
						<span
							>{showCitationReminder
								? 'Support your claims with references for better credibility.'
								: 'Adding sources now makes it easier to reference them later.'}</span
						>
					</div>
					<button
						type="button"
						class="btn-add-citation-inline"
						onclick={() => showAddCitationForm()}
					>
						Add Citation
					</button>
				</div>
			</div>
		</div>

		<!-- Citations Management -->
		<div class="form-group">
			<div class="citations-section">
				<div class="citations-header">
					<h3>Citations</h3>
				</div>

				<!-- Display existing citations -->
				{#if styleMetadata.citations && styleMetadata.citations.length > 0}
					<div class="citations-list">
						{#each styleMetadata.citations as citation}
							<div class="citation-item">
								<div class="citation-content">
									<div class="citation-title">{citation.title}</div>
									<div class="citation-details">
										{#if citation.author}<strong>{citation.author}</strong>{/if}
										{#if citation.publishDate}({citation.publishDate}){/if}
										{#if citation.publisher}. {citation.publisher}{/if}
										{#if citation.pageNumber}, p. {citation.pageNumber}{/if}
										{#if citation.accessed}. Accessed: {citation.accessed}{/if}
									</div>
									<div class="citation-point">
										<strong>Supporting:</strong>
										{citation.pointSupported}
									</div>
									<div class="citation-quote">
										<strong>Quote:</strong> "{citation.relevantQuote}"
									</div>
									<div class="citation-url">
										<a href={citation.url} target="_blank" rel="noopener">{citation.url}</a>
									</div>
								</div>
								<button
									type="button"
									class="remove-citation"
									onclick={() => removeCitation(citation.id)}>×</button
								>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Citation Form -->
				{#if showCitationForm}
					<CitationForm onAdd={addCitation} onCancel={() => (showCitationForm = false)} />
				{/if}
			</div>
		</div>

			<!-- Style Validation -->
			{#if !styleValidation.isValid}
				<div class="style-validation-errors">
					{#each styleValidation.issues as issue}
						<div class="validation-issue">{issue}</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="autosave-indicator" aria-live="polite">
			{#if discussionId && lastSavedAt}
				Draft saved {new Date(lastSavedAt).toLocaleTimeString()}
			{:else if discussionId}
				Draft created
			{/if}
		</div>

		{#if publishError}
			<div class="error-message">
				{publishError}
			</div>
		{/if}

		<div class="form-actions">
			<button class="btn-primary" type="submit" disabled={!canPublish}>
				{publishing ? 'Publishing…' : 'Publish Discussion'}
			</button>
			<button type="button" class="btn-secondary" onclick={() => goto('/')}>Cancel</button>
		</div>
	</form>
	</div>
</div>

<style>
	/* Immersive background */
	.page-background {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -1;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-alt)),
			color-mix(in srgb, var(--color-accent) 6%, var(--color-surface-alt)),
			var(--color-surface-alt)
		);
	}

	.floating-gradient {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		opacity: 0.3;
		animation: float 20s ease-in-out infinite;
	}

	.gradient-1 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, var(--color-primary), transparent);
		top: 10%;
		right: 10%;
		animation-delay: -5s;
	}

	.gradient-2 {
		width: 300px;
		height: 300px;
		background: radial-gradient(circle, var(--color-accent), transparent);
		bottom: 20%;
		left: 15%;
		animation-delay: -10s;
	}

	.gradient-3 {
		width: 250px;
		height: 250px;
		background: radial-gradient(circle, color-mix(in srgb, var(--color-primary) 70%, var(--color-accent)), transparent);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		animation-delay: -15s;
	}

	@keyframes float {
		0%, 100% { transform: translateY(0px) rotate(0deg); }
		33% { transform: translateY(-30px) rotate(120deg); }
		66% { transform: translateY(15px) rotate(240deg); }
	}

	/* Glass morphism effects */
	.glass-card {
		background: color-mix(in srgb, var(--color-surface) 40%, transparent);
		backdrop-filter: blur(20px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 24px;
		box-shadow:
			0 8px 32px color-mix(in srgb, var(--color-primary) 8%, transparent),
			0 2px 8px color-mix(in srgb, var(--color-text-primary) 4%, transparent);
		position: relative;
		overflow: hidden;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.glass-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-border) 50%, transparent), transparent);
	}

	.glass-card:hover {
		transform: translateY(-2px);
		box-shadow:
			0 12px 40px color-mix(in srgb, var(--color-primary) 12%, transparent),
			0 4px 12px color-mix(in srgb, var(--color-text-primary) 6%, transparent);
	}

	/* Layout */
	.container {
		min-height: 100vh;
		padding: clamp(1rem, 4vw, 2rem);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		position: relative;
	}

	.main-card {
		width: 100%;
		max-width: 800px;
		padding: 2rem;
		margin-top: 2rem;
	}

	.page-title {
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 700;
		font-family: var(--font-family-display);
		margin: 0 0 2rem 0;
		color: var(--color-text-primary);
		text-shadow: 0 2px 4px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	label {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 1rem;
	}

	input[type='text'],
	textarea {
		padding: 1rem 1.25rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		font-family: inherit;
	}

	input[type='text']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
		transform: translateY(-1px);
	}

	textarea {
		resize: vertical;
		min-height: 200px;
		line-height: 1.6;
	}

	.autosave-indicator {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.5rem;
		font-weight: 500;
	}

	/* Buttons */
	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: #ffffff;
		border: none;
		padding: 1rem 2rem;
		border-radius: 16px;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 20%, transparent);
		position: relative;
		overflow: hidden;
	}

	:global([data-theme="dark"]) .btn-primary {
		color: #000000;
		text-shadow: 0 1px 2px rgba(255, 255, 255, 0.1);
	}

	.btn-primary::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		transition: left 0.5s;
	}

	.btn-primary:hover::before {
		left: 100%;
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.btn-secondary {
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		padding: 1rem 2rem;
		border-radius: 16px;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.btn-secondary:hover {
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
		transform: translateY(-1px);
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-start;
		margin-top: 1rem;
	}

	.error-message {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		color: #ef4444;
		padding: 1rem;
		border-radius: 16px;
		font-weight: 500;
		backdrop-filter: blur(10px);
	}

	/* Writing Info and Citation Reminder */
	.writing-info {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.word-count {
		display: flex;
		align-items: center;
		align-self: flex-end;
		gap: 0.75rem;
		font-size: 0.9rem;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
		backdrop-filter: blur(10px);
	}

	.word-count-label {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.style-indicator {
		color: var(--color-text-secondary);
		font-style: italic;
		font-weight: 500;
	}

	.citation-reminder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-radius: 20px;
		border: 1px dashed color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 30%, transparent);
		backdrop-filter: blur(15px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.citation-reminder.active {
		background: linear-gradient(135deg,
			color-mix(in srgb, #f59e0b 20%, transparent),
			color-mix(in srgb, #f59e0b 10%, transparent)
		);
		border-color: color-mix(in srgb, #f59e0b 50%, transparent);
		box-shadow: 0 8px 24px color-mix(in srgb, #f59e0b 15%, transparent);
	}

	.citation-reminder .reminder-icon {
		font-size: 1.5rem;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
	}

	.citation-reminder .reminder-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.95rem;
		color: var(--color-text-secondary);
		flex: 1;
	}

	.citation-reminder .reminder-text strong {
		font-size: 1.05rem;
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.citation-reminder.active .reminder-text strong {
		color: #92400e;
	}

	.citation-reminder.active .reminder-text span {
		color: #b45309;
		font-weight: 500;
	}

	.btn-add-citation-inline {
		background: linear-gradient(135deg, #f59e0b, #d97706);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		box-shadow: 0 4px 12px color-mix(in srgb, #f59e0b 20%, transparent);
	}

	.btn-add-citation-inline:hover {
		background: linear-gradient(135deg, #d97706, #b45309);
		transform: translateY(-1px);
		box-shadow: 0 6px 16px color-mix(in srgb, #f59e0b 25%, transparent);
	}

	@media (max-width: 640px) {
		.btn-add-citation-inline {
			width: 100%;
			justify-content: center;
		}

		.citation-reminder {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}
	}

	.style-validation-errors {
		background: color-mix(in srgb, #ef4444 15%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		border-radius: 16px;
		padding: 1rem;
		margin-top: 1rem;
		backdrop-filter: blur(10px);
	}

	.validation-issue {
		font-size: 0.9rem;
		color: #ef4444;
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.validation-issue:last-child {
		margin-bottom: 0;
	}

	/* Citations Section */
	.citations-section {
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 20px;
		padding: 1.5rem;
		backdrop-filter: blur(15px);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-text-primary) 3%, transparent);
	}

	.citations-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.citations-header h3 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.citations-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.citation-item {
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
		border-radius: 16px;
		padding: 1.5rem;
		position: relative;
		backdrop-filter: blur(10px);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.citation-item:hover {
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.citation-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-right: 2rem;
	}

	.citation-title {
		font-weight: 600;
		color: var(--color-text-primary);
		line-height: 1.4;
		font-size: 1rem;
	}

	.citation-details {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.citation-point,
	.citation-quote {
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.citation-quote {
		font-style: italic;
		padding: 0.75rem;
		margin: 0.5rem 0;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		border-left: 4px solid var(--color-primary);
		border-radius: 0 12px 12px 0;
		backdrop-filter: blur(5px);
	}

	.citation-url {
		font-size: 0.85rem;
	}

	.citation-url a {
		color: var(--color-primary);
		text-decoration: none;
		word-break: break-all;
		font-weight: 500;
		transition: color 0.3s ease;
	}

	.citation-url a:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.remove-citation {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: linear-gradient(135deg, #ef4444, #dc2626);
		color: white;
		border: none;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 2px 8px color-mix(in srgb, #ef4444 25%, transparent);
	}

	.remove-citation:hover {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, #ef4444 30%, transparent);
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.main-card {
			padding: 1.5rem;
			margin-top: 1rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.btn-primary,
		.btn-secondary {
			width: 100%;
			text-align: center;
		}

		.citation-content {
			padding-right: 2.5rem;
		}
	}

	@media (max-width: 480px) {
		.container {
			padding: 1rem;
		}

		.main-card {
			padding: 1rem;
			border-radius: 20px;
		}

		.citations-section {
			padding: 1rem;
		}

		.citation-item {
			padding: 1rem;
		}
	}
</style>
