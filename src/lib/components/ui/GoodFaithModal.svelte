<script lang="ts">
	type AnalysisData = {
		score: number;
		label: string;
		lastEvaluated: string;
		analysis?: any;
		good_faith_score?: number;
		good_faith_label?: string;
		good_faith_last_evaluated?: string;
		good_faith_analysis?: any;
	};

	let {
		show = false,
		analysisData = null as AnalysisData | null,
		isDiscussion = false,
		onClose
	} = $props<{
		show?: boolean;
		analysisData?: AnalysisData | null;
		isDiscussion?: boolean;
		onClose?: () => void;
	}>();

	$effect(() => {
		if (show) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === 'Escape') onClose?.();
			};
			window.addEventListener('keydown', handleEscape);
			return () => window.removeEventListener('keydown', handleEscape);
		}
	});
</script>

{#if show && analysisData}
	<div
		class="good-faith-modal-overlay"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose?.()}
		role="presentation"
	>
		<div
			class="good-faith-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h3>Good Faith Analysis</h3>
				<button type="button" class="modal-close" onclick={onClose} aria-label="Close">✕</button>
			</div>

			<div class="modal-body">
				<div class="score-display">
					<div
						class="score-circle {isDiscussion ? analysisData.label : analysisData.good_faith_label}"
					>
						<span class="score-number">
							{isDiscussion
								? (analysisData.score * 100).toFixed(0)
								: (analysisData.good_faith_score! * 100).toFixed(0)}%
						</span>
						<span class="score-label">
							{isDiscussion ? analysisData.label : analysisData.good_faith_label}
						</span>
					</div>
					{#if isDiscussion ? analysisData.lastEvaluated : analysisData.good_faith_last_evaluated}
						<div class="evaluation-timestamp">
							Evaluated: {new Date(
								isDiscussion ? analysisData.lastEvaluated : analysisData.good_faith_last_evaluated!
							).toLocaleString()}
						</div>
					{/if}
				</div>

				{#if isDiscussion ? analysisData.analysis : analysisData.good_faith_analysis}
					{@const analysis = isDiscussion
						? analysisData.analysis
						: analysisData.good_faith_analysis}
					{#if typeof analysis === 'object'}
						<!-- Claims Analysis -->
						{#if analysis.claims && Array.isArray(analysis.claims) && analysis.claims.length > 0}
							<div class="analysis-block">
								<h4>Claims Analysis</h4>
								{#each analysis.claims as claim, index}
									<div class="claim-card">
										<div class="claim-header">
											<strong>Claim {index + 1}:</strong>
											{claim.claim}
										</div>
										{#if claim.supportingArguments || claim.arguments || claim.supporting_arguments}
											{@const args =
												claim.supportingArguments || claim.arguments || claim.supporting_arguments}
											<div class="arguments-list">
												{#each args as arg}
													<div class="argument-card">
														{#if arg.argument}
															<div class="argument-text">{arg.argument}</div>
														{/if}
														<div class="argument-meta">
															<span class="arg-score"
																>Score: {arg.score || arg.good_faith_score}/10</span
															>
															{#if arg.fallacies && arg.fallacies.length > 0}
																<span class="fallacies">⚠️ {arg.fallacies.join(', ')}</span>
															{/if}
														</div>
														{#if arg.improvements}
															<div class="improvements">💡 {arg.improvements}</div>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else if analysis.claims_analysis?.claims && Array.isArray(analysis.claims_analysis.claims)}
							<div class="analysis-block">
								<h4>Claims Analysis</h4>
								{#each analysis.claims_analysis.claims as claim, index}
									<div class="claim-card">
										<div class="claim-header">
											<strong>Claim {index + 1}:</strong>
											{claim.claim}
										</div>
										{#if claim.supporting_arguments && Array.isArray(claim.supporting_arguments)}
											<div class="arguments-list">
												{#each claim.supporting_arguments as arg}
													<div class="argument-card">
														<div class="argument-text">{arg.argument}</div>
														<div class="argument-meta">
															<span class="arg-score">Score: {arg.good_faith_score}/10</span>
															{#if arg.fallacies && arg.fallacies.length > 0}
																<span class="fallacies">⚠️ {arg.fallacies.join(', ')}</span>
															{/if}
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						<!-- Manipulative Language -->
						{#if analysis.cultishPhrases && Array.isArray(analysis.cultishPhrases) && analysis.cultishPhrases.length > 0}
							<div class="analysis-block warning">
								<h4>⚠️ Manipulative Language Detected</h4>
								<div class="phrase-list">
									{#each analysis.cultishPhrases as phrase}
										<span class="phrase-tag">{phrase}</span>
									{/each}
								</div>
							</div>
						{:else if analysis.manipulative_language && Array.isArray(analysis.manipulative_language) && analysis.manipulative_language.length > 0}
							<div class="analysis-block warning">
								<h4>⚠️ Manipulative Language Detected</h4>
								<div class="phrase-list">
									{#each analysis.manipulative_language as phrase}
										<span class="phrase-tag">{phrase}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Fallacy Overload -->
						{#if analysis.fallacy_overload || analysis.fallacyOverload}
							<div class="analysis-block critical">
								<h4>⚠️ Fallacy Overload</h4>
								<p>
									This content contains an unusually high concentration of logical fallacies, which
									may indicate bad-faith argumentation.
								</p>
							</div>
						{/if}

						<!-- Analysis Summary -->
						{#if analysis.rationale || analysis.summary}
							<div class="analysis-block">
								<h4>Analysis Summary</h4>
								<p>{analysis.rationale || analysis.summary}</p>
							</div>
						{/if}

						<!-- Provider Attribution -->
						{#if analysis.provider}
							<div class="provider-attribution">
								<small>
									Analysis by: {analysis.provider === 'openai'
										? 'OpenAI'
										: analysis.provider.charAt(0).toUpperCase() + analysis.provider.slice(1)}
								</small>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.good-faith-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.2s ease;
	}

	/* Light theme overlay - white semi-transparent background */
	:global([data-theme='light']) .good-faith-modal-overlay {
		background: rgba(255, 255, 255, 0.8);
	}

	.good-faith-modal {
		background: var(--color-surface);
		border-radius: var(--border-radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		max-width: 48rem;
		width: 100%;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease;
		border: 1px solid var(--color-border);
	}

	/* Light theme modal - stronger shadow for visibility */
	:global([data-theme='light']) .good-faith-modal {
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 5%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 3%, var(--color-surface))
		);
	}

	.modal-header h3 {
		margin: 0;
		font-family: var(--font-family-display);
		font-size: 1.5rem;
		color: var(--color-text-primary);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		transition: color 0.2s ease;
	}

	.modal-close:hover {
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.score-display {
		text-align: center;
		padding: 1.5rem 0;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.score-circle {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 10rem;
		height: 10rem;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-primary) 10%, var(--color-surface)),
			color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))
		);
		border: 3px solid var(--color-primary);
		margin: 0 auto;
	}

	.score-circle.constructive,
	.score-circle.exemplary {
		border-color: #10b981;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, #10b981 10%, var(--color-surface)),
			color-mix(in srgb, #059669 8%, var(--color-surface))
		);
	}

	.score-circle.neutral {
		border-color: #6b7280;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, #6b7280 10%, var(--color-surface)),
			color-mix(in srgb, #4b5563 8%, var(--color-surface))
		);
	}

	.score-circle.questionable {
		border-color: #f59e0b;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, #f59e0b 10%, var(--color-surface)),
			color-mix(in srgb, #d97706 8%, var(--color-surface))
		);
	}

	.score-circle.hostile {
		border-color: #ef4444;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, #ef4444 10%, var(--color-surface)),
			color-mix(in srgb, #dc2626 8%, var(--color-surface))
		);
	}

	.score-number {
		font-size: 2.5rem;
		font-weight: bold;
		color: var(--color-text-primary);
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.score-circle .score-label {
		font-size: 1rem;
		font-weight: 600;
		text-transform: capitalize;
		color: var(--color-text-secondary);
	}

	.evaluation-timestamp {
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.analysis-block {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-lg);
		border-left: 3px solid var(--color-primary);
	}

	.analysis-block h4 {
		margin: 0 0 1rem 0;
		font-family: var(--font-family-display);
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}

	.analysis-block.warning {
		border-left-color: #f59e0b;
		background: color-mix(in srgb, #f59e0b 5%, var(--color-surface-alt));
	}

	.analysis-block.critical {
		border-left-color: #ef4444;
		background: color-mix(in srgb, #ef4444 5%, var(--color-surface-alt));
	}

	.claim-card {
		margin-bottom: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border-radius: var(--border-radius-md);
		border: 1px solid var(--color-border);
	}

	.claim-card:last-child {
		margin-bottom: 0;
	}

	.claim-header {
		margin-bottom: 0.75rem;
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--color-text-primary);
	}

	.arguments-list {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.argument-card {
		padding: 0.75rem;
		background: var(--color-surface-alt);
		border-radius: var(--border-radius-sm);
		font-size: 0.9rem;
	}

	.argument-text {
		margin-bottom: 0.5rem;
		line-height: 1.5;
		color: var(--color-text-primary);
	}

	.argument-meta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
	}

	.arg-score {
		color: var(--color-primary);
		font-weight: 600;
	}

	.fallacies {
		color: #f59e0b;
	}

	.improvements {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
		border-radius: var(--border-radius-sm);
		font-size: 0.85rem;
		color: var(--color-text-primary);
	}

	.phrase-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.phrase-tag {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		background: color-mix(in srgb, #f59e0b 15%, var(--color-surface));
		color: #f59e0b;
		border-radius: var(--border-radius-md);
		font-size: 0.85rem;
		font-weight: 500;
		border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
	}

	.provider-attribution {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
