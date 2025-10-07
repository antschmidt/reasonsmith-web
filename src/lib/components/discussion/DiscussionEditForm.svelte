<script lang="ts">
	import CitationForm from '../citations/CitationForm.svelte';
	import Button from '../ui/Button.svelte';
	import AnimatedLogo from '../ui/AnimatedLogo.svelte';
	import CitationsList from '../citations/CitationsList.svelte';

	type Citation = {
		id: string;
		title: string;
		url: string;
		author?: string;
		publisher?: string;
		publish_date?: string;
		accessed_date?: string;
		page_number?: string;
		point_supported: string;
		relevant_quote: string;
	};

	type StyleMetadata = {
		citations?: Citation[];
	};

	type GoodFaithResult = {
		good_faith_score: number;
		good_faith_label: string;
		claims?: Array<{
			claim: string;
			arguments?: Array<{
				text: string;
				score: number;
				suggestions?: string[];
				fallacies?: string[];
				manipulativeLanguage?: string[];
			}>;
		}>;
		rationale?: string;
		fromCache?: boolean;
	};

	type ClaudeGoodFaithResult = {
		good_faith_score: number;
		good_faith_label: string;
		claims?: Array<{
			claim: string;
			supportingArguments?: Array<{
				argument: string;
				score: number;
				fallacies?: string[];
				improvements?: string;
			}>;
		}>;
		cultishPhrases?: string[];
		rationale?: string;
		fromCache?: boolean;
	};

	let {
		title = $bindable(''),
		description = $bindable(''),
		styleMetadata = $bindable<StyleMetadata>({ citations: [] }),
		showCitationForm = $bindable(false),
		showCitationEditForm = $bindable(false),
		editingCitation = $bindable<Citation | null>(null),
		showCitationPicker = $bindable(false),
		heuristicScore = 0,
		heuristicPassed = true,
		goodFaithTesting = false,
		claudeGoodFaithTesting = false,
		goodFaithResult = null as GoodFaithResult | null,
		goodFaithError = null as string | null,
		claudeGoodFaithResult = null as ClaudeGoodFaithResult | null,
		claudeGoodFaithError = null as string | null,
		lastSavedAt = null as number | null,
		submitError = null as string | null,
		publishLoading = false,
		hasUnsavedChanges = false,
		contributor = null,
		onTitleInput,
		onDescriptionInput,
		onAddCitation,
		onUpdateCitation,
		onRemoveCitation,
		onStartEditCitation,
		onCancelCitationEdit,
		onInsertCitationReference,
		onOpenCitationPicker,
		onTestGoodFaith,
		onTestGoodFaithClaude,
		onPublish,
		onCancel,
		getAnalysisLimitText,
		formatChicagoCitation,
		assessContentQuality
	} = $props<{
		title?: string;
		description?: string;
		styleMetadata?: StyleMetadata;
		showCitationForm?: boolean;
		showCitationEditForm?: boolean;
		editingCitation?: Citation | null;
		showCitationPicker?: boolean;
		heuristicScore?: number;
		heuristicPassed?: boolean;
		goodFaithTesting?: boolean;
		claudeGoodFaithTesting?: boolean;
		goodFaithResult?: GoodFaithResult | null;
		goodFaithError?: string | null;
		claudeGoodFaithResult?: ClaudeGoodFaithResult | null;
		claudeGoodFaithError?: string | null;
		lastSavedAt?: number | null;
		submitError?: string | null;
		publishLoading?: boolean;
		hasUnsavedChanges?: boolean;
		contributor?: any;
		onTitleInput?: (e: Event) => void;
		onDescriptionInput?: (e: Event) => void;
		onAddCitation?: (citation: Citation) => void;
		onUpdateCitation?: (citation: Citation) => void;
		onRemoveCitation?: (id: string) => void;
		onStartEditCitation?: (id: string) => void;
		onCancelCitationEdit?: () => void;
		onInsertCitationReference?: (id: string) => void;
		onOpenCitationPicker?: () => void;
		onTestGoodFaith?: () => void;
		onTestGoodFaithClaude?: () => void;
		onPublish?: () => void;
		onCancel?: () => void;
		getAnalysisLimitText: () => string;
		formatChicagoCitation: (citation: Citation) => string;
		assessContentQuality: (content: string, title?: string) => { score: number; issues: string[] };
	}>();
