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

<div class="profile-container">
  <h1>Your Profile</h1>

  {#if !user}
    <p>Please sign in to view your profile.</p>
  {:else}
    {#if !editing && success}
      <div class="success">{success}</div>
    {/if}

    {#if editing}
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
    {:else}
      {#if fetching}
        <p>Loading…</p>
      {:else if error}
        <p class="error">{error}</p>
      {:else}
        <div class="profile-view">
          <div class="view-header">
            <div>
              <h2>{displayNameText(displayName) || 'Your Profile'}</h2>
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

          <section class="profile-section account-card">
            <h2>Account Details</h2>
            <dl class="account-list">
              <dt>Sign-in Email</dt>
              <dd>{authEmail || 'Unavailable'}</dd>
              <dt>Profile Link</dt>
              <dd>
                {#if profilePath}
                  <a href={profilePath}>{profilePath}</a>
                {:else}
                  Not available
                {/if}
              </dd>
            </dl>
            <p class="hint">Contact support to update your login email.</p>
          </section>

          <section class="profile-section stats-section">
            <h2>Statistics</h2>
            <div class="stats-container">
              <div class="stat-item">
                <p class="stat-title">Good-Faith Rate</p>
                <p class="stat-value">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.goodFaithRate}%
                  {/if}
                </p>
              </div>
              <div class="stat-item">
                <p class="stat-title">Source Accuracy</p>
                <p class="stat-value">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.sourceAccuracy}%
                  {/if}
                </p>
              </div>
              <div class="stat-item">
                <p class="stat-title">Reputation Score</p>
                <p class="stat-value">
                  {#if statsLoading}
                    <span class="loading-text">...</span>
                  {:else}
                    {stats.reputationScore.toLocaleString()}
                  {/if}
                </p>
              </div>
            </div>
            <div class="activity-summary">
              <p class="activity-item">
                <span class="activity-count">{stats.totalDiscussions.toLocaleString()}</span>
                <span class="activity-label">discussions created</span>
              </p>
              <p class="activity-item">
                <span class="activity-count">{stats.totalPosts.toLocaleString()}</span>
                <span class="activity-label">comments posted</span>
              </p>
              <p class="activity-item">
                <span class="activity-count">{stats.participatedDiscussions.toLocaleString()}</span>
                <span class="activity-label">discussions joined</span>
              </p>
            </div>
          </section>

          <section class="profile-section">
            <h2>Discussions</h2>
            {#if discussions.length === 0}
              <p>No discussions yet.</p>
            {:else}
              <ul class="list">
                {#each discussions as d}
                  <li class="item"><a href={`/discussions/${d.id}`}>{d.title}</a> <span class="meta">· {new Date(d.created_at).toLocaleString()}</span></li>
                {/each}
              </ul>
            {/if}
          </section>

          <section class="profile-section">
            <h2>Comments</h2>
            {#if posts.length === 0}
              <p>No comments yet.</p>
            {:else}
              <ul class="list">
                {#each posts as p}
                  <li class="item">
                    <a href={`/discussions/${p.discussion_id}`}>{toTextSnippet(p.content)}</a>
                    <span class="meta">· {new Date(p.created_at).toLocaleString()}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .profile-container {
    max-width: 900px;
    margin: 2rem auto;
    padding: 1.5rem;
  }
  h1 {
    margin-bottom: 1rem;
  }
  .profile-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .view-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .view-header h2 {
    margin: 0;
  }
  .handle {
    margin: 0.25rem 0 0;
    color: var(--color-text-secondary);
  }
  .profile-view .bio {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .links .link {
    color: var(--color-primary);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .links .link:hover {
    text-decoration: none;
  }
  .links .link.icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    justify-content: center;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
  }
  .links .link.icon:hover {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
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
  .account-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1.25rem;
  }
  .account-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: 1.05rem;
  }
  .account-list {
    margin: 0;
    display: grid;
    grid-template-columns: minmax(140px, auto) 1fr;
    column-gap: 1rem;
    row-gap: 0.5rem;
    align-items: center;
  }
  .account-list dt {
    font-weight: 600;
    color: var(--color-text-secondary);
    margin: 0;
    padding: 0.55rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
  }
  .account-list dd {
    margin: 0;
    padding: 0.55rem 0;
    color: var(--color-text-primary);
    word-break: break-word;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
  }
  .account-list dd:last-of-type {
    border-bottom: none;
  }
  .account-list dt:last-of-type {
    border-bottom: none;
  }
  .profile-section {
    margin-top: 1.5rem;
  }
  .stats-section {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-md);
    padding: 1.5rem;
    margin-top: 1.5rem;
  }
  .stats-section h2 {
    margin: 0 0 1rem 0;
    font-size: 1.05rem;
  }
  .stats-container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .stat-item {
    padding: 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    text-align: center;
    flex: 1;
    min-width: 0;
    transition: background-color 150ms ease-in-out;
  }
  .stat-item:hover {
    background-color: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-alt));
  }
  .stat-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0 0 0.25rem;
    line-height: 1.2;
  }
    /* Nuclear approach - override ALL link colors in dark mode */
  :global([data-theme="dark"] a),
  :global([data-theme="dark"] a:link) {
    color: #a9c8ff;
  }
  .stat-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    line-height: 1.2;
  }
  .loading-text {
    color: var(--color-text-secondary);
    font-weight: 400;
  }
  .activity-summary {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    gap: 1rem;
    border-top: 1px solid var(--color-border);
    padding-top: 1.5rem;
  }
  .activity-item {
    text-align: center;
    margin: 0;
  }
  .activity-count {
    display: block;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-primary);
    margin-bottom: 0.25rem;
  }
  .activity-label {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }
  .list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .item a {
    color: var(--color-text-primary);
    text-decoration: none;
  }
  .item a:hover {
    text-decoration: underline;
  }
  .meta {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    margin-left: 0.35rem;
  }
  .profile-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 100%;
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
    gap: 0.35rem;
  }
  input[type='text'],
  input[type='url'],
  input[type='email'],
  textarea {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.5rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    background: var(--color-input-bg);
    color: var(--color-text-primary);
  }
  textarea {
    resize: vertical;
  }
  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
  .social-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
    width: 100%;
  }
  .social-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .social-field label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .social-field label .icon {
    display: inline-flex;
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
  }
  .social-field label .icon svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  .field.read-only input[readonly] {
    background: color-mix(in srgb, var(--color-input-bg) 70%, transparent);
    color: var(--color-text-secondary);
    cursor: not-allowed;
  }
  .field.read-only .hint {
    color: var(--color-text-secondary);
  }
  .btn-primary {
    align-self: flex-start;
    background: var(--color-primary);
    color: var(--color-surface);
    padding: 0.55rem 1rem;
    border-radius: var(--border-radius-md);
    border: none;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-secondary {
    align-self: flex-start;
    background: transparent;
    color: var(--color-text-secondary);
    padding: 0.55rem 1rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    cursor: pointer;
    font-weight: 500;
  }
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .form-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .error {
    color: #ef4444;
    font-size: 0.9rem;
  }
  .success {
    color: #059669;
    font-size: 0.9rem;
  }
  .hint {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .account-card .hint {
    margin-top: 0.75rem;
    margin-bottom: 0;
  }
  @media (max-width: 768px) {
    .stats-container {
      flex-direction: column;
      gap: 0.5rem;
    }
    .activity-summary {
      flex-direction: column;
      gap: 0.75rem;
    }
    .view-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
  @media (max-width: 560px) {
    .profile-container {
      padding: 1rem;
    }
    .stats-section {
      padding: 1.25rem;
    }
    .account-list {
      grid-template-columns: 1fr;
      row-gap: 0;
    }
  }
</style>
