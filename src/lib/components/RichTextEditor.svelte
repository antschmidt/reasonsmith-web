<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Underline from '@tiptap/extension-underline';
	import Placeholder from '@tiptap/extension-placeholder';

	// Props
	let {
		content = $bindable(''),
		placeholder = 'Start writing...',
		onUpdate = (html: string) => {},
		showToolbar = true,
		minHeight = '200px'
	} = $props<{
		content?: string;
		placeholder?: string;
		onUpdate?: (html: string) => void;
		showToolbar?: boolean;
		minHeight?: string;
	}>();

	let element: HTMLDivElement;
	let editor: Editor | null = null;

	// Toolbar state
	let isBold = $state(false);
	let isItalic = $state(false);
	let isStrike = $state(false);
	let isCode = $state(false);
	let isUnderline = $state(false);
	let isBulletList = $state(false);
	let isOrderedList = $state(false);
	let isBlockquote = $state(false);
	let isCodeBlock = $state(false);
	let currentHeading = $state(0);

	function updateToolbarState() {
		if (!editor) return;
		isBold = editor.isActive('bold');
		isItalic = editor.isActive('italic');
		isStrike = editor.isActive('strike');
		isCode = editor.isActive('code');
		isUnderline = editor.isActive('underline');
		isBulletList = editor.isActive('bulletList');
		isOrderedList = editor.isActive('orderedList');
		isBlockquote = editor.isActive('blockquote');
		isCodeBlock = editor.isActive('codeBlock');
		currentHeading = editor.isActive('heading', { level: 2 })
			? 2
			: editor.isActive('heading', { level: 3 })
				? 3
				: editor.isActive('heading', { level: 4 })
					? 4
					: 0;
	}

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: {
						levels: [2, 3, 4] // Only h2-h4 for better hierarchy
					}
				}),
				Link.configure({
					openOnClick: false,
					HTMLAttributes: {
						class: 'editor-link'
					}
				}),
				Underline,
				Placeholder.configure({ placeholder })
			],
			content,
			onTransaction: () => {
				updateToolbarState();
			},
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				content = html;
				onUpdate(html);
			},
			editorProps: {
				attributes: {
					class: 'rich-text-editor-content'
				}
			}
		});

		updateToolbarState();
	});

	onDestroy(() => {
		editor?.destroy();
	});

	// Toolbar actions
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleStrike() {
		editor?.chain().focus().toggleStrike().run();
	}

	function toggleCode() {
		editor?.chain().focus().toggleCode().run();
	}

	function toggleUnderline() {
		editor?.chain().focus().toggleUnderline().run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
	}

	function toggleCodeBlock() {
		editor?.chain().focus().toggleCodeBlock().run();
	}

	function setHeading(level: 2 | 3 | 4) {
		if (currentHeading === level) {
			editor?.chain().focus().setParagraph().run();
		} else {
			editor?.chain().focus().setHeading({ level }).run();
		}
	}

	// Public method to insert text at cursor position
	export function insertText(text: string) {
		editor?.chain().focus().insertContent(text).run();
	}

	function addLink() {
		const url = prompt('Enter URL:');
		if (url) {
			editor?.chain().focus().setLink({ href: url }).run();
		}
	}

	function removeLink() {
		editor?.chain().focus().unsetLink().run();
	}

	function insertHorizontalRule() {
		editor?.chain().focus().setHorizontalRule().run();
	}
</script>

