<script lang="ts">
	import { nhost, ensureContributor } from '$lib/nhostClient';
	import { onMount } from 'svelte';
	import { GET_USER_STATS, UPDATE_CONTRIBUTOR_AVATAR } from '$lib/graphql/queries';
	import { calculateUserStats, type UserStats } from '$lib/utils/userStats';
	import { env as publicEnv } from '$env/dynamic/public';
	import { getOAuthRedirectURL, isStandalone } from '$lib/utils/pwa';
	import ProfilePhotoUpload from '$lib/components/ProfilePhotoUpload.svelte';

	const SITE_URL = publicEnv.PUBLIC_SITE_URL;

	function getRedirect() {
		const isPWA = typeof window !== 'undefined' && isStandalone();
		const baseRedirect = SITE_URL
			? SITE_URL.replace(/\/$/, '') + '/auth/callback'
			: typeof window !== 'undefined'
				? window.location.origin + '/auth/callback'
				: undefined;

		return baseRedirect ? getOAuthRedirectURL(baseRedirect, isPWA) : undefined;
	}

	let user = nhost.auth.getUser();
	let authEmail = user?.email || '';

	// Listen for auth state changes
	nhost.auth.onAuthStateChanged(async (_event, session) => {
		user = session?.user || null;
		authEmail = user?.email || '';

		// Load profile data when auth state becomes available, but avoid duplicate loading
		if (user && !fetching) {
			profilePath = `/u/${user.id}`;
			await loadProfile();
			await loadAuthProviders();
		}
	});
	let loading = false;
	let fetching = false;
	let statsLoading = false;
	let success: string | null = null;
	let error: string | null = null;

	// Auth UI state
	let showAuthOverlay = false;
	let activeAuthView: 'initial' | 'emailPassword' | 'magicLink' | 'securityKey' = 'initial';
	let isLoginView = true;
	let email = '';
	let password = '';
	let authError: string | null = null;
	let magicLinkSent = false;

	// Security settings state
	let showAddPassword = false;
	let showChangePassword = false;
	let hasPasswordAuth = false;
	let newPassword = '';
	let confirmPassword = '';
	let currentPassword = '';
	let newPasswordEmail = '';
	let passwordError: string | null = null;
	let passwordSuccess: string | null = null;
	let addingPassword = false;
	let changingPassword = false;
	let authProviders: string[] = [];
	let loadingProviders = false;

	// Email change state
	let showChangeEmail = false;
	let newEmail = '';
	let emailChangeError: string | null = null;
	let emailChangeSuccess: string | null = null;
	let changingEmail = false;
	let emailVerificationSent = false;

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
        role
        analysis_enabled
        analysis_limit
        analysis_count_used
        analysis_count_reset_at
        purchased_credits_total
        purchased_credits_used
        subscription_tier
        avatar_url
        has_password_auth
      }
      discussion(where: { created_by: { _eq: $id } }, order_by: { created_at: desc }) {
        id
        created_at
        current_version: discussion_versions(
          where: { version_type: { _eq: "published" } }
          order_by: { version_number: desc }
          limit: 1
        ) {
          title
        }
        draft_version: discussion_versions(
          where: { version_type: { _eq: "draft" } }
          order_by: { created_at: desc }
          limit: 1
        ) {
          title
        }
      }
      post(where: { author_id: { _eq: $id }, status: { _in: ["approved", "draft"] } }, order_by: { status: asc, created_at: desc }) {
        id
        discussion_id
        created_at
        content
        status
        post_type
        draft_content
      }
    }
  `;

	// Fallback query without has_password_auth for when schema cache hasn't updated
	const GET_FULL_PROFILE_FALLBACK = `
    query GetFullProfile($id: uuid!) {
      contributor_by_pk(id: $id) {
        id
        auth_email
        display_name
        handle
        bio
        website
        social_links
        role
        analysis_enabled
        analysis_limit
        analysis_count_used
        analysis_count_reset_at
        purchased_credits_total
        purchased_credits_used
        subscription_tier
        avatar_url
      }
      discussion(where: { created_by: { _eq: $id } }, order_by: { created_at: desc }) {
        id
        created_at
        current_version: discussion_versions(
          where: { version_type: { _eq: "published" } }
          order_by: { version_number: desc }
          limit: 1
        ) {
          title
        }
        draft_version: discussion_versions(
          where: { version_type: { _eq: "draft" } }
          order_by: { created_at: desc }
          limit: 1
        ) {
          title
        }
      }
      post(where: { author_id: { _eq: $id }, status: { _in: ["approved", "draft"] } }, order_by: { status: asc, created_at: desc }) {
        id
        discussion_id
        created_at
        content
        status
        post_type
        draft_content
      }
    }
  `;

	// Separate query to fetch just has_password_auth - used when main query fails due to schema cache
	const GET_PASSWORD_AUTH_STATUS = `
    query GetPasswordAuthStatus($id: uuid!) {
      contributor_by_pk(id: $id) {
        id
        has_password_auth
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

	function normalizeDiscussions(list: any[] | null | undefined) {
		if (!Array.isArray(list)) return [];
		return list.map((d) => {
			const current = Array.isArray(d?.current_version) ? d.current_version[0] : null;
			const draft = Array.isArray(d?.draft_version) ? d.draft_version[0] : null;
			return {
				...d,
				title:
					typeof d?.title === 'string' && d.title.trim().length > 0
						? d.title
						: current?.title || draft?.title || 'Untitled discussion'
			};
		});
	}

	function toggleAuthModeView(toLogin?: boolean) {
		if (typeof toLogin === 'boolean') isLoginView = toLogin;
		else isLoginView = !isLoginView;
		activeAuthView = 'initial';
		authError = null;
		magicLinkSent = false;
	}

	async function signInWithGitHub() {
		try {
			await nhost.auth.signIn({ provider: 'github', options: { redirectTo: getRedirect() } });
		} catch (e: any) {
			authError = e.message;
		}
	}

	async function signInWithGoogle() {
		try {
			await nhost.auth.signIn({ provider: 'google', options: { redirectTo: getRedirect() } });
		} catch (e: any) {
			authError = e.message;
		}
	}

	async function login() {
		authError = null;
		try {
			await nhost.auth.signIn({ email, password });
		} catch (e: any) {
			authError = e.message;
		}
	}

	async function signup() {
		authError = null;
		try {
			await nhost.auth.signUp({ email, password });
		} catch (e: any) {
			authError = e.message;
		}
	}

	async function sendMagicLink() {
		authError = null;
		magicLinkSent = false;
		if (!email) {
			authError = 'Please enter an email first.';
			return;
		}
		try {
			const redirectTo = getRedirect();
			await nhost.auth.signIn({
				email,
				...(redirectTo ? { options: { redirectTo } } : {})
			});
			magicLinkSent = true;
		} catch (e: any) {
			console.error('Magic link request failed', e);
			const errorPayload = e?.error ?? e;
			if (errorPayload?.message) authError = errorPayload.message;
			else if (errorPayload?.error) authError = `${errorPayload.error}`;
			else authError = 'Failed to request magic link. Please try again shortly.';
		}
	}

	async function signInWithSecurityKey() {
		alert('Security key sign-in not yet implemented.');
	}

	async function signUpWithSecurityKey() {
		alert('Security key sign-up not yet implemented.');
	}

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

	function getInitials(name?: string): string {
		if (!name) return '?';
		return name
			.trim()
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
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

	function handleAvatarUpdate(newAvatarUrl: string | null) {
		if (contributor) {
			contributor.avatar_url = newAvatarUrl;
		}
		success = newAvatarUrl ? 'Profile photo updated!' : 'Profile photo removed!';
		setTimeout(() => {
			success = null;
		}, 3000);
	}

	async function loadProfile() {
		if (!user) return;
		fetching = true;
		statsLoading = true;
		error = null;
		try {
			let profileResult;
			let statsResult;

			// Try with the full query first
			[profileResult, statsResult] = await Promise.all([
				nhost.graphql.request(GET_FULL_PROFILE, { id: user.id }),
				nhost.graphql.request(GET_USER_STATS, { userId: user.id })
			]);

			// If there's an error about has_password_auth, retry with fallback query
			if (profileResult.error) {
				const errorMsg = extractGqlError(profileResult.error);
				if (errorMsg.includes('has_password_auth')) {
					console.warn('has_password_auth field not available, using fallback query');
					hasPasswordAuth = false;
					// Retry with fallback query that doesn't include has_password_auth
					profileResult = await nhost.graphql.request(GET_FULL_PROFILE_FALLBACK, { id: user.id });
					if (profileResult.error) {
						throw new Error(extractGqlError(profileResult.error));
					}
				} else {
					throw new Error(errorMsg);
				}
			}

			const data = profileResult.data as any;
			contributor = data?.contributor_by_pk ?? null;
			discussions = normalizeDiscussions(data?.discussion);
			// Filter out drafts with empty content
			posts = (data?.post ?? []).filter((p: any) => {
				if (p.status === 'draft') {
					return p.draft_content && p.draft_content.trim().length > 0;
				}
				return true;
			});

			if (!contributor) {
				await ensureContributor();
				const retry = await nhost.graphql.request(GET_FULL_PROFILE, { id: user.id });
				if (retry.error) {
					const retryErrorMsg = extractGqlError(retry.error);
					// If the error is about has_password_auth field, it's a schema cache issue
					if (retryErrorMsg.includes('has_password_auth')) {
						console.warn('has_password_auth field not available on retry, defaulting to false');
						hasPasswordAuth = false;
						// Continue without throwing
					} else {
						throw new Error(retryErrorMsg);
					}
				}
				const retryData = retry.data as any;
				contributor = retryData?.contributor_by_pk ?? null;
				discussions = normalizeDiscussions(retryData?.discussion);
				// Filter out drafts with empty content
				posts = (retryData?.post ?? []).filter((p: any) => {
					if (p.status === 'draft') {
						return p.draft_content && p.draft_content.trim().length > 0;
					}
					return true;
				});
			}

			syncFormFields();

			// Set password auth status from contributor data
			hasPasswordAuth = contributor?.has_password_auth || false;

			// If has_password_auth wasn't in the data (due to schema cache), try fetching it separately
			// Check if field is missing (undefined) or if we know we used the fallback query
			const hasPasswordAuthMissing = contributor && !('has_password_auth' in contributor);
			console.log('Checking has_password_auth presence:', {
				hasField: 'has_password_auth' in (contributor || {}),
				value: contributor?.has_password_auth,
				willFetchSeparately: hasPasswordAuthMissing
			});

			if (hasPasswordAuthMissing) {
				console.log('has_password_auth field missing due to schema cache - will show correct value after page refresh');
				// Schema cache issue - the field will appear correctly after a page reload
				// when the GraphQL schema cache has been updated
			}

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

	async function loadAuthProviders() {
		if (!user) return;
		loadingProviders = true;
		try {
			const response = await fetch(`/api/checkAuthMethods?userId=${user.id}`);
			if (response.ok) {
				const data = await response.json();
				authProviders = data.providers || [];
			}
		} catch (e) {
			console.error('Failed to load auth providers:', e);
		} finally {
			loadingProviders = false;
		}
	}

	function getProviderInfo(providerId: string): { name: string; icon: string } {
		const providers: Record<string, { name: string; icon: string }> = {
			'email': { name: 'Email/Password', icon: '🔐' },
			'email-password': { name: 'Email/Password', icon: '🔐' },
			'github': { name: 'GitHub', icon: '🐙' },
			'google': { name: 'Google', icon: '🔵' },
			'apple': { name: 'Apple', icon: '🍎' },
			'facebook': { name: 'Facebook', icon: '📘' },
			'linkedin': { name: 'LinkedIn', icon: '💼' },
			'twitter': { name: 'Twitter', icon: '🐦' }
		};
		return providers[providerId] || { name: providerId, icon: '🔑' };
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
		const base =
			'width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"';
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

	async function handleAddPassword() {
		passwordError = null;
		passwordSuccess = null;

		// Validation
		if (!newPassword || !confirmPassword) {
			passwordError = 'Please fill in all password fields.';
			return;
		}

		if (newPassword.length < 8) {
			passwordError = 'Password must be at least 8 characters long.';
			return;
		}

		if (newPassword !== confirmPassword) {
			passwordError = 'Passwords do not match.';
			return;
		}

		addingPassword = true;

		try {
			// Use the email from the user object or the entered email
			const emailToUse = user?.email || newPasswordEmail;

			if (!emailToUse) {
				passwordError = 'Email is required to set up password authentication.';
				return;
			}

			// Nhost approach: Use the changePassword method if available, or create a GraphQL mutation
			// Since we're adding a password to an OAuth account, we'll use a GraphQL mutation
			const SET_PASSWORD_MUTATION = `
				mutation SetPassword($userId: uuid!, $passwordHash: String!) {
					update_auth_users_by_pk(
						pk_columns: { id: $userId }
						_set: { password_hash: $passwordHash }
					) {
						id
					}
				}
			`;

			// For Nhost, we can use the auth API to change password
			// This requires the user to be authenticated
			const result = await nhost.auth.changePassword({
				newPassword: newPassword
			});

			if (result.error) {
				throw new Error(result.error.message || 'Failed to add password');
			}

			passwordSuccess = 'Password authentication added successfully! You can now sign in with email and password.';

			// Re-check password auth status to update UI
			await checkPasswordAuth();
			// Reload auth providers to show the updated list
			await loadAuthProviders();

			// Clear form
			newPassword = '';
			confirmPassword = '';

			// Hide form after success
			setTimeout(() => {
				showAddPassword = false;
				passwordSuccess = null;
			}, 3000);

		} catch (err: any) {
			console.error('Error adding password:', err);
			passwordError = err?.message || 'Failed to add password. Please try again.';
		} finally {
			addingPassword = false;
		}
	}

	async function handleChangePassword() {
		passwordError = null;
		passwordSuccess = null;

		// Validation
		if (!currentPassword || !newPassword || !confirmPassword) {
			passwordError = 'Please fill in all password fields.';
			return;
		}

		if (newPassword.length < 8) {
			passwordError = 'New password must be at least 8 characters long.';
			return;
		}

		if (newPassword !== confirmPassword) {
			passwordError = 'New passwords do not match.';
			return;
		}

		if (currentPassword === newPassword) {
			passwordError = 'New password must be different from current password.';
			return;
		}

		changingPassword = true;

		try {
			// Use Nhost's changePassword API
			const result = await nhost.auth.changePassword({
				newPassword: newPassword
			});

			if (result.error) {
				throw new Error(result.error.message || 'Failed to change password');
			}

			passwordSuccess = 'Password changed successfully!';

			// Clear form
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';

			// Hide form after success
			setTimeout(() => {
				showChangePassword = false;
				passwordSuccess = null;
			}, 3000);

		} catch (err: any) {
			console.error('Error changing password:', err);
			passwordError = err?.message || 'Failed to change password. Please try again.';
		} finally {
			changingPassword = false;
		}
	}

	// Check if user has password authentication enabled
	// This is now handled by loadProfile() which gets has_password_auth from contributor table
	async function checkPasswordAuth() {
		if (!user || !contributor) return;

		// Simply reload the profile to get updated has_password_auth status
		await loadProfile();
	}

	onMount(() => {
		if (user?.email) {
			newPasswordEmail = user.email;
		}
	});

	async function handleChangeEmail() {
		emailChangeError = null;
		emailChangeSuccess = null;
		emailVerificationSent = false;

		// Validation
		if (!newEmail) {
			emailChangeError = 'Please enter a new email address.';
			return;
		}

		// Basic email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(newEmail)) {
			emailChangeError = 'Please enter a valid email address.';
			return;
		}

		if (newEmail === user?.email) {
			emailChangeError = 'This is already your current email address.';
			return;
		}

		changingEmail = true;

		try {
			// Use Nhost's changeEmail method
			// This will send a verification email to the new address
			const result = await nhost.auth.changeEmail({
				newEmail: newEmail
			});

			if (result.error) {
				throw new Error(result.error.message || 'Failed to change email');
			}

			emailVerificationSent = true;
			emailChangeSuccess =
				`A verification email has been sent to ${newEmail}. ` +
				`Please check your inbox and click the verification link to complete the email change. ` +
				`Your current email (${user?.email}) will remain active until you verify the new one.`;

			// Clear form
			newEmail = '';

			// Hide form after a delay
			setTimeout(() => {
				showChangeEmail = false;
				emailVerificationSent = false;
			}, 10000); // Longer delay for email change instructions

		} catch (err: any) {
			console.error('Error changing email:', err);
			emailChangeError = err?.message || 'Failed to change email. Please try again.';
		} finally {
			changingEmail = false;
		}
	}
</script>

<div class="editorial-profile-page {editing ? 'editing' : ''}">
	{#if !user}
		<div class="profile-card sign-in-prompt">
			<a href="/" class="logo-link">
				<img src="/logo-only.png" alt="ReasonSmith" class="logo" />
			</a>
			<p>Please sign in to view your profile.</p>
			<button
				class="btn-primary sign-in-btn"
				type="button"
				onclick={() => {
					showAuthOverlay = true;
					toggleAuthModeView(true);
				}}
			>
				Get Started
			</button>
		</div>
	{:else}
		{#if !editing && success}
			<div class="success-banner">{success}</div>
		{/if}

		{#if editing}
			<div class="profile-card edit-form-container">
				<form
					class="profile-form"
					onsubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<fieldset disabled={loading || fetching}>
						<div class="field">
							<ProfilePhotoUpload
								currentAvatarUrl={contributor?.avatar_url}
								contributorId={contributor?.id}
								onUpdate={handleAvatarUpdate}
							/>
						</div>
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
								oninput={() => (handle = (handle || '').toLowerCase())}
							/>
							<small class="hint">Profile URL: {handle ? `/u/${handle}` : '/u/your-handle'}</small>
						</label>

						<label class="field">
							<span>Short Bio</span>
							<textarea
								id="bio"
								rows="8"
								bind:value={bio}
								placeholder="Tell others a bit about you (optional)"
							></textarea>
						</label>

						<label class="field">
							<span>Website</span>
							<input type="url" bind:value={website} placeholder="https://example.com (optional)" />
						</label>

						<div class="social-grid">
							<div class="social-field">
								<label for="social-twitter"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M18.244 2H21.5l-7.5 8.57L22.5 22H15.93l-5.07-5.88L5 22H1.744l8.1-9.26L.5 2H7.242l4.57 5.273L18.244 2Zm-1.155 18h1.92L7.01 4h-1.92l12 16Z"
											/></svg
										>
									</span>Twitter / X</label
								>
								<input
									id="social-twitter"
									type="text"
									bind:value={social.twitter}
									placeholder="@handle or https://x.com/username"
								/>
							</div>
							<div class="social-field">
								<label for="social-github"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												fill-rule="evenodd"
												d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.86 3.15 8.98 7.51 10.43.55.1.75-.24.75-.54v-1.9c-3.05.66-3.7-1.27-3.7-1.27-.5-1.26-1.22-1.6-1.22-1.6-1-.7.08-.68.08-.68 1.1.08 1.68 1.13 1.68 1.13.98 1.67 2.57 1.18 3.2.9.1-.7.38-1.18.68-1.45-2.43-.27-4.98-1.22-4.98-5.43 0-1.2.43-2.18 1.13-2.95-.1-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.13.9-.25 1.86-.38 2.82-.38.96 0 1.92.13 2.82.38 2.15-1.44 3.1-1.13 3.1-1.13.6 1.55.2 2.7.1 2.98.7.77 1.12 1.75 1.12 2.95 0 4.22-2.56 5.16-5 5.43.4.35.74 1.03.74 2.08v3.08c0 .3.2.65.76.54 4.35-1.45 7.5-5.57 7.5-10.43C23.02 5.24 18.27.5 12 .5Z"
												clip-rule="evenodd"
											/></svg
										>
									</span>GitHub</label
								>
								<input
									id="social-github"
									type="text"
									bind:value={social.github}
									placeholder="username or https://github.com/username"
								/>
							</div>
							<div class="social-field">
								<label for="social-linkedin"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.83v2h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.08V23h-4v-5.9c0-1.41-.03-3.22-1.96-3.22-1.96 0-2.26 1.53-2.26 3.11V23h-4V8.5z"
											/></svg
										>
									</span>LinkedIn</label
								>
								<input
									id="social-linkedin"
									type="text"
									bind:value={social.linkedin}
									placeholder="profile URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-mastodon"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M21.57 13.19c-.29 1.48-2.62 3.1-5.3 3.43-1.4.18-2.78.35-4.25.28-2.4-.11-4.31-.57-4.31-.57 0 .23.01.46.04.68.31 2.35 2.34 2.49 4.25 2.56 1.93.07 3.65-.47 3.65-.47l.08 1.8s-1.35.73-3.76.86c-1.33.07-2.99-.03-4.92-.52-4.18-1.06-4.9-5.35-4.99-9.69-.03-1.34-.01-2.6-.01-3.65 0-4.99 3.27-6.46 3.27-6.46 1.65-.76 4.49-1.08 7.45-1.1h.07c2.96.02 5.8.34 7.45 1.1 0 0 3.27 1.47 3.27 6.46 0 0 .04 3.02-.99 5.69zM17.55 6.6h-2.22v6.85h-2.53V6.6h-2.21V4.44h6.96V6.6z"
											/></svg
										>
									</span>Mastodon</label
								>
								<input
									id="social-mastodon"
									type="text"
									bind:value={social.mastodon}
									placeholder="@user@instance or profile URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-bluesky"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M12 9.8C9.5 6.5 6.3 3.7 3 2c1.2 3.6 3 7.1 6 9-3 1.9-4.8 5.4-6 9 3.3-1.7 6.5-4.5 9-7.8 2.5 3.3 5.7 6.1 9 7.8-1.2-3.6-3-7.1-6-9 3-1.9 4.8-5.4 6-9-3.3 1.7-6.5 4.5-9 7.8z"
											/></svg
										>
									</span>Bluesky</label
								>
								<input
									id="social-bluesky"
									type="text"
									bind:value={social.bluesky}
									placeholder="handle or profile URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-facebook"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07C2 17.1 5.66 21.2 10.44 22v-7.02H7.9v-2.9h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.25c-1.23 0-1.62.77-1.62 1.56v1.88h2.77l-.44 2.9h-2.33V22C18.34 21.2 22 17.1 22 12.07z"
											/></svg
										>
									</span>Facebook</label
								>
								<input
									id="social-facebook"
									type="text"
									bind:value={social.facebook}
									placeholder="profile/page URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-instagram"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.3 2.4.6.6.3 1 .6 1.5 1.1.5.5.8.9 1.1 1.5.3.5.5 1.2.6 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.9-.6 2.4-.3.6-.6 1-1.1 1.5-.5.5-.9.8-1.5 1.1-.5.3-1.2.5-2.4.6-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.3-2.4-.6-.6-.3-1-.6-1.5-1.1-.5-.5-.8-.9-1.1-1.5-.3-.5-.5-1.2-.6-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.9.6-2.4.3-.6.6-1 1.1-1.5.5-.5.9-.8 1.5-1.1.5-.3 1.2-.5 2.4-.6C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.7.2 4.8.4 4 .8 3.2 1.2 2.5 1.7 1.7 2.5 1 3.2.5 3.9.1 4.7c-.4.8-.6 1.7-.7 3C-.7 9 .7 9.4 0 12c.7 2.6.4 3 .4 5.3.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.7 2.3.8.8 1.5 1.2 2.3 1.6.8.4 1.7.6 3 .7 1.3.1 1.7.1 5.3.1s4 0 5.3-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.3-1.6.8-.4 1.3-1.1 1.7-2.3.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5.3s0-4-.1-5.3c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.7-2.3C21.5.5 20.8 0 20 0c-.8-.4-1.7-.6-3-.7C15.6-.8 15.2-.8 12-.8z"
											/><circle cx="12" cy="12" r="3.2" /><circle cx="18.4" cy="5.6" r="1.2" /></svg
										>
									</span>Instagram</label
								>
								<input
									id="social-instagram"
									type="text"
									bind:value={social.instagram}
									placeholder="@handle or profile URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-youtube"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M23.5 6.2a3.1 3.1 0 0 0-2.2-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.3.5A3.1 3.1 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.1 3.1 0 0 0 2.2 2.2c1.8.5 9.3.5 9.3.5s7.5 0 9.3-.5a3.1 3.1 0 0 0 2.2-2.2 32 32 0 0 0 .5-5.8 32 32 0 0 0-.5-5.8zM9.7 15.5V8.5l6.2 3.5-6.2 3.5z"
											/></svg
										>
									</span>YouTube</label
								>
								<input
									id="social-youtube"
									type="text"
									bind:value={social.youtube}
									placeholder="channel URL"
								/>
							</div>
							<div class="social-field">
								<label for="social-tiktok"
									><span class="icon" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
											><path
												d="M19 7.5c-2 0-3.7-1.6-3.7-3.6V3h-3.2v10.6c0 1.5-1.2 2.7-2.8 2.7S6.5 15 6.5 13.6s1.2-2.7 2.8-2.7c.3 0 .6 0 .9.1V7.7c-.3 0-.6-.1-.9-.1-3.1 0-5.6 2.4-5.6 5.4S6.2 18.5 9.3 18.5s5.6-2.4 5.6-5.4v-4c1 1 2.4 1.7 4 1.7V7.5H19z"
											/></svg
										>
									</span>TikTok</label
								>
								<input
									id="social-tiktok"
									type="text"
									bind:value={social.tiktok}
									placeholder="@handle or profile URL"
								/>
							</div>
						</div>

						{#if error}<div class="error">{error}</div>{/if}
						<div class="form-actions">
							<button class="btn-primary" type="submit" disabled={loading}>
								{#if loading}Saving…{:else}Save Profile{/if}
							</button>
							<button class="btn-secondary" type="button" onclick={cancelEdit} disabled={loading}
								>Cancel</button
							>
						</div>
					</fieldset>
				</form>
			</div>
		{:else if fetching}
			<div class="profile-card loading-card">
				<p>Loading…</p>
			</div>
		{:else if error}
			<div class="profile-card error-card">
				<p class="error">{error}</p>
			</div>
		{:else}
			<div class="profile-view">
				<div class="profile-card profile-header">
					<div class="view-header">
						<div class="profile-main">
							{#if contributor?.avatar_url}
								<img
									src={contributor.avatar_url}
									alt="{displayNameText(displayName)}'s profile photo"
									class="profile-avatar"
								/>
							{:else}
								<div class="profile-avatar-placeholder">
									<span class="avatar-initials">{getInitials(displayNameText(displayName))}</span>
								</div>
							{/if}
							<div class="profile-info">
								<h1 class="profile-title">{displayNameText(displayName) || 'Your Profile'}</h1>
								{#if handle}
									<p class="handle">@{handle}</p>
								{/if}
							</div>
						</div>
						<button class="btn-primary" type="button" onclick={enterEdit}>Edit Profile</button>
					</div>

					{#if bio}
						<p class="bio">{bio}</p>
					{/if}

					{#if website || (contributor?.social_links && Object.values(contributor.social_links).some(Boolean))}
						<div class="links">
							{#if website}
								<a class="link website" href={website} target="_blank" rel="noopener"
									>{websiteLabel(website)}</a
								>
							{/if}
							{#if contributor?.social_links}
								{#each Object.entries(contributor.social_links) as [key, val]}
									{#if val}
										{@const href = getSocialLink(key, String(val))}
										{#if href}
											<a
												class="link icon"
												{href}
												target="_blank"
												rel="noopener"
												title={key}
												aria-label={key}
											>
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

				<div class="profile-card account-section">
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
				</div>

				<!-- Security Settings Section -->
				<div class="profile-card security-section">
					<h3 class="section-title">Security Settings</h3>
					<div class="security-content">
						<!-- Email Change Section -->
						<div class="security-info">
							<div class="security-item">
								<div class="security-icon">📧</div>
								<div class="security-details">
									<h4>Email Address</h4>
									<p class="security-description">
										Change your account email address. Your reputation and all data will be preserved.
									</p>
									<div class="current-email">
										<span class="email-label">Current Email:</span>
										<span class="email-value">{user?.email || 'Not set'}</span>
									</div>
								</div>
							</div>

							{#if !showChangeEmail}
								<button class="btn-secondary" onclick={() => (showChangeEmail = true)}>
									Change Email Address
								</button>
							{/if}

							{#if showChangeEmail}
								<div class="change-email-form">
									<h4>Change Email Address</h4>
									<p class="form-description">
										Enter your new email address. We'll send a verification link to confirm the change.
										Your account will continue to use your current email until you verify the new one.
									</p>

									<label class="field">
										<span>Current Email</span>
										<input type="email" value={user?.email || ''} readonly disabled />
									</label>

									<label class="field">
										<span>New Email Address</span>
										<input
											type="email"
											bind:value={newEmail}
											placeholder="your.new@email.com"
											disabled={changingEmail || emailVerificationSent}
										/>
										<small class="hint">You will need to verify this email address</small>
									</label>

									{#if emailChangeError}
										<div class="error-message">{emailChangeError}</div>
									{/if}

									{#if emailChangeSuccess}
										<div class="success-message verification-notice">
											<div class="notice-icon">✉️</div>
											<div class="notice-content">
												{emailChangeSuccess}
											</div>
										</div>
									{/if}

									{#if !emailVerificationSent}
										<div class="form-actions">
											<button
												class="btn-primary"
												onclick={handleChangeEmail}
												disabled={changingEmail}
											>
												{changingEmail ? 'Sending Verification...' : 'Send Verification Email'}
											</button>
											<button
												class="btn-secondary"
												onclick={() => {
													showChangeEmail = false;
													newEmail = '';
													emailChangeError = null;
													emailChangeSuccess = null;
												}}
												disabled={changingEmail}
											>
												Cancel
											</button>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Password Authentication Section -->
						<div class="security-info">
							<div class="security-item">
								<div class="security-icon">🔐</div>
								<div class="security-details">
									<h4>Authentication Methods</h4>
									<p class="security-description">
										Manage your sign-in methods. You can add email/password as a backup to your OAuth accounts.
									</p>
									<div class="auth-methods-list">
										{#if user?.email}
											<div class="auth-method">
												<span class="method-icon">✓</span>
												<span class="method-name">Email ({user.email})</span>
											</div>
										{/if}

										<!-- Show OAuth providers from auth_user_providers table -->
										{#if authProviders.length > 0}
											{#each authProviders as providerId}
												{@const providerInfo = getProviderInfo(providerId)}
												<div class="auth-method">
													<span class="method-icon">{providerInfo.icon}</span>
													<span class="method-name">{providerInfo.name}</span>
												</div>
											{/each}
										{/if}

										<!-- Always show password auth status based on has_password_auth field -->
										{#if hasPasswordAuth}
											<div class="auth-method">
												<span class="method-icon">🔐</span>
												<span class="method-name">Email/Password</span>
											</div>
										{/if}

										<!-- Show loading state -->
										{#if loadingProviders}
											<div class="auth-method loading">
												<span class="method-icon">⏳</span>
												<span class="method-name">Loading...</span>
											</div>
										{/if}
									</div>
								</div>
							</div>

							{#if !hasPasswordAuth && !showAddPassword}
								<button class="btn-secondary" onclick={() => (showAddPassword = true)}>
									Add Email/Password Authentication
								</button>
							{/if}

							{#if showAddPassword}
								<div class="add-password-form">
									<h4>Add Password Authentication</h4>
									<p class="form-description">
										Create a password to enable email/password sign-in as a backup to your OAuth
										method.
									</p>

									<label class="field">
										<span>Email (for password reset)</span>
										<input
											type="email"
											bind:value={newPasswordEmail}
											placeholder={user?.email || 'your@email.com'}
											readonly={!!user?.email}
										/>
										<small class="hint">
											{user?.email ? 'Using your account email' : 'Enter your email address'}
										</small>
									</label>

									<label class="field">
										<span>New Password</span>
										<input
											type="password"
											bind:value={newPassword}
											placeholder="Enter a strong password"
											minlength="8"
										/>
										<small class="hint">Minimum 8 characters</small>
									</label>

									<label class="field">
										<span>Confirm Password</span>
										<input
											type="password"
											bind:value={confirmPassword}
											placeholder="Re-enter your password"
										/>
									</label>

									{#if passwordError}
										<div class="error-message">{passwordError}</div>
									{/if}

									{#if passwordSuccess}
										<div class="success-message">{passwordSuccess}</div>
									{/if}

									<div class="form-actions">
										<button
											class="btn-primary"
											onclick={handleAddPassword}
											disabled={addingPassword}
										>
											{addingPassword ? 'Adding...' : 'Add Password'}
										</button>
										<button
											class="btn-secondary"
											onclick={() => {
												showAddPassword = false;
												newPassword = '';
												confirmPassword = '';
												passwordError = null;
											}}
											disabled={addingPassword}
										>
											Cancel
										</button>
									</div>
								</div>
							{/if}

							{#if hasPasswordAuth && !showChangePassword}
								<button class="btn-secondary" onclick={() => (showChangePassword = true)}>
									Change Password
								</button>
							{/if}

							{#if showChangePassword}
								<div class="add-password-form">
									<h4>Change Password</h4>
									<p class="form-description">
										Update your password for email/password sign-in.
									</p>

									<label class="field">
										<span>Current Password</span>
										<input
											type="password"
											bind:value={currentPassword}
											placeholder="Enter your current password"
										/>
									</label>

									<label class="field">
										<span>New Password</span>
										<input
											type="password"
											bind:value={newPassword}
											placeholder="Enter a strong password"
											minlength="8"
										/>
										<small class="hint">Minimum 8 characters</small>
									</label>

									<label class="field">
										<span>Confirm New Password</span>
										<input
											type="password"
											bind:value={confirmPassword}
											placeholder="Re-enter your new password"
										/>
									</label>

									{#if passwordError}
										<div class="error-message">{passwordError}</div>
									{/if}

									{#if passwordSuccess}
										<div class="success-message">{passwordSuccess}</div>
									{/if}

									<div class="form-actions">
										<button
											class="btn-primary"
											onclick={handleChangePassword}
											disabled={changingPassword}
										>
											{changingPassword ? 'Changing...' : 'Change Password'}
										</button>
										<button
											class="btn-secondary"
											onclick={() => {
												showChangePassword = false;
												currentPassword = '';
												newPassword = '';
												confirmPassword = '';
												passwordError = null;
												passwordSuccess = null;
											}}
											disabled={changingPassword}
										>
											Cancel
										</button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				{#if contributor?.role === 'admin'}
					<div class="profile-card analysis-credits-section">
						<h3 class="section-title" hidden>Analysis Access</h3>
						<div class="credits-info">
							<div class="credit-status unlimited">
								<div class="status-icon">🌟</div>
								<div class="status-text">
									<div class="status-label">Root Administrator</div>
									<div class="status-description">
										You have unlimited analysis access with root administrative privileges and
										complete role management.
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else if contributor?.role === 'slartibartfast'}
					<div class="profile-card analysis-credits-section">
						<h3 class="section-title" hidden>Analysis Access</h3>
						<div class="credits-info">
							<div class="credit-status unlimited">
								<div class="status-icon">👑</div>
								<div class="status-text">
									<div class="status-label">Site Manager</div>
									<div class="status-description">
										You have unlimited analysis access and manage featured content, disputes, and
										site operations.
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="profile-card analysis-credits-section">
						<h3 class="section-title">Analysis Credits</h3>
						<div class="credits-info">
							{#if !contributor?.analysis_enabled}
								<div class="credit-status disabled">
									<div class="status-icon">🚫</div>
									<div class="status-text">
										<div class="status-label">Analysis Disabled</div>
										<div class="status-description">
											Contact an administrator to enable analysis access.
										</div>
									</div>
								</div>
							{:else if contributor?.analysis_limit === null}
								<div class="credit-status unlimited">
									<div class="status-icon">∞</div>
									<div class="status-text">
										<div class="status-label">Unlimited Access</div>
										<div class="status-description">You have unlimited analysis credits.</div>
									</div>
								</div>
							{:else}
								<div class="credit-status limited">
									<div class="status-icon">🔢</div>
									<div class="status-text">
										<!-- Monthly Credits -->
										<div class="credit-tier">
											<div class="status-label">
												Monthly: {(contributor?.analysis_limit || 0) -
													(contributor?.analysis_count_used || 0)}
												of {contributor?.analysis_limit || 0} remaining
											</div>
											<div class="status-description">Resets at the end of the month</div>
										</div>

										<!-- Purchased Credits -->
										<div class="credit-tier">
											<div class="status-label">
												Purchased: {(contributor?.purchased_credits_total || 0) -
													(contributor?.purchased_credits_used || 0)}
												of {contributor?.purchased_credits_total || 0} available
											</div>
											<div class="status-description">
												Used only after monthly credits are exhausted
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="profile-card stats-section">
					<h3 class="section-title" hidden>Your Statistics</h3>
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

				<div class="profile-card content-section">
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

				<div class="profile-card content-section">
					<h3 class="section-title">Recent Comments</h3>
					{#if posts.length === 0}
						<p class="empty-state">No comments yet.</p>
					{:else}
						<div class="content-list">
							{#each posts as p}
								<div class="content-item">
									<a
										href={p.status === 'draft'
											? `/discussions/${p.discussion_id}?replyDraftId=${p.id}`
											: `/discussions/${p.discussion_id}`}
										class="content-link"
										>{toTextSnippet(p.status === 'draft' ? p.draft_content || '' : p.content)}</a
									>
									<span class="content-meta">
										{p.status === 'draft' ? 'Draft • ' : ''}{new Date(
											p.created_at
										).toLocaleDateString()}
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Legal Links Footer -->
			<div class="profile-legal-footer">
				<a href="/terms">Terms of Service</a>
				<span class="separator">•</span>
				<a href="/privacy">Privacy Policy</a>
				<span class="separator">•</span>
				<a href="/resources/community-guidelines">Community Guidelines</a>
			</div>
		{/if}
	{/if}
</div>

{#if showAuthOverlay}
	<div
		class="login-page-wrapper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="auth-dialog-title"
	>
		<div class="login-container">
			<button
				class="close-auth-overlay"
				type="button"
				onclick={() => (showAuthOverlay = false)}
				aria-label="Close authentication panel">&times;</button
			>
			<h2 id="auth-dialog-title">{isLoginView ? 'Login' : 'Sign Up'}</h2>

			{#if activeAuthView === 'initial'}
				<div class="auth-method-buttons">
					<button
						aria-label="Continue with Email/Password"
						type="button"
						class="oauth-button"
						onclick={() => (activeAuthView = 'emailPassword')}>Continue with Email/Password</button
					>
					<button type="button" class="oauth-button" onclick={() => (activeAuthView = 'magicLink')}
						>{isLoginView ? 'Use Magic Link to Sign In' : 'Use Magic Link to Sign Up'}</button
					>
					<button
						type="button"
						class="oauth-button"
						onclick={() => (activeAuthView = 'securityKey')}
						>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button
					>
				</div>

				<div class="oauth-buttons">
					<button
						type="button"
						class="oauth-button"
						onclick={signInWithGoogle}
						aria-label="Sign in with Google"><span>Sign in with Google</span></button
					>
					<button
						type="button"
						class="oauth-button"
						onclick={signInWithGitHub}
						aria-label="Sign in with GitHub"><span>Sign in with GitHub</span></button
					>
				</div>
				<button
					type="button"
					class="toggle-auth-mode"
					onclick={() => toggleAuthModeView(!isLoginView)}
					>{isLoginView
						? "Don't have an account? Sign up"
						: 'Already have an account? Log in'}</button
				>
			{:else if activeAuthView === 'emailPassword'}
				<input type="email" placeholder="Email" bind:value={email} />
				<input type="password" placeholder="Password" bind:value={password} />
				<button type="button" class="auth-primary-action" onclick={isLoginView ? login : signup}
					>{isLoginView ? 'Login' : 'Sign Up'}</button
				>
				<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}
					>Back to options</button
				>
			{:else if activeAuthView === 'magicLink'}
				<input type="email" placeholder="Email" bind:value={email} />
				<button type="button" class="oauth-button" onclick={sendMagicLink} disabled={magicLinkSent}
					>{magicLinkSent ? 'Magic Link Sent' : 'Send Magic Link'}</button
				>
				<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}
					>Back to options</button
				>
			{:else if activeAuthView === 'securityKey'}
				<input type="email" placeholder="Email (required for Security Key)" bind:value={email} />
				<button
					type="button"
					class="oauth-button"
					onclick={isLoginView ? signInWithSecurityKey : signUpWithSecurityKey}
					>{isLoginView ? 'Sign In' : 'Sign Up'} with Security Key</button
				>
				<button type="button" class="toggle-auth-mode" onclick={() => (activeAuthView = 'initial')}
					>Back to options</button
				>
			{/if}

			{#if authError}
				<p class="auth-error" aria-live="polite">{authError}</p>
			{/if}
			{#if magicLinkSent}
				<p class="auth-success" aria-live="polite">Magic link sent. Check your email.</p>
			{/if}

			<div class="legal-links">
				<a href="/terms">Terms of Service</a>
				<a href="/privacy">Privacy Policy</a>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Editorial profile page styling */
	.editorial-profile-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin-top: 2rem;
		background: var(--color-surface-alt);
		min-height: 100vh;
	}

	/* Profile card styling */
	.profile-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
		position: relative;
		transition: box-shadow 0.2s ease;
	}

	.profile-card:hover {
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	}

	/* Layout */

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

	.profile-main {
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
	}

	.profile-avatar,
	.profile-avatar-placeholder {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		flex-shrink: 0;
		border: 3px solid var(--color-border);
	}

	.profile-avatar {
		object-fit: cover;
		display: block;
	}

	.profile-avatar-placeholder {
		background: var(--color-surface-alt);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-initials {
		font-size: 2rem;
		font-weight: 600;
		color: var(--color-text-secondary);
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
		display: flex;
		justify-content: center;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 20px;
		padding: 0.5rem;
		max-width: 8rem;
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
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-primary);
		margin-bottom: 0.5rem;
		text-shadow: 0 2px 4px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.activity-grid {
		display: flex;
		justify-content: center;
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
		min-width: 90vw;
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
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		padding: 0.625rem 1.25rem;
		border-radius: 3px;
		font-weight: 500;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
		letter-spacing: 0.025em;
	}

	.btn-primary:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: var(--color-surface-alt);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.sign-in-prompt p {
		font-size: 1.1rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.logo-link {
		display: inline-block;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.logo-link:hover {
		transform: translateY(-2px);
	}

	.logo {
		width: 80px;
		height: 80px;
		object-fit: contain;
		filter: drop-shadow(0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent));
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.logo:hover {
		filter: drop-shadow(0 6px 16px color-mix(in srgb, var(--color-primary) 25%, transparent));
	}

	.sign-in-btn {
		margin-top: 0.5rem;
	}

	.success-banner {
		background: linear-gradient(
			135deg,
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
	:global([data-theme='dark']) .profile-link,
	:global([data-theme='dark']) .content-link:hover {
		color: #a9c8ff;
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.view-header {
			flex-direction: column;
			align-items: center;
			gap: 1rem;
		}

		.profile-main {
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 1rem;
		}

		.profile-avatar,
		.profile-avatar-placeholder {
			width: 100px;
			height: 100px;
		}

		.avatar-initials {
			font-size: 1.5rem;
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
		.profile-card {
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

	/* Analysis Credits Section */
	.analysis-credits-section {
		padding: 1.5rem;
		position: relative;
		overflow: hidden;
	}

	.credits-info {
		padding: 0.5rem 0;
	}

	.credit-status {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 16px;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		transition: all 0.3s ease;
	}

	.credit-status:hover {
		background: color-mix(in srgb, var(--color-surface-alt) 60%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.status-icon {
		font-size: 2rem;
		filter: drop-shadow(0 2px 4px color-mix(in srgb, var(--color-primary) 15%, transparent));
	}

	.status-text {
		flex: 1;
	}

	.status-label {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: 0.25rem;
		font-family: var(--font-family-display);
	}

	.status-description {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.credit-status.disabled {
		border-color: color-mix(in srgb, #ef4444 40%, transparent);
		background: color-mix(in srgb, #ef4444 8%, transparent);
	}

	.credit-status.disabled:hover {
		background: color-mix(in srgb, #ef4444 12%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #ef4444 15%, transparent);
	}

	.credit-status.unlimited {
		border-color: color-mix(in srgb, #10b981 40%, transparent);
		background: color-mix(in srgb, #10b981 8%, transparent);
	}

	.credit-status.unlimited:hover {
		background: color-mix(in srgb, #10b981 12%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #10b981 15%, transparent);
	}

	.credit-status.limited {
		border-color: color-mix(in srgb, #f59e0b 40%, transparent);
		background: color-mix(in srgb, #f59e0b 8%, transparent);
	}

	.credit-status.limited:hover {
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		box-shadow: 0 8px 25px color-mix(in srgb, #f59e0b 15%, transparent);
	}

	@media (max-width: 768px) {
		.credit-status {
			padding: 1rem;
			gap: 0.75rem;
		}

		.status-icon {
			font-size: 1.5rem;
		}

		.status-label {
			font-size: 1rem;
		}

		.status-description {
			font-size: 0.85rem;
		}
	}

	/* Authentication overlay styles */
	.login-page-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-surface) 40%, transparent) 0%,
			color-mix(in srgb, var(--color-primary) 8%, transparent) 50%,
			color-mix(in srgb, var(--color-accent) 6%, transparent) 100%
		);
		backdrop-filter: blur(20px) saturate(1.2);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.login-container {
		position: relative;
		margin: 0;
		max-width: 480px;
		width: 100%;
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		backdrop-filter: blur(30px) saturate(1.3);
		border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
		padding: 3rem;
		border-radius: 30px;
		box-shadow:
			0 20px 60px color-mix(in srgb, var(--color-primary) 15%, transparent),
			0 8px 32px color-mix(in srgb, var(--color-surface) 20%, transparent);
		color: var(--color-text-primary);
		display: flex;
		flex-direction: column;
		animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	#auth-dialog-title {
		text-align: center;
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		font-weight: 900;
		color: var(--color-text-primary);
		margin-bottom: 2rem;
		font-family: var(--font-family-display);
		letter-spacing: -0.02em;
		position: relative;
	}

	#auth-dialog-title::after {
		content: '';
		position: absolute;
		bottom: -10px;
		left: 50%;
		transform: translateX(-50%);
		width: 40px;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
		border-radius: 2px;
	}

	.auth-method-buttons,
	.oauth-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.oauth-buttons {
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.auth-method-buttons button,
	.auth-method-buttons .oauth-button,
	.oauth-buttons .oauth-button {
		margin-bottom: 0;
	}

	.toggle-auth-mode {
		background: none;
		border: none;
		color: var(--color-primary);
		cursor: pointer;
		padding: 1rem 0;
		margin-top: 1.5rem;
		text-decoration: none;
		text-align: center;
		width: 100%;
		font-weight: 500;
		transition: all 0.2s ease;
		border-radius: 12px;
	}

	.toggle-auth-mode:hover {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.auth-primary-action {
		width: 100%;
		padding: 1rem 2rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
		color: var(--color-surface);
		border: none;
		border-radius: 16px;
		font-size: 1rem;
		font-weight: 600;
		font-family: var(--font-family-display);
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 25%, transparent);
		position: relative;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.auth-primary-action::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		transition: left 0.5s;
	}

	.auth-primary-action:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 30px color-mix(in srgb, var(--color-primary) 35%, transparent);
		filter: brightness(1.05);
	}

	.auth-primary-action:hover::before {
		left: 100%;
	}

	.auth-primary-action:active {
		transform: translateY(0);
	}

	.close-auth-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 40px;
		height: 40px;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.close-auth-overlay:hover {
		color: var(--color-text-primary);
		background: color-mix(in srgb, var(--color-surface-alt) 70%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 10%, transparent);
	}

	.oauth-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		background: color-mix(in srgb, var(--color-surface) 50%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-weight: 500;
		position: relative;
		overflow: hidden;
	}

	.oauth-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
		transition: left 0.5s;
	}

	.oauth-button:hover {
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		transform: translateY(-2px);
		box-shadow: 0 8px 25px color-mix(in srgb, var(--color-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	.oauth-button:hover::before {
		left: 100%;
	}

	.oauth-button[disabled] {
		opacity: 0.6;
		cursor: default;
	}

	.legal-links {
		margin-top: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
	}

	.legal-links a {
		color: var(--color-text-secondary);
		text-decoration: none;
		margin: 0 0.5rem;
	}

	.legal-links a:hover {
		text-decoration: underline;
		color: var(--color-primary);
	}

	.profile-legal-footer {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.profile-legal-footer a {
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.profile-legal-footer a:hover {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.profile-legal-footer .separator {
		margin: 0 0.75rem;
		opacity: 0.5;
	}

	.auth-error {
		color: #ef4444;
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}

	.auth-success {
		color: #16a34a;
		margin-top: 0.75rem;
		font-size: 0.875rem;
	}

	.login-container input {
		padding: 1rem;
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--color-surface) 60%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text-primary);
		font-size: 1rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		margin-bottom: 1rem;
	}

	.login-container input:focus {
		outline: none;
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
		transform: translateY(-1px);
	}

	.login-container input::placeholder {
		color: var(--color-text-secondary);
	}

	/* Security Settings Section */
	.security-section {
		margin-bottom: 2rem;
	}

	.security-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.security-info {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.security-item {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.security-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.security-details {
		flex: 1;
	}

	.security-details h4 {
		font-family: var(--font-family-display);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
	}

	.security-description {
		color: var(--color-text-secondary);
		font-size: 0.9375rem;
		margin: 0 0 1rem 0;
		line-height: var(--line-height-normal);
	}

	.auth-methods-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.auth-method {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		font-size: 0.9375rem;
	}

	.auth-method.not-configured {
		opacity: 0.6;
		border-style: dashed;
	}

	.auth-method.loading {
		opacity: 0.7;
		font-style: italic;
	}

	.method-icon {
		color: var(--color-primary);
		font-weight: 600;
		font-size: 1.1rem;
	}

	.auth-method.not-configured .method-icon {
		color: var(--color-text-secondary);
	}

	.auth-method.loading .method-icon {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.method-name {
		color: var(--color-text-primary);
	}

	.add-password-form {
		margin-top: 1.5rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
	}

	.add-password-form h4 {
		font-family: var(--font-family-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
	}

	.form-description {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 0 0 1.5rem 0;
		line-height: var(--line-height-normal);
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.form-actions button {
		flex: 1;
	}

	.error-message {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
		border-radius: 8px;
		color: #dc2626;
		font-size: 0.875rem;
		margin-top: 1rem;
	}

	.success-message {
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, #10b981 10%, transparent);
		border: 1px solid color-mix(in srgb, #10b981 30%, transparent);
		border-radius: 8px;
		color: #059669;
		font-size: 0.875rem;
		margin-top: 1rem;
	}

	/* Email Change Section */
	.current-email {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-surface-alt) 30%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
		border-radius: 8px;
		margin-top: 1rem;
	}

	.email-label {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.email-value {
		color: var(--color-text-primary);
		font-family: var(--font-family-mono, monospace);
		font-size: 0.9375rem;
	}

	.change-email-form {
		margin-top: 1.5rem;
		padding: 1.5rem;
		background: color-mix(in srgb, var(--color-surface-alt) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
		border-radius: 12px;
	}

	.change-email-form h4 {
		font-family: var(--font-family-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
	}

	.verification-notice {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		padding: 1rem 1.25rem;
	}

	.notice-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.notice-content {
		flex: 1;
		line-height: var(--line-height-normal);
	}

	.field input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
	}

	@media (max-width: 768px) {
		.form-actions {
			flex-direction: column;
		}

		.security-item {
			flex-direction: column;
			text-align: center;
		}

		.security-icon {
			margin: 0 auto;
		}

		.current-email {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
