<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';
	import { createDraftAutosaver, type DraftAutosaver } from '$lib';

	// Initial HTML to load into the editor
	let {
		content = '',
		postId = null, // when provided, enables autosave
		autosave = true,
		autosaveDelay = 800, // debounce ms
		autosaveMinInterval = 2500, // min interval ms
		onUpdate = () => {} // Parent can still supply onUpdate if desired (raw change stream)
	} = $props<{
		content?: string;
		postId?: string | null;
		autosave?: boolean;
		autosaveDelay?: number;
		autosaveMinInterval?: number;
		onUpdate?: (html: string) => void;
	}>();

	// Fired after a successful autosave
	const dispatch = createEventDispatcher<{ saved: { at: number } }>();

	let element: HTMLDivElement;
	let editor: Editor;
	let autosaver: DraftAutosaver | null = null;

	function initAutosaver(initial: string) {
		if (!postId || !autosave) return;
		autosaver = createDraftAutosaver({
			postId,
			initialContent: initial,
			delay: autosaveDelay,
			minInterval: autosaveMinInterval,
			onSaved: ({ at }) => dispatch('saved', { at })
		});
	}

	onMount(() => {
		initAutosaver(content);
		editor = new Editor({
			element,
			extensions: [StarterKit, Placeholder.configure({ placeholder: 'Write your reply…' })],
			content,
			// on each transaction, emit the current HTML
			onTransaction: ({ editor }) => {
				const html = editor.getHTML();
				onUpdate(html);
				autosaver?.handleChange(html);
			}
		});
	});

	onDestroy(() => {
		editor?.destroy();
		autosaver?.destroy();
	});
</script>

<!-- the editable area -->
<div bind:this={element} class="prose max-w-full p-4 border rounded"></div>
