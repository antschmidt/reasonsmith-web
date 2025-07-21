<script lang="ts">
  import { nhost } from '$lib/nhostClient';

  let error: Error | null = null;

  const handleSignIn = async () => {
    try {
      await nhost.auth.signIn({
        provider: 'github',
        options: {
          redirectTo: '/auth/callback'
        }
      });
    } catch (err) {
      error = err as Error;
    }
  };
</script>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
  <div class="max-w-md w-full mx-auto p-8">
    <div class="text-center">
        <img class="mx-auto h-12 w-auto" src="/ReasonSmith.png" alt="ReasonSmith">
        <h1 class="mt-6 text-3xl font-bold text-center text-gray-900">
            Sign in to your account
        </h1>
    </div>
    <div class="mt-8">
      <button
        on:click={handleSignIn}
        class="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        aria-label="Sign in with GitHub"
      >
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.378.203 2.398.1 2.65.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.943.359.308.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.577.688.482A10.001 10.001 0 0020 10c0-5.523-4.477-10-10-10z" clip-rule="evenodd" />
        </svg>
        <span>Sign in with GitHub</span>
      </button>
    </div>
    {#if error}
      <p class="mt-4 text-center text-sm text-red-600">
        {error.message}
      </p>
    {/if}
  </div>
</div>
