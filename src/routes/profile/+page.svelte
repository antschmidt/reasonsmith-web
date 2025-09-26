<script lang="ts">
  import { nhost, ensureContributor } from '$lib/nhostClient';
  import { onMount } from 'svelte';
  import { GET_USER_STATS } from '$lib/graphql/queries';
  import { calculateUserStats, type UserStats } from '$lib/utils/userStats';

  let user = nhost.auth.getUser();
  let authEmail = user?.email || '';
  let loading = false;
  let fetching = false;
  let statsLoading = false;
  let success: string | null = null;
  let error: string | null = null;

  let editing = false;

  let contributor: any = null;
  let discussions: any[] = [];
  let posts: any[] = [];
  let stats: UserStats = {
    goodFaithRate: 0,
    sourceAccuracy: 0,
    reputationScore: 0,
    totalPosts: 0,
    totalDiscussions: 0,
    participatedDiscussions: 0
  };

  let displayName = '';
  let bio = '';
  let website = '';
  let handle = '';
  let social = {
    twitter: '',
    github: '',
    linkedin: '',
    mastodon: '',
    bluesky: '',
    facebook: '',
    instagram: '',
    youtube: '',
    tiktok: ''
  } as Record<string, string>;

  const GET_FULL_PROFILE = `
    query GetFullProfile($id: uuid!) {
      contributor_by_pk(id: $id) {
        id
        auth_email
        display_name
        handle
        bio
        website
        social_links
      }
      discussion(where: { created_by: { _eq: $id } }, order_by: { created_at: desc }) {
        id
        title
        created_at
      }
      post(where: { author_id: { _eq: $id }, status: { _eq: "approved" } }, order_by: { created_at: desc }) {
        id
        discussion_id
        created_at
        content
      }
    }
  `;

  const UPDATE_PROFILE = `
    mutation UpdateProfile($id: uuid!, $display_name: String, $handle: String, $bio: String, $website: String, $social_links: jsonb) {
      update_contributor_by_pk(pk_columns: { id: $id }, _set: {
        display_name: $display_name,
        handle: $handle,
        bio: $bio,
        website: $website,
        social_links: $social_links
      }) { id }
    }
  `;

  let profilePath = user ? `/u/${user.id}` : '';

  onMount(async () => {
    user = nhost.auth.getUser();
    authEmail = user?.email || authEmail;
    profilePath = user ? `/u/${user.id}` : '';
    if (!user) return;
    await loadProfile();
  });

  $: profilePath = handle ? `/u/${handle}` : user ? `/u/${user.id}` : '';

  function extractGqlError(err: any): string {
    if (!err) return 'Unknown error';
    if (Array.isArray(err)) {
      return err.map((e: any) => e?.message ?? String(e)).join('; ');
    }
    if (typeof err === 'object' && 'message' in err && err.message) {
      return err.message as string;
    }
    return String(err);
  }

  function syncFormFields() {
    if (contributor) {
      authEmail = contributor.auth_email || user?.email || '';
      displayName = contributor.display_name || '';
      handle = contributor.handle || '';
      bio = contributor.bio || '';
      website = contributor.website || '';
      const links = contributor.social_links || {};
      for (const key of Object.keys(social)) {
        social[key] = links[key] || '';
      }
    } else {
      displayName = '';
      handle = '';
      bio = '';
      website = '';
      for (const key of Object.keys(social)) {
        social[key] = '';
      }
    }
  }

  async function loadProfile() {
    if (!user) return;
    fetching = true;
    statsLoading = true;
    error = null;
    try {
      const [profileResult, statsResult] = await Promise.all([
        nhost.graphql.request(GET_FULL_PROFILE, { id: user.id }),
        nhost.graphql.request(GET_USER_STATS, { userId: user.id })
      ]);

      if (profileResult.error) {
        throw new Error(extractGqlError(profileResult.error));
      }

      const data = profileResult.data as any;
      contributor = data?.contributor_by_pk ?? null;
      discussions = data?.discussion ?? [];
      posts = data?.post ?? [];

      if (!contributor) {
        await ensureContributor();
        const retry = await nhost.graphql.request(GET_FULL_PROFILE, { id: user.id });
        if (retry.error) {
          throw new Error(extractGqlError(retry.error));
        }
        const retryData = retry.data as any;
        contributor = retryData?.contributor_by_pk ?? null;
        discussions = retryData?.discussion ?? [];
        posts = retryData?.post ?? [];
      }

      syncFormFields();

      if (statsResult.error) {
        console.warn('Failed to load user stats:', statsResult.error);
      } else if (statsResult.data) {
        stats = calculateUserStats(statsResult.data as any);
      }
    } catch (e: any) {
      error = e?.message || 'Failed to load profile.';
    } finally {
      fetching = false;
      statsLoading = false;
      if (!authEmail) authEmail = user?.email || '';
    }
  }

  function normUrl(u: string) {
    const s = u.trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function displayNameText(name?: string | null): string {
    if (!name) return '';
    const n = String(name).trim();
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n);
    if (isEmail) return n.split('@')[0];
    return n;
  }

  function toTextSnippet(html: string, max = 160): string {
    if (!html) return '';
    const cleaned = html
      .replace(/<!--\s*CITATION_DATA:[\s\S]*?-->/gi, ' ')
      .replace(/<!--\s*REPLY_TO:[\s\S]*?-->/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
  }

  function getSocialLink(platform: string, value: string): string | null {
    if (!value) return null;
    const v = String(value).trim();
    if (!v) return null;
    const isUrl = /^https?:\/\//i.test(v);
    const stripAt = (s: string) => s.replace(/^@+/, '');
    const p = platform.toLowerCase();
    if (isUrl) return v;
    switch (p) {
      case 'twitter':
      case 'x':
        return `https://x.com/${stripAt(v)}`;
      case 'github':
        return `https://github.com/${stripAt(v)}`;
      case 'linkedin':
        if (/^(in|company)\//i.test(v)) return `https://www.linkedin.com/${v}`;
        return `https://www.linkedin.com/in/${stripAt(v)}`;
      case 'mastodon': {
        const m = v.replace(/^@/, '').split('@');
        if (m.length >= 2) return `https://${m.slice(1).join('@')}/@${m[0]}`;
        return `https://${v}`;
      }
      case 'bluesky':
        return `https://bsky.app/profile/${stripAt(v)}`;
      case 'facebook':
        return `https://www.facebook.com/${stripAt(v)}`;
      case 'instagram':
        return `https://www.instagram.com/${stripAt(v)}`;
      case 'youtube':
        if (v.startsWith('@')) return `https://www.youtube.com/${v}`;
        if (/^UC[\w-]{22}/.test(v)) return `https://www.youtube.com/channel/${v}`;
        return `https://www.youtube.com/${v}`;
      case 'tiktok':
        return `https://www.tiktok.com/@${stripAt(v)}`;
      default:
        return `https://${v}`;
    }
  }

  function websiteLabel(u: string): string {
    try {
      const s = String(u).trim();
      return s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    } catch {
      return u;
    }
  }

  function socialIcon(platform: string): string {
    const p = platform.toLowerCase();
    const base = 'width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"';
    switch (p) {
      case 'twitter':
      case 'x':
        return `<svg ${base}><path d="M18.244 2H21.5l-7.5 8.57L22.5 22H15.93l-5.07-5.88L5 22H1.744l8.1-9.26L.5 2H7.242l4.57 5.273L18.244 2Zm-1.155 18h1.92L7.01 4h-1.92l12 16Z"/></svg>`;
      case 'github':
        return `<svg ${base}><path fill-rule="evenodd" d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.54v-1.9c-3.05.66-3.7-1.27-3.7-1.27-.5-1.26-1.22-1.6-1.22-1.6-1-.7.08-.68.08-.68 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.18 3.2.9.1-.7.38-1.18.68-1.45-2.43-.27-4.98-1.22-4.98-5.43 0-1.2.43-2.18 1.13-2.95-.1-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.13.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.44 3.1-1.13 3.1-1.13.6 1.55.2 2.7.1 2.98.7.77 1.12 1.75 1.12 2.95 0 4.22-2.56 5.16-5 5.43.4.35.74 1.03.74 2.08v3.08c0 .3.2.65.76.54 4.35-1.45 7.5-5.57 7.5-10.43C23.02 5.24 18.27.5 12 .5Z" clip-rule="evenodd"/></svg>`;
      case 'linkedin':
        return `<svg ${base}><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v2h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.08V23h-4v-5.9c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V23h-4V8.5z"/></svg>`;
      case 'mastodon':
        return `<svg ${base}><path d="M21.57 13.19c-.29 1.48-2.62 3.1-5.3 3.43-1.4.18-2.78.35-4.25.28-2.4-.11-4.31-.57-4.31-.57 0 .23.01.46.04.68.31 2.35 2.34 2.49 4.25 2.56 1.93.07 3.65-.47 3.65-.47l.08 1.8s-1.35.73-3.76.86c-1.33.07-2.99-.03-4.92-.52-4.18-1.06-4.9-5.35-4.99-9.69-.03-1.34-.01-2.6-.01-3.65 0-4.99 3.27-6.46 3.27-6.46 1.65-.76 4.49-1.08 7.45-1.1h.07c2.96.02 5.8.34 7.45 1.1 0 0 3.27 1.47 3.27 6.46 0 0 .04 3.02-.99 5.69zM17.55 6.6h-2.22v6.85h-2.53V6.6h-2.21V4.44h6.96V6.6z"/></svg>`;
      case 'bluesky':
        return `<svg ${base}><path d="M12 9.8C9.5 6.5 6.3 3.7 3 2c1.2 3.6 3 7.1 6 9-3 1.9-4.8 5.4-6 9 3.3-1.7 6.5-4.5 9-7.8 2.5 3.3 5.7 6.1 9 7.8-1.2-3.6-3-7.1-6-9 3-1.9 4.8-5.4 6-9-3.3 1.7-6.5 4.5-9 7.8z"/></svg>`;
      case 'facebook':
        return `<svg ${base}><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.1 5.66 21.2 10.44 22v-7.02H7.9v-2.9h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.62.77-1.62 1.56v1.88h2.77l-.44 2.9h-2.33V22C18.34 21.2 22 17.1 22 12.07z"/></svg>`;
      case 'instagram':
        return `<svg ${base}><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.3 2.4.6.6.3 1 .6 1.5 1.1.5.5.8.9 1.1 1.5.3.5.5 1.2.6 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.9-.6 2.4-.3.6-.6 1-1.1 1.5-.5.5-.9.8-1.5 1.1-.5.3-1.2.5-2.4.6-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.3-2.4-.6-.6-.3-1-.6-1.5-1.1-.5-.5-.8-.9-1.1-1.5-.3-.5-.5-1.2-.6-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.9.6-2.4.3-.6.6-1 1.1-1.5.5-.5.9-.8 1.5-1.1.5-.3 1.2-.5 2.4-.6C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.7.2 4.8.4 4 .8 3.2 1.2 2.5 1.7 1.7 2.5 1 3.2.5 3.9.1 4.7c-.4.8-.6 1.7-.7 3C-.7 9 .7 9.4 0 12c.7 2.6.4 3 .4 5.3.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.7 2.3.8.8 1.5 1.2 2.3 1.6.8.4 1.7.6 3 .7 1.3.1 1.7.1 5.3.1s4 0 5.3-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.3-1.6.8-.4 1.3-1.1 1.7-2.3.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5.3s0-4-.1-5.3c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.7-2.3C21.5.5 20.8 0 20 0c-.8-.4-1.7-.6-3-.7C15.6-.8 15.2-.8 12-.8z"/><circle cx="12" cy="12" r="3.2"/><circle cx="18.4" cy="5.6" r="1.2"/></svg>`;
      case 'youtube':
        return `<svg ${base}><path d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.8.5 9.3.5 9.3.5s7.5 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2 32 32 0 0 0 .5-5.8 32 32 0 0 0-.5-5.8zM9.7 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>`;
      case 'tiktok':
        return `<svg ${base}><path d="M19 7.5c-2 0-3.7-1.6-3.7-3.6V3h-3.2v10.6c0 1.5-1.2 2.7-2.8 2.7S6.5 15 6.5 13.6s1.2-2.7 2.8-2.7c.3 0 .6 0 .9.1V7.7c-.3 0-.6-.1-.9-.1-3.1 0-5.6 2.4-5.6 5.4S6.2 18.5 9.3 18.5s5.6-2.4 5.6-5.4v-4c1 1 2.4 1.7 4 1.7V7.5H19z"/></svg>`;
      default:
        return `<svg ${base}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 0 1 6.32 4H12v3h6.95A7 7 0 1 1 12 5Z"/></svg>`;
    }
  }

  function enterEdit() {
    editing = true;
    error = null;
    success = null;
    syncFormFields();
  }

  function cancelEdit() {
    editing = false;
    error = null;
    success = null;
    syncFormFields();
  }

  async function save() {
    if (!user) return;
    loading = true;
    error = null;
    success = null;
    try {
      const trimmed = (displayName ?? '').trim();
      if (trimmed.length > 50) {
        error = 'Display name must be 50 characters or fewer.';
        return;
      }
      const normalizedHandle = (handle ?? '').trim().toLowerCase();
      if (normalizedHandle) {
        if (!/^[a-z0-9_.-]{3,30}$/.test(normalizedHandle)) {
          error = 'Handle must be 3–30 chars: a–z, 0–9, _ . -';
          return;
        }
      }

      const social_links: Record<string, string> = {};
      for (const [k, v] of Object.entries(social)) {
        const val = (v || '').trim();
        if (!val) continue;
        social_links[k] = val;
      }

      const payload = {
        id: user.id,
        display_name: trimmed || null,
        handle: normalizedHandle || null,
        bio: bio?.trim() || null,
        website: website?.trim() ? normUrl(website) : null,
        social_links
      };

      const { data, error: gqlError } = await nhost.graphql.request(UPDATE_PROFILE, payload);
      if (gqlError) throw new Error(extractGqlError(gqlError));
      if (!data?.update_contributor_by_pk) {
        await ensureContributor();
        const retry = await nhost.graphql.request(UPDATE_PROFILE, payload);
        if (retry.error) throw new Error(extractGqlError(retry.error));
      }

      await loadProfile();
      if (error) throw new Error(error);
      success = 'Profile saved.';
      editing = false;
    } catch (e: any) {
      const msg = e?.message || 'Failed to save profile.';
      if (/duplicate key value violates unique constraint/i.test(msg)) {
        error = 'That handle is taken. Please choose another.';
      } else if (/handle.*format/i.test(msg)) {
        error = 'Handle format invalid. Use 3–30 chars: a–z, 0–9, _ . -';
      } else {
        error = msg;
      }
    } finally {
      loading = false;
    }
  }
</script>

<!-- Immersive background -->
<div class="page-background">
  <div class="floating-gradient gradient-1"></div>
  <div class="floating-gradient gradient-2"></div>
  <div class="floating-gradient gradient-3"></div>
</div>

<div class="profile-container {editing ? 'editing' : ''}">
  {#if !user}
    <div class="glass-card sign-in-prompt">
      <p>Please sign in to view your profile.</p>
    </div>
  {:else}
    {#if !editing && success}
      <div class="success-banner">{success}</div>
    {/if}

    {#if editing}
      <div class="glass-card edit-form-container">
        <form class="profile-form" on:submit|preventDefault={save}>
          <fieldset disabled={loading || fetching}>
          <label class="field read-only">
            <span>Sign-in Email</span>
            <input type="email" bind:value={authEmail} readonly />
            <small class="hint">Contact support to update your login email.</small>
          </label>
          <label class="field">
            <span>Display Name</span>
            <input
              type="text"
              bind:value={displayName}
              placeholder="Your display name"
              maxlength="50"
            />
          </label>

          <label class="field">
            <span>Handle</span>
            <input
              type="text"
              bind:value={handle}
              placeholder="yourname"
              maxlength="30"
              on:input={() => (handle = (handle || '').toLowerCase())}
            />
            <small class="hint">Profile URL: {handle ? `/u/${handle}` : '/u/your-handle'}</small>
          </label>

          <label class="field">
            <span>Short Bio</span>
            <textarea rows="4" bind:value={bio} placeholder="Tell others a bit about you (optional)"></textarea>
          </label>

          <label class="field">
            <span>Website</span>
            <input type="url" bind:value={website} placeholder="https://example.com (optional)" />
          </label>

          <div class="social-grid">
            <div class="social-field">
              <label for="social-twitter"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L22.5 22H15.93l-5.07-5.88L5 22H1.744l8.1-9.26L.5 2H7.242l4.57 5.273L18.244 2Zm-1.155 18h1.92L7.01 4h-1.92l12 16Z"/></svg>
                </span>Twitter / X</label>
              <input
                id="social-twitter"
                type="text"
                bind:value={social.twitter}
                placeholder="@handle or https://x.com/username"
              />
            </div>
            <div class="social-field">
              <label for="social-github"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.54v-1.9c-3.05.66-3.7-1.27-3.7-1.27-.5-1.26-1.22-1.6-1.22-1.6-1-.7.08-.68.08-.68 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.18 3.2.9.1-.7.38-1.18.68-1.45-2.43-.27-4.98-1.22-4.98-5.43 0-1.2.43-2.18 1.13-2.95-.1-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.13.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.44 3.1-1.13 3.1-1.13.6 1.55.2 2.7.1 2.98.7.77 1.12 1.75 1.12 2.95 0 4.22-2.56 5.16-5 5.43.4.35.74 1.03.74 2.08v3.08c0 .3.2.65.76.54 4.35-1.45 7.5-5.57 7.5-10.43C23.02 5.24 18.27.5 12 .5Z" clip-rule="evenodd"/></svg>
                </span>GitHub</label>
              <input
                id="social-github"
                type="text"
                bind:value={social.github}
                placeholder="username or https://github.com/username"
              />
            </div>
            <div class="social-field">
              <label for="social-linkedin"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v2h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.08V23h-4v-5.9c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V23h-4V8.5z"/></svg>
                </span>LinkedIn</label>
              <input id="social-linkedin" type="text" bind:value={social.linkedin} placeholder="profile URL" />
            </div>
            <div class="social-field">
              <label for="social-mastodon"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.57 13.19c-.29 1.48-2.62 3.1-5.3 3.43-1.4.18-2.78.35-4.25.28-2.4-.11-4.31-.57-4.31-.57 0 .23.01.46.04.68.31 2.35 2.34 2.49 4.25 2.56 1.93.07 3.65-.47 3.65-.47l.08 1.8s-1.35.73-3.76.86c-1.33.07-2.99-.03-4.92-.52-4.18-1.06-4.9-5.35-4.99-9.69-.03-1.34-.01-2.6-.01-3.65 0-4.99 3.27-6.46 3.27-6.46 1.65-.76 4.49-1.08 7.45-1.1h.07c2.96.02 5.8.34 7.45 1.1 0 0 3.27 1.47 3.27 6.46 0 0 .04 3.02-.99 5.69zM17.55 6.6h-2.22v6.85h-2.53V6.6h-2.21V4.44h6.96V6.6z"/></svg>
                </span>Mastodon</label>
              <input
                id="social-mastodon"
                type="text"
                bind:value={social.mastodon}
                placeholder="@user@instance or profile URL"
              />
            </div>
            <div class="social-field">
              <label for="social-bluesky"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9.8C9.5 6.5 6.3 3.7 3 2c1.2 3.6 3 7.1 6 9-3 1.9-4.8 5.4-6 9 3.3-1.7 6.5-4.5 9-7.8 2.5 3.3 5.7 6.1 9 7.8-1.2-3.6-3-7.1-6-9 3-1.9 4.8-5.4 6-9-3.3 1.7-6.5 4.5-9 7.8z"/></svg>
                </span>Bluesky</label>
              <input id="social-bluesky" type="text" bind:value={social.bluesky} placeholder="handle or profile URL" />
            </div>
            <div class="social-field">
              <label for="social-facebook"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.1 5.66 21.2 10.44 22v-7.02H7.9v-2.9h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.62.77-1.62 1.56v1.88h2.77l-.44 2.9h-2.33V22C18.34 21.2 22 17.1 22 12.07z"/></svg>
                </span>Facebook</label>
              <input id="social-facebook" type="text" bind:value={social.facebook} placeholder="profile/page URL" />
            </div>
            <div class="social-field">
              <label for="social-instagram"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.3 2.4.6.6.3 1 .6 1.5 1.1.5.5.8.9 1.1 1.5.3.5.5 1.2.6 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.9-.6 2.4-.3.6-.6 1-1.1 1.5-.5.5-.9.8-1.5 1.1-.5.3-1.2.5-2.4.6-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.3-2.4-.6-.6-.3-1-.6-1.5-1.1-.5-.5-.8-.9-1.1-1.5-.3-.5-.5-1.2-.6-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.9.6-2.4.3-.6.6-1 1.1-1.5.5-.5.9-.8 1.5-1.1.5-.3 1.2-.5 2.4-.6C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.7.2 4.8.4 4 .8 3.2 1.2 2.5 1.7 1.7 2.5 1 3.2.5 3.9.1 4.7c-.4.8-.6 1.7-.7 3C-.7 9 .7 9.4 0 12c.7 2.6.4 3 .4 5.3.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.7 2.3.8.8 1.5 1.2 2.3 1.6.8.4 1.7.6 3 .7 1.3.1 1.7.1 5.3.1s4 0 5.3-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.3-1.6.8-.4 1.3-1.1 1.7-2.3.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5.3s0-4-.1-5.3c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.7-2.3C21.5.5 20.8 0 20 0c-.8-.4-1.7-.6-3-.7C15.6-.8 15.2-.8 12-.8z"/><circle cx="12" cy="12" r="3.2"/><circle cx="18.4" cy="5.6" r="1.2"/></svg>
                </span>Instagram</label>
              <input id="social-instagram" type="text" bind:value={social.instagram} placeholder="@handle or profile URL" />
            </div>
            <div class="social-field">
              <label for="social-youtube"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.8.5 9.3.5 9.3.5s7.5 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2 32 32 0 0 0 .5-5.8 32 32 0 0 0-.5-5.8zM9.7 15.5V8.5l6.2 3.5-6.2 3.5z"/></svg>
                </span>YouTube</label>
              <input id="social-youtube" type="text" bind:value={social.youtube} placeholder="channel URL" />
            </div>
            <div class="social-field">
              <label for="social-tiktok"><span class="icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7.5c-2 0-3.7-1.6-3.7-3.6V3h-3.2v10.6c0 1.5-1.2 2.7-2.8 2.7S6.5 15 6.5 13.6s1.2-2.7 2.8-2.7c.3 0 .6 0 .9.1V7.7c-.3 0-.6-.1-.9-.1-3.1 0-5.6 2.4-5.6 5.4S6.2 18.5 9.3 18.5s5.6-2.4 5.6-5.4v-4c1 1 2.4 1.7 4 1.7V7.5H19z"/></svg>
                </span>TikTok</label>
              <input id="social-tiktok" type="text" bind:value={social.tiktok} placeholder="@handle or profile URL" />
            </div>
          </div>

          {#if error}<div class="error">{error}</div>{/if}
          <div class="form-actions">
            <button class="btn-primary" type="submit" disabled={loading}>
              {#if loading}Saving…{:else}Save Profile{/if}
            </button>
            <button class="btn-secondary" type="button" on:click={cancelEdit} disabled={loading}>Cancel</button>
          </div>
        </fieldset>
        </form>
      </div>
    {:else}
      {#if fetching}
        <div class="glass-card loading-card">
          <p>Loading…</p>
        </div>
      {:else if error}
        <div class="glass-card error-card">
          <p class="error">{error}</p>
        </div>
      {:else}
        <div class="profile-view">
          <div class="glass-card profile-header">
            <div class="view-header">
              <div class="profile-info">
                <h1 class="profile-title">{displayNameText(displayName) || 'Your Profile'}</h1>
                {#if handle}
                  <p class="handle">@{handle}</p>
                {/if}
              </div>
              <button class="btn-primary" type="button" on:click={enterEdit}>Edit Profile</button>
            </div>

            {#if bio}
              <p class="bio">{bio}</p>
            {/if}

            {#if website || (contributor?.social_links && Object.values(contributor.social_links).some(Boolean))}
              <div class="links">
                {#if website}
                  <a class="link website" href={website} target="_blank" rel="noopener">{websiteLabel(website)}</a>
                {/if}
                {#if contributor?.social_links}
                  {#each Object.entries(contributor.social_links) as [key, val]}
                    {#if val}
                      {@const href = getSocialLink(key, String(val))}
                      {#if href}
                        <a class="link icon" href={href} target="_blank" rel="noopener" title={key} aria-label={key}>
                          {@html socialIcon(key)}
                          <span class="sr-only">{key}</span>
                        </a>
                      {/if}
                    {/if}
                  {/each}
                {/if}
              </div>
            {/if}
          </div>

          <div class="glass-card account-section">
            <h3 class="section-title">Account Details</h3>
            <div class="account-details">
              <div class="detail-row">
                <span class="detail-label">Email</span>
                <span class="detail-value">{authEmail || 'Unavailable'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Profile URL</span>
                <span class="detail-value">
                  {#if profilePath}
                    <a href={profilePath} class="profile-link">{profilePath}</a>
                  {:else}
                    Not available
                  {/if}
                </span>
              </div>
            </div>
            <p class="section-hint">Contact support to update your login email.</p>
          </div>

          <div class="glass-card stats-section">
            <div class="gradient-accent"></div>
            <h3 class="section-title">Your Statistics</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.goodFaithRate}%
                  {/if}
                </div>
                <div class="stat-label">Good-Faith Rate</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.sourceAccuracy}%
                  {/if}
                </div>
                <div class="stat-label">Source Accuracy</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.reputationScore.toLocaleString()}
                  {/if}
                </div>
                <div class="stat-label">Reputation Score</div>
              </div>
            </div>
            <div class="activity-grid">
              <div class="activity-stat">
                <span class="activity-count">{stats.totalDiscussions.toLocaleString()}</span>
                <span class="activity-label">discussions created</span>
              </div>
              <div class="activity-stat">
                <span class="activity-count">{stats.totalPosts.toLocaleString()}</span>
                <span class="activity-label">comments posted</span>
              </div>
              <div class="activity-stat">
                <span class="activity-count">{stats.participatedDiscussions.toLocaleString()}</span>
                <span class="activity-label">discussions joined</span>
              </div>
            </div>
          </div>

          <div class="glass-card content-section">
            <div class="gradient-accent"></div>
            <h3 class="section-title">Recent Discussions</h3>
            {#if discussions.length === 0}
              <p class="empty-state">No discussions yet.</p>
            {:else}
              <div class="content-list">
                {#each discussions as d}
                  <div class="content-item">
                    <a href={`/discussions/${d.id}`} class="content-link">{d.title}</a>
                    <span class="content-meta">{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="glass-card content-section">
            <div class="gradient-accent"></div>
            <h3 class="section-title">Recent Comments</h3>
            {#if posts.length === 0}
              <p class="empty-state">No comments yet.</p>
            {:else}
              <div class="content-list">
                {#each posts as p}
                  <div class="content-item">
                    <a href={`/discussions/${p.discussion_id}`} class="content-link">{toTextSnippet(p.content)}</a>
                    <span class="content-meta">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  {/if}
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

  .gradient-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    border-radius: 24px 24px 0 0;
  }

  /* Layout */
  .profile-container {
    min-height: 100vh;
    padding: clamp(1rem, 4vw, 2rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    position: relative;
  }

  .profile-container.editing {
    max-width: 800px;
    width: 100%;
  }

  .profile-view {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
    max-width: 1000px;
  }

  /* Profile header */
  .profile-header {
    padding: 2rem;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .profile-info h1.profile-title {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: var(--color-text-primary);
    text-shadow: 0 2px 4px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
  }

  .handle {
    font-size: 1.1rem;
    color: var(--color-text-secondary);
    margin: 0;
    font-weight: 500;
  }

  .bio {
    font-size: 1rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 600px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 1rem;
  }

  .links .link {
    color: var(--color-primary);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .links .link:hover {
    color: var(--color-accent);
    transform: translateY(-1px);
  }

  .links .link.icon {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    justify-content: center;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  .links .link.icon:hover {
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  /* Sections */
  .section-title {
    font-size: 1.3rem;
    font-weight: 600;
    margin: 0 0 1.5rem 0;
    color: var(--color-text-primary);
  }

  .account-section,
  .stats-section,
  .content-section {
    padding: 2rem;
  }

  /* Account details */
  .account-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .detail-value {
    color: var(--color-text-primary);
    text-align: right;
  }

  .profile-link {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .profile-link:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }

  .section-hint {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    margin: 0;
    opacity: 0.8;
  }

  /* Statistics */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    border-radius: 20px;
    padding: 1.5rem;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .stat-card:hover {
    transform: translateY(-2px);
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .stat-number {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-primary);
    margin-bottom: 0.5rem;
    text-shadow: 0 2px 4px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  .stat-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .activity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .activity-stat {
    text-align: center;
  }

  .activity-count {
    display: block;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-accent);
    margin-bottom: 0.25rem;
  }

  .activity-label {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* Content sections */
  .content-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .content-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    background: color-mix(in srgb, var(--color-surface) 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
    border-radius: 16px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .content-item:hover {
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 5%, transparent);
  }

  .content-link {
    color: var(--color-text-primary);
    text-decoration: none;
    font-weight: 500;
    flex: 1;
    line-height: 1.5;
  }

  .content-link:hover {
    color: var(--color-primary);
  }

  .content-meta {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .empty-state {
    text-align: center;
    color: var(--color-text-secondary);
    font-style: italic;
    padding: 2rem;
    margin: 0;
  }
  /* Form styling */
  .edit-form-container {
    padding: 2rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .profile-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .profile-form fieldset {
    border: none;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field span {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .field input,
  .field textarea {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    backdrop-filter: blur(10px);
    color: var(--color-text-primary);
    font-size: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    transform: translateY(-1px);
  }

  .field textarea {
    resize: vertical;
    min-height: 120px;
  }

  .field.read-only input {
    background: color-mix(in srgb, var(--color-surface) 30%, transparent);
    color: var(--color-text-secondary);
    cursor: not-allowed;
  }

  .hint {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .social-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }

  .social-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .social-field label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .social-field label .icon {
    width: 18px;
    height: 18px;
    color: var(--color-text-secondary);
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

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  /* Status messages */
  .sign-in-prompt {
    padding: 3rem;
    text-align: center;
  }

  .sign-in-prompt p {
    font-size: 1.1rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .success-banner {
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--color-accent) 20%, transparent),
      color-mix(in srgb, var(--color-accent) 10%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
    color: var(--color-accent);
    padding: 1rem 1.5rem;
    border-radius: 16px;
    font-weight: 500;
    text-align: center;
    backdrop-filter: blur(10px);
  }

  .loading-card,
  .error-card {
    padding: 3rem;
    text-align: center;
  }

  .loading-card p {
    font-size: 1.1rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .error {
    color: #ef4444;
    font-weight: 500;
    margin: 0;
  }

  .loading-text {
    color: var(--color-text-secondary);
    opacity: 0.7;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Dark mode link overrides */
  :global([data-theme="dark"]) .profile-link,
  :global([data-theme="dark"]) .content-link:hover {
    color: #a9c8ff;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .view-header {
      flex-direction: column;
      gap: 1rem;
    }

    .profile-info h1.profile-title {
      font-size: 2rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .activity-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .content-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .content-meta {
      white-space: normal;
    }

    .form-actions {
      flex-direction: column;
    }

    .btn-primary,
    .btn-secondary {
      width: 100%;
      text-align: center;
    }
  }

  @media (max-width: 480px) {
    .profile-container {
      padding: 1rem;
    }

    .glass-card {
      border-radius: 20px;
    }

    .profile-header,
    .account-section,
    .stats-section,
    .content-section,
    .edit-form-container {
      padding: 1.5rem;
    }

    .social-grid {
      grid-template-columns: 1fr;
    }

    .detail-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .detail-value {
      text-align: left;
    }
  }
</style>
