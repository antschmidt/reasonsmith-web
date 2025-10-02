# PWA OAuth Fix - Testing Guide

## Problem Summary

**Issue:** After logging in via OAuth (GitHub) in the PWA, users see a browser navigation bar. Clicking the X closes the app and appears to log them out.

**Root Cause:** OAuth providers (GitHub, Google) must open in the system browser for security. The redirect back to `/auth/callback` opens in a browser tab instead of returning to the PWA app context. Closing that tab doesn't transfer the session properly.

## Solution Implemented

### Multi-Component Fix

1. **PWA Detection Utility** (`src/lib/utils/pwa.ts`)
   - Detects if app is running in standalone PWA mode
   - Provides OAuth redirect URL helpers
   - Handles context detection

2. **Enhanced Auth Callback** (`src/routes/auth/callback/+page.svelte`)
   - Detects if in browser vs PWA context
   - Shows "Return to App" button instead of auto-redirecting when in browser
   - Auto-redirects after 3 seconds as fallback
   - Preserves auth session properly

3. **Updated OAuth Handlers** (All OAuth entry points)
   - Login page (`/login`)
   - Home page (`/`)
   - Profile page (`/profile`)
   - All now include `?pwa=1` parameter in redirect URL when initiated from PWA

## How It Works Now

### OAuth Flow - PWA Context

```
1. User in PWA taps "Sign in with GitHub"
2. OAuth handler detects standalone mode → adds ?pwa=1 to redirect
3. GitHub opens in system browser (required)
4. User authenticates with GitHub
5. GitHub redirects to /auth/callback?pwa=1
6. Callback page detects:
   - Not in standalone mode (browser)
   - ?pwa=1 present (came from PWA)
7. Shows "Return to App" button with success message
8. User taps button → returns to PWA with auth intact
9. ✅ User is logged in, session persists
```

### OAuth Flow - Browser Context

```
1. User in browser clicks "Sign in with GitHub"
2. OAuth handler detects browser mode → normal redirect
3. GitHub redirects to /auth/callback (no ?pwa=1)
4. Callback page auto-redirects to home
5. ✅ User is logged in normally
```

## Testing Instructions

### Test 1: PWA OAuth Login (The Fix)

1. **Install PWA**
   ```bash
   # Deploy latest code
   git push

   # On mobile Chrome/Android:
   # - Visit site
   # - Install PWA via banner or menu
   ```

2. **Test GitHub OAuth**
   - Open PWA from home screen
   - Tap "Sign in with GitHub"
   - Authenticate in browser
   - **Expected:** "Signed in successfully!" with "Return to App" button
   - Tap button
   - **Expected:** Returns to PWA, user is logged in
   - Close and reopen PWA
   - **Expected:** Still logged in ✅

3. **Verify No Logout**
   - After login, if browser tab is still open, close it
   - **Expected:** PWA session unaffected, user stays logged in ✅

### Test 2: Browser OAuth Login (Should Still Work)

1. **Open in Browser**
   - Visit site in regular Chrome (not PWA)
   - Click "Sign in with GitHub"
   - Authenticate

2. **Verify Auto-Redirect**
   - **Expected:** Auto-redirects to home page
   - No "Return to App" button shown
   - User logged in normally ✅

### Test 3: Magic Link (Also Fixed)

1. **In PWA**
   - Request magic link
   - Click link in email
   - **Expected:** Opens browser, shows "Return to App"
   - Tap button → returns to PWA logged in ✅

### Test 4: Email/Password (Unaffected)

1. **In PWA**
   - Sign in with email/password
   - **Expected:** Logs in directly in PWA (no browser)
   - No intermediate steps ✅

## Key Behaviors to Verify

### ✅ Successful Outcomes

- [ ] OAuth from PWA shows "Return to App" button
- [ ] Clicking button returns to PWA with auth intact
- [ ] Session persists after closing browser tab
- [ ] Auto-redirect works as fallback (3 seconds)
- [ ] Browser OAuth still auto-redirects (no button)
- [ ] Magic link also gets "Return to App" button
- [ ] Email/password login unaffected

### ❌ Problems This Fixes

- ~~Clicking browser X logs user out~~ → Now shows button instead
- ~~Session lost when browser closes~~ → Session properly preserved
- ~~Confusing browser UI in PWA flow~~ → Clear "Return to App" messaging

## Technical Details

### URL Parameter

The fix uses `?pwa=1` query parameter to track auth flow context:

```typescript
// When initiating OAuth from PWA
redirectTo: getOAuthRedirectURL('/auth/callback', true)
// Results in: https://yoursite.com/auth/callback?pwa=1
```

### Context Detection

```typescript
// In callback page
const standalone = isStandalone();  // Are we in PWA?
const fromPWA = isFromPWA();        // Did auth start from PWA?

if (!standalone && fromPWA) {
  // Show "Return to App" button
}
```

### Session Persistence

Auth session is stored by Nhost in:
- localStorage (refresh token)
- Memory (access token)

Both are shared between browser and PWA on same device, so:
- Login in browser → session available to PWA
- Login via OAuth → session persists when returning to PWA

## Debugging

### Check PWA Context

Open DevTools console in your app:

```javascript
// Check if running in PWA
navigator.standalone  // iOS
window.matchMedia('(display-mode: standalone)').matches  // Android/Desktop
```

### Check Redirect URL

When OAuth redirects back, check URL:
- Has `?pwa=1` → Auth came from PWA
- No parameter → Auth came from browser

### Check Auth State

```javascript
// In console
nhost.auth.getUser()  // Should return user object if logged in
```

## Known Limitations

### iOS Safari

iOS doesn't support `display-mode: standalone` media query perfectly. The fix uses `navigator.standalone` as fallback, which works on iOS Safari.

### Cross-Browser Sessions

If user:
1. Logs in via browser
2. Opens PWA
3. **Expected:** May need to refresh PWA to see login state

This is normal - the PWA checks auth on launch.

## Rollback Plan

If issues occur, revert these changes:

```bash
# Revert the OAuth fix
git revert HEAD~4  # Adjust number based on commits
git push
```

The app will work as before, but the OAuth logout issue will return.

## Future Improvements

### Phase 2 (Optional)

- [ ] **Better Session Sync** - Use BroadcastChannel API to instantly sync login between browser and PWA
- [ ] **Deep Linking** - Register PWA as protocol handler to avoid browser step entirely (limited support)
- [ ] **Better UX** - Detect if PWA is installed and auto-close browser tab after returning

### Low Priority

These are edge cases that don't affect most users:

- Multiple PWA windows open simultaneously
- Session sync across devices (requires backend changes)

## Support

If you encounter issues:

1. **Check Console** - Look for errors in DevTools
2. **Verify Context** - Confirm PWA vs browser mode
3. **Test in Incognito** - Rules out cache issues
4. **Check ?pwa=1** - Verify parameter is present in callback URL

---

## Summary

✅ **OAuth from PWA now works seamlessly**
✅ **No more accidental logouts**
✅ **Clear "Return to App" flow**
✅ **Browser OAuth unaffected**

The fix detects PWA context, adds a tracking parameter, and shows appropriate UI based on where the user is during the OAuth callback.