</script>

<form
	class="edit-form"
	onsubmit={(e) => {
		e.preventDefault();
		onPublish?.();
	}}
>
	<label>
		Title
		<input type="text" bind:value={title} oninput={onTitleInput} />
	</label>

	<label>
		Description
		<textarea
			id="edit-description"
			rows="30"
			bind:value={description}
			oninput={onDescriptionInput}
		></textarea>
	</label>

	<!-- Analysis limit display -->
	{#if contributor}
		<div class="analysis-limit-info">
			{getAnalysisLimitText()}
		</div>
	{/if}

	<!-- Good Faith Testing and Citation Buttons -->
	<div style="display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.5rem 0;">
		<button
			type="button"
			class="good-faith-test-btn openai"
			onclick={onTestGoodFaith}
			disabled={goodFaithTesting || !description.trim() || !heuristicPassed}
		>
			{#if goodFaithTesting}
				<AnimatedLogo size="16px" isAnimating={true} />
				OpenAI...
			{:else}
				🤔 OpenAI Test
			{/if}
		</button>
		<button
			type="button"
			class="good-faith-test-btn claude"
			onclick={onTestGoodFaithClaude}
			disabled={claudeGoodFaithTesting || !description.trim() || !heuristicPassed}
		>
			{#if claudeGoodFaithTesting}
				<AnimatedLogo size="16px" isAnimating={true} />
				Claude...
			{:else}
				🧠 Claude Test
			{/if}
		</button>
		<button type="button" class="insert-citation-btn" onclick={onOpenCitationPicker}>
			📎 Insert Citation Reference
		</button>
	</div>

	<!-- Good Faith Test Results (OpenAI) -->
	{#if goodFaithResult}
		<div class="analysis-panel">
			<div class="analysis-summary">
				<div class="analysis-badge {goodFaithResult.good_faith_label}">
					<span class="analysis-score"
						>{(goodFaithResult.good_faith_score * 100).toFixed(0)}%</span
					>
					<span class="analysis-label">{goodFaithResult.good_faith_label}</span>
				</div>
				<div class="analysis-meta">
					<span class="analysis-provider">OpenAI Analysis</span>
					{#if goodFaithResult.fromCache}
						<span class="cache-indicator" title="Loaded from cache">💾</span>
					{/if}
				</div>
			</div>

			{#if goodFaithResult.claims && goodFaithResult.claims.length > 0}
				<div class="analysis-content">
					{#each goodFaithResult.claims as claim}
						<div class="claim-analysis">
							<div class="claim-statement">{claim.claim}</div>
							{#if claim.arguments}
								{#each claim.arguments as arg}
									<div class="argument-card">
										<div class="argument-content">
											<div class="argument-text">{arg.text}</div>
											<div class="argument-metrics">
												<span
													class="argument-score"
													class:strong={arg.score >= 7}
													class:moderate={arg.score >= 4 && arg.score < 7}
													class:weak={arg.score < 4}
												>
													{arg.score}/10
												</span>
											</div>
										</div>

										{#if arg.suggestions && arg.suggestions.length > 0}
											<div class="improvements-section">
												<div class="improvements-label">💡 Suggested improvements</div>
												<ul class="improvements-list">
													{#each arg.suggestions as suggestion}
														<li>{suggestion}</li>
													{/each}
												</ul>
											</div>
										{/if}

										{#if (arg.fallacies && arg.fallacies.length > 0) || (arg.manipulativeLanguage && arg.manipulativeLanguage.length > 0)}
											<div class="issues-section">
												{#if arg.fallacies && arg.fallacies.length > 0}
													<div class="issue-item">
														<span class="issue-label">⚠️ Logical issues:</span>
														<span class="issue-text">{arg.fallacies.join(', ')}</span>
													</div>
												{/if}
												{#if arg.manipulativeLanguage && arg.manipulativeLanguage.length > 0}
													<div class="issue-item">
														<span class="issue-label">🚩 Language concerns:</span>
														<span class="issue-text">{arg.manipulativeLanguage.join(', ')}</span>
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if goodFaithResult.rationale}
				<div class="analysis-summary-text">
					{goodFaithResult.rationale}
				</div>
			{/if}

			<button
				type="button"
				class="analysis-close-btn"
				onclick={() => (goodFaithResult = null)}
				aria-label="Close analysis"
			>
				✕
			</button>
		</div>
	{/if}

	{#if goodFaithError}
		<div class="good-faith-error">
			<strong>OpenAI Error:</strong>
			{goodFaithError}
			<button type="button" class="close-result-btn" onclick={() => (goodFaithError = null)}
				>✕</button
			>
		</div>
	{/if}

	<!-- Claude Good Faith Test Results -->
	{#if claudeGoodFaithResult}
		<div class="good-faith-result claude-result">
			<div class="good-faith-header">
				<h4>
					Claude Analysis
					{#if claudeGoodFaithResult.fromCache}
						<span class="cache-indicator" title="Loaded from cache">💾</span>
					{/if}
				</h4>
				<div class="good-faith-score">
					<span class="score-value"
						>{(claudeGoodFaithResult.good_faith_score * 100).toFixed(0)}%</span
					>
					<span class="score-label {claudeGoodFaithResult.good_faith_label}"
						>{claudeGoodFaithResult.good_faith_label}</span
					>
				</div>
			</div>

			{#if claudeGoodFaithResult.claims && claudeGoodFaithResult.claims.length > 0}
				<div class="claude-claims">
					<strong>Claims Analysis:</strong>
					{#each claudeGoodFaithResult.claims as claim}
						<div class="claim-item">
							<div class="claim-text"><strong>Claim:</strong> {claim.claim}</div>
							{#if claim.supportingArguments}
								{#each claim.supportingArguments as arg}
									<div class="argument-item">
										<div class="argument-text">{arg.argument}</div>
										<div class="argument-details">
											<span class="argument-score">Score: {arg.score}/10</span>
											{#if arg.fallacies && arg.fallacies.length > 0}
												<span class="fallacies">Fallacies: {arg.fallacies.join(', ')}</span>
											{/if}
										</div>
										{#if arg.improvements}
											<div class="improvements">Improvement: {arg.improvements}</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if claudeGoodFaithResult.cultishPhrases && claudeGoodFaithResult.cultishPhrases.length > 0}
				<div class="cultish-phrases">
					<strong>Manipulative Language:</strong>
					{claudeGoodFaithResult.cultishPhrases.join(', ')}
				</div>
			{/if}

			<div class="good-faith-rationale">
				<strong>Analysis:</strong>
				{claudeGoodFaithResult.rationale}
			</div>
			<button
				type="button"
				class="close-result-btn"
				onclick={() => (claudeGoodFaithResult = null)}>✕</button
			>
		</div>
	{/if}

	{#if claudeGoodFaithError}
		<div class="good-faith-error">
			<strong>Claude Error:</strong>
			{claudeGoodFaithError}
			<button
				type="button"
				class="close-result-btn"
				onclick={() => (claudeGoodFaithError = null)}>✕</button
			>
		</div>
	{/if}

	<!-- Citation/Source Management -->
	<div class="citation-section">
		<div class="citation-header">
			<h4>References</h4>
			<div class="citation-buttons">
				<Button type="button" variant="secondary" size="sm" onclick={() => (showCitationForm = true)}>
					Add Citation
				</Button>
			</div>
		</div>

		<!-- Add Citation Form -->
		{#if showCitationForm && !editingCitation}
			<CitationForm onAdd={onAddCitation} onCancel={() => (showCitationForm = false)} />
		{/if}

		<!-- Edit Citation Form -->
		{#if showCitationEditForm && editingCitation}
			<CitationForm
				editingItem={editingCitation}
				onAdd={onUpdateCitation}
				onCancel={onCancelCitationEdit}
			/>
		{/if}

		<!-- Display existing citations -->
		{#if styleMetadata.citations?.length}
			<CitationsList
				citations={styleMetadata.citations}
				onInsert={onInsertCitationReference}
				onEdit={onStartEditCitation}
				onRemove={onRemoveCitation}
			/>
		{/if}
	</div>

	<!-- Citation Picker Modal -->
	{#if showCitationPicker}
		{@const allCitations = styleMetadata.citations || []}
		<div class="citation-picker-overlay">
			<div class="citation-picker-modal">
				<div class="citation-picker-header">
					<h4>Insert Citation Reference</h4>
					<button type="button" class="close-btn" onclick={() => (showCitationPicker = false)}
						>✕</button
					>
				</div>
				<div class="citation-picker-content">
					<p>Click on a reference below to insert it at your cursor position:</p>
					<div class="picker-references-list">
						{#each allCitations as item, index}
							<button
								type="button"
								class="picker-reference-item"
								onclick={() => {
									onInsertCitationReference?.(item.id);
									showCitationPicker = false;
								}}
							>
								<div class="picker-citation-number">[{index + 1}]</div>
								<div class="picker-citation-preview">
									{@html formatChicagoCitation(item)}
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Heuristic Quality Assessment -->
	{#if heuristicScore < 50}
		{@const assessment = assessContentQuality(description, title)}
		<div class="heuristic-quality-indicator">
			<h5>Content Quality: {heuristicScore}% (50% required)</h5>
			<div class="quality-progress">
				<div class="quality-bar" style="width: {heuristicScore}%"></div>
			</div>
			{#if assessment.issues.length > 0}
				<ul class="quality-issues">
					{#each assessment.issues as issue}
						<li>{issue}</li>
					{/each}
				</ul>
			{/if}
			<p class="quality-note">
				Good faith analysis and publishing are disabled until 50% quality threshold is met.
			</p>
		</div>
	{:else}
		<div class="heuristic-quality-indicator passed">
			<h5>✅ Content Quality: {heuristicScore}% - Ready for analysis and publishing</h5>
			<div class="quality-progress">
				<div class="quality-bar passed" style="width: {heuristicScore}%"></div>
			</div>
		</div>
	{/if}

	<!-- Autosave Indicator -->
	<div class="edit-autosave-indicator">
		<div class="autosave-status">
			{#if lastSavedAt}
				Auto-saved {new Date(lastSavedAt).toLocaleTimeString()}
			{/if}
		</div>
		{#if contributor}
			<div class="credit-status-inline">
				Credits: {getAnalysisLimitText()}
			</div>
		{/if}
	</div>

	{#if submitError}
		<p class="error-message">{submitError}</p>
	{/if}

	<!-- Action Buttons -->
	<div style="display:flex; gap:0.5rem;">
		<button
			class="btn-primary"
			type="submit"
			disabled={publishLoading || !hasUnsavedChanges || (!heuristicPassed && contributor?.role !== 'slartibartfast' && contributor?.role !== 'admin')}
		>
			{publishLoading ? 'Publishing…' : 'Publish Changes'}
		</button>
		<button type="button" class="btn-secondary" onclick={onCancel}>Cancel</button>
	</div>
</form>

<style>
	.edit-form {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: var(--color-surface-alt);
		color: var(--color-text-primary);
		padding: 1rem;
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
	}

	.edit-form label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.edit-form input[type='text'],
	.edit-form textarea {
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-input-bg);
		color: var(--color-text-primary);
		font: inherit;
	}

	.edit-form input:focus,
	.edit-form textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	/* Analysis Limit Info */
	.analysis-limit-info {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
		font-style: italic;
	}

	/* Good Faith Test Buttons */
	.good-faith-test-btn {
		border: none;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: white;
	}

	.good-faith-test-btn.openai {
		background: #3b82f6;
	}

	.good-faith-test-btn.openai:hover:not(:disabled) {
		background: #2563eb;
	}

	.good-faith-test-btn.claude {
		background: #d97706;
	}

	.good-faith-test-btn.claude:hover:not(:disabled) {
		background: #b45309;
	}

	.good-faith-test-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.insert-citation-btn {
		background: var(--color-secondary, #6b7280);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
		cursor: pointer;
		transition: opacity 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.insert-citation-btn:hover {
		opacity: 0.8;
	}

	/* Analysis Panel - Sleek Design */
	.analysis-panel {
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 1rem 0;
		margin: 1rem 0;
		position: relative;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
	}

	.analysis-summary {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.analysis-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem;
		min-width: 70px;
		color: var(--color-text-secondary);
	}

	.analysis-score {
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1;
	}

	.analysis-label {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-text-secondary);
		text-transform: capitalize;
		margin-top: 0.25rem;
		opacity: 0.7;
	}

	.analysis-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.analysis-provider {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.cache-indicator {
		font-size: 0.8rem;
		margin-left: 0.5rem;
		opacity: 0.7;
	}

	/* Analysis Content */
	.analysis-content {
		margin-top: 1rem;
	}

	.claim-analysis {
		margin-bottom: 1.5rem;
	}

	.claim-statement {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg-primary));
		border-left: 3px solid var(--color-primary);
		border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
	}

	.argument-card {
		background: var(--color-bg-secondary);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
		border-radius: var(--border-radius-sm);
		padding: 1rem;
		margin: 0.75rem 0;
	}

	.argument-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
	}

	.argument-text {
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--color-text-primary);
		flex: 1;
		margin-right: 1rem;
	}

	.argument-metrics {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.argument-score {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
	}

	.argument-score.strong {
		background: color-mix(in srgb, #10b981 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #10b981 30%, transparent);
		color: #059669;
	}

	.argument-score.moderate {
		background: color-mix(in srgb, #f59e0b 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #f59e0b 30%, transparent);
		color: #d97706;
	}

	.argument-score.weak {
		background: color-mix(in srgb, #ef4444 15%, var(--color-bg-primary));
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
		color: #dc2626;
	}

	.improvements-section {
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
	}

	.improvements-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.improvements-list {
		margin: 0;
		padding-left: 1.25rem;
		list-style: none;
	}

	.improvements-list li {
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
		margin-bottom: 0.25rem;
		position: relative;
	}

	.improvements-list li::before {
		content: '→';
		position: absolute;
		left: -1rem;
		color: var(--color-primary);
		font-weight: 600;
	}

	.issues-section {
		border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.issue-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.issue-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.issue-text {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.3;
	}

	.analysis-summary-text {
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
	}

	.analysis-close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0.25rem;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.analysis-close-btn:hover {
		background: color-mix(in srgb, var(--color-text-secondary) 10%, transparent);
		color: var(--color-text-primary);
	}

	/* Good Faith Result - Claude Styling */
	.good-faith-result {
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin: 1rem 0;
		border-left: 4px solid var(--color-primary);
	}

	.claude-result {
		border-left-color: #d97706;
	}

	.good-faith-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.good-faith-header h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	.good-faith-score {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.score-value {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}

	.score-label {
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
	}

	.score-label.hostile {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		color: #f87171;
	}

	.score-label.questionable {
		background: color-mix(in srgb, #f59e0b 8%, transparent);
		color: #fbbf24;
	}

	.score-label.neutral {
		background: color-mix(in srgb, #6b7280 8%, transparent);
		color: #9ca3af;
	}

	.score-label.constructive {
		background: color-mix(in srgb, #10b981 8%, transparent);
		color: #34d399;
	}

	.score-label.exemplary {
		background: color-mix(in srgb, #059669 8%, transparent);
		color: #34d399;
	}

	.claude-claims {
		margin: 0.75rem 0;
		font-size: 0.9rem;
	}

	.claim-item {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
	}

	.claim-text {
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.argument-item {
		margin: 0.5rem 0;
		padding-left: 1rem;
		border-left: 2px solid var(--color-border);
	}

	.argument-details {
		display: flex;
		gap: 1rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.fallacies {
		color: #dc2626;
	}

	.improvements {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		font-style: italic;
		color: var(--color-text-secondary);
	}

	.cultish-phrases {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border-radius: var(--border-radius-sm);
		background: color-mix(in srgb, #dc2626 5%, var(--color-surface-alt));
	}

	.good-faith-rationale {
		font-size: 0.9rem;
		line-height: 1.4;
		color: var(--color-text-secondary);
	}

	.good-faith-error {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid #ef4444;
		border-radius: var(--border-radius-md);
		padding: 1rem;
		margin: 1rem 0;
		color: #dc2626;
		position: relative;
	}

	.close-result-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		font-size: 1rem;
		padding: 0.25rem;
		border-radius: 4px;
		transition: color 0.2s;
	}

	.close-result-btn:hover {
		color: var(--color-text-primary);
	}

	/* Citation Section */
	.citation-section {
		margin-bottom: 1rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface-alt);
	}

	.citation-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.citation-header h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--color-text-primary);
	}

	/* Citation Picker Modal */
	.citation-picker-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.citation-picker-modal {
		background: var(--color-surface);
		border-radius: var(--border-radius-md);
		padding: 1.5rem;
		max-width: 600px;
		max-height: 70vh;
		overflow: auto;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
	}

	.citation-picker-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.citation-picker-header h4 {
		margin: 0;
		color: var(--color-text-primary);
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.25rem;
	}

	.close-btn:hover {
		color: var(--color-text-primary);
	}

	.citation-picker-content p {
		margin: 0 0 1rem 0;
		color: var(--color-text-secondary);
	}

	.picker-references-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.picker-reference-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-sm);
		cursor: pointer;
		transition: background-color 0.2s;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.picker-reference-item:hover {
		background: var(--color-surface-alt);
	}

	.picker-citation-number {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 2rem;
	}

	.picker-citation-preview {
		font-size: 0.9rem;
		line-height: 1.4;
	}

	/* Quality Indicator */
	.heuristic-quality-indicator {
		padding: 1rem;
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		margin: 0.5rem 0;
	}

	.heuristic-quality-indicator.passed {
		border-color: #10b981;
		background: color-mix(in srgb, #10b981 5%, var(--color-surface-alt));
	}

	.heuristic-quality-indicator h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		color: var(--color-text-primary);
	}

	.quality-progress {
		height: 8px;
		background: var(--color-surface);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.quality-bar {
		height: 100%;
		background: #ef4444;
		transition: width 0.3s ease;
	}

	.quality-bar.passed {
		background: #10b981;
	}

	.quality-issues {
		margin: 0.5rem 0 0 0;
		padding-left: 1.5rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.quality-note {
		margin: 0.5rem 0 0 0;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Autosave Indicator */
	.edit-autosave-indicator {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0.5rem 0;
		min-height: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.autosave-status {
		display: flex;
		align-items: center;
	}

	.credit-status-inline {
		font-size: 0.65rem;
	}

	.error-message {
		color: #ef4444;
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}

	/* Action Buttons */
	.btn-primary,
	.btn-secondary {
		padding: 0.6rem 1.2rem;
		border-radius: var(--border-radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
		border: none;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		border: 1.5px solid var(--color-primary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-primary);
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent);
	}
</style>