<div class="rich-text-editor">
	{#if showToolbar}
		<div class="editor-toolbar">
			<div class="toolbar-group">
				<button
					type="button"
					class="toolbar-btn"
					class:active={isBold}
					onclick={toggleBold}
					title="Bold (Cmd+B)"
				>
					<strong>B</strong>
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isItalic}
					onclick={toggleItalic}
					title="Italic (Cmd+I)"
				>
					<em>I</em>
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isUnderline}
					onclick={toggleUnderline}
					title="Underline"
				>
					<span style="text-decoration: underline">U</span>
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isStrike}
					onclick={toggleStrike}
					title="Strikethrough"
				>
					<s>S</s>
				</button>
			</div>

			<div class="toolbar-separator"></div>

			<div class="toolbar-group">
				<button
					type="button"
					class="toolbar-btn"
					class:active={currentHeading === 2}
					onclick={() => setHeading(2)}
					title="Heading 2"
				>
					H2
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={currentHeading === 3}
					onclick={() => setHeading(3)}
					title="Heading 3"
				>
					H3
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={currentHeading === 4}
					onclick={() => setHeading(4)}
					title="Heading 4"
				>
					H4
				</button>
			</div>

			<div class="toolbar-separator"></div>

			<div class="toolbar-group">
				<button
					type="button"
					class="toolbar-btn"
					class:active={isBulletList}
					onclick={toggleBulletList}
					title="Bullet List"
				>
					• List
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isOrderedList}
					onclick={toggleOrderedList}
					title="Numbered List"
				>
					1. List
				</button>
			</div>

			<div class="toolbar-separator"></div>

			<div class="toolbar-group">
				<button
					type="button"
					class="toolbar-btn"
					class:active={isBlockquote}
					onclick={toggleBlockquote}
					title="Quote"
				>
					"Quote"
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isCode}
					onclick={toggleCode}
					title="Inline Code"
				>
					&lt;code&gt;
				</button>
				<button
					type="button"
					class="toolbar-btn"
					class:active={isCodeBlock}
					onclick={toggleCodeBlock}
					title="Code Block"
				>
					{'{ }'}
				</button>
			</div>

			<div class="toolbar-separator"></div>

			<div class="toolbar-group">
				<button type="button" class="toolbar-btn" onclick={addLink} title="Insert Link">
					🔗
				</button>
				<button
					type="button"
					class="toolbar-btn"
					onclick={insertHorizontalRule}
					title="Horizontal Rule"
				>
					―
				</button>
			</div>
		</div>
	{/if}

	<div bind:this={element} class="editor-wrapper" style="min-height: {minHeight}"></div>
</div>

<style>
	.rich-text-editor {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		background: var(--color-surface);
		overflow: hidden;
	}

	.editor-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-group {
		display: flex;
		gap: 0.25rem;
	}

	.toolbar-separator {
		width: 1px;
		background: var(--color-border);
		margin: 0 0.25rem;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--border-radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toolbar-btn:hover {
		background: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
		color: var(--color-primary);
	}

	.toolbar-btn.active {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.editor-wrapper {
		flex: 1;
		overflow-y: auto;
	}

	:global(.rich-text-editor-content) {
		padding: 1rem;
		outline: none;
		min-height: inherit;
	}

	/* Editor content styles */
	:global(.rich-text-editor-content p) {
		margin: 0 0 0.75rem 0;
	}

	:global(.rich-text-editor-content p:last-child) {
		margin-bottom: 0;
	}

	:global(.rich-text-editor-content h2) {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 1.5rem 0 0.75rem 0;
		line-height: 1.3;
	}

	:global(.rich-text-editor-content h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 1.25rem 0 0.5rem 0;
		line-height: 1.4;
	}

	:global(.rich-text-editor-content h4) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem 0;
		line-height: 1.4;
	}

	:global(.rich-text-editor-content ul),
	:global(.rich-text-editor-content ol) {
		padding-left: 1.5rem;
		margin: 0.75rem 0;
	}

	:global(.rich-text-editor-content li) {
		margin: 0.25rem 0;
	}

	:global(.rich-text-editor-content blockquote) {
		border-left: 3px solid var(--color-primary);
		padding-left: 1rem;
		margin: 1rem 0;
		font-style: italic;
		color: var(--color-text-secondary);
	}

	:global(.rich-text-editor-content code) {
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		padding: 0.125rem 0.375rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.875em;
		font-family: 'Courier New', monospace;
	}

	:global(.rich-text-editor-content pre) {
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		padding: 1rem;
		border-radius: var(--border-radius-md);
		overflow-x: auto;
		margin: 1rem 0;
	}

	:global(.rich-text-editor-content pre code) {
		background: none;
		padding: 0;
	}

	:global(.rich-text-editor-content .editor-link) {
		color: var(--color-primary);
		text-decoration: underline;
		cursor: pointer;
	}

	:global(.rich-text-editor-content hr) {
		border: none;
		border-top: 2px solid var(--color-border);
		margin: 1.5rem 0;
	}

	:global(.rich-text-editor-content .is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--color-text-secondary);
		opacity: 0.5;
		pointer-events: none;
		float: left;
		height: 0;
	}

	@media (max-width: 768px) {
		.toolbar-btn {
			min-width: 1.75rem;
			height: 1.75rem;
			font-size: 0.8125rem;
		}
	}
</style>
