<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { nhost } from '$lib/nhostClient';

  onMount(() => {
    const unsubscribe = nhost.auth.onAuthStateChanged((event, session) => {
      if (event === 'SIGNED_IN') {
        goto('/');
      }
    });

    return () => {
      unsubscribe();
    };
  });
</script>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
    <div class="max-w-md w-full mx-auto p-8">
        <div class="text-center">
            <h1 class="mt-6 text-3xl font-bold text-center text-gray-900">
                Signing in...
            </h1>
            <p class="mt-2 text-center text-sm text-gray-600">
                Please wait while we sign you in.
            </p>
        </div>
    </div>
</div>
