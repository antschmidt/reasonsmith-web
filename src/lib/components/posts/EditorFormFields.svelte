<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title = $bindable(''),
		description = $bindable(''),
		disabled = false,
		onSubmit,
		children
	} = $props<{
		title: string;
		description: string;
		disabled?: boolean;
		onSubmit?: (e: SubmitEvent) => void;
		children?: Snippet;
	}>();
</script>

<form
	class="editor-form"
	onsubmit={(e) => {
		e.preventDefault();
		onSubmit?.(e);
	}}
>
	<div class="form-group">
		<label for="title">Title</label>
		<input
			id="title"
			type="text"
			bind:value={title}
			placeholder="Discussion title..."
			required
			{disabled}
		/>
	</div>

	<div class="form-group">
		<label for="draft-description">Description</label>
		<textarea
			id="draft-description"
			bind:value={description}
			placeholder="Describe your discussion..."
			rows="20"
			required
		></textarea>
		{@render children?.()}
	</div>
</form>

<style>
	.editor-form {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		padding: 2rem;
		margin-bottom: 2rem;
	}

	.form-group {
		margin-bottom: 2.5rem;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.75rem;
		color: var(--color-text-secondary);
		font-size: 15px;
		letter-spacing: 0.025em;
	}

	input,
	textarea {
		padding: 0.875rem 1rem;
		width: 95%;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-input-bg);
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 15px;
		line-height: 1.5;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	textarea {
		font-family: 'Crimson Text', Georgia, serif;
		width: 95%;
		font-size: 16px;
		line-height: 1.7;
		resize: vertical;
		min-height: 200px;
	}

	@media (max-width: 768px) {
		.editor-form {
			padding: 1.5rem;
		}
	}
</style>
