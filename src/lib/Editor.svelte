<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';

  // Initial HTML to load into the editor
  export let content: string = '';

  // Callback prop; parent handles saving
  export let onUpdate: (html: string) => void = () => {};

  let element: HTMLDivElement;
  let editor: Editor;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Write your reply…' }),
      ],
      content,
      // on each transaction, emit the current HTML
      onTransaction: ({ editor }) => {
        onUpdate(editor.getHTML());
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });
</script>

<!-- the editable area -->
<div bind:this={element} class="prose max-w-full p-4 border rounded"></div>