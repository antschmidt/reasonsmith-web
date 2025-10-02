# PWA Testing Guide

## ✅ Implementation Complete

Your ReasonSmith PWA is now fully configured with:

- ✅ Web App Manifest (`static/manifest.webmanifest`)
- ✅ Service Worker (`static/service-worker.js`)
- ✅ All required icons generated
- ✅ HTML meta tags for PWA support
- ✅ Install prompt component
- ✅ Offline page

## Testing on Desktop (Chrome)

### 1. **Build and Preview Locally**

```bash
pnpm build
pnpm preview
```

The app will run at `http://localhost:4173`

### 2. **Check Manifest in DevTools**

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Manifest** in left sidebar
4. Verify:
   - App Name: "ReasonSmith"
   - Theme Color: `#546e7a`
   - All icons show up (192x192, 512x512, maskable variants)
   - Start URL is correct

### 3. **Test Service Worker**

1. In DevTools, go to **Application** > **Service Workers**
2. You should see service worker registered
3. Status should be "activated and running"
4. Try "Offline" checkbox to test offline functionality

### 4. **Test Install Prompt**

1. Look for install icon in Chrome address bar (⊕ icon)
2. Click it to install PWA
3. Or use Chrome menu > Install ReasonSmith
4. App should open in standalone window

### 5. **Test Offline Mode**

1. Install the PWA
2. In DevTools > Application > Service Workers, check "Offline"
3. Navigate to cached pages - they should still work
4. Try loading uncached page - should see offline page

## Testing on Android

### 1. **Deploy to Production**

```bash
git add .
git commit -m "Add PWA support"
git push
```

Vercel will auto-deploy. Wait for deployment to complete.

### 2. **Visit Site on Mobile**

1. Open Chrome on Android
2. Visit `https://reasonsmith.com` (or your Vercel URL)
3. Chrome will show "Add to Home screen" banner
4. Or tap menu (⋮) > "Install app" or "Add to Home screen"

### 3. **Test Installed App**

1. After installing, app icon appears on home screen
2. Tap icon - app opens full-screen (no browser UI)
3. Test navigation between pages
4. Check theme color in status bar matches (`#546e7a`)

### 4. **Test Offline**

1. Enable Airplane mode
2. Open ReasonSmith from home screen
3. Previously visited pages should load
4. New pages show offline page

## Testing on iOS (iPhone/iPad)

### 1. **Visit Site in Safari**

iOS requires Safari for PWA installation (not Chrome).

1. Open Safari on iOS
2. Visit your site
3. Tap Share button (⬆️)
4. Tap "Add to Home Screen"
5. Confirm installation

### 2. **iOS Limitations**

⚠️ iOS has limited PWA support:
- No install banner (users must manually add)
- Service Worker limited to 50MB cache
- No push notifications
- Background sync not supported

But you still get:
- ✅ Home screen icon
- ✅ Full-screen mode
- ✅ Offline caching
- ✅ App-like experience

## Lighthouse PWA Score

### Run Lighthouse Audit

1. Open Chrome DevTools
2. Go to **Lighthouse** tab
3. Select "Progressive Web App" category
4. Click "Generate report"

**Target Score: 100/100**

You should pass all checks:
- ✅ Installable
- ✅ PWA optimized
- ✅ Fast and reliable
- ✅ Works offline

## Common Issues & Solutions

### "Service Worker registration failed"

**Solution:** Check that service worker file is at `/service-worker.js` in static folder, not src.

### "No matching service worker detected"

**Solution:** Clear browser cache and hard reload (Ctrl+Shift+R).

### Icons not showing in manifest

**Solution:**
```bash
# Regenerate icons
pnpm generate-icons
pnpm build
```

### Install prompt not showing

**Reasons:**
- Already installed
- Using HTTP instead of HTTPS (Vercel auto-uses HTTPS)
- User dismissed it (clears after session)
- Site doesn't meet PWA criteria

**Debug:**
Chrome DevTools > Application > Manifest - check for warnings

### Offline page not showing

**Solution:** Service worker needs to cache `/offline` route. Visit it once while online, then it will be cached.

## Analytics & Monitoring

### Track PWA Installations

The InstallPrompt component logs to console. You can add analytics:

```javascript
// In InstallPrompt.svelte, after successful install
if (outcome === 'accepted') {
  // Track with Vercel Analytics or your analytics tool
  console.log('[PWA] Install accepted - track this event');
}
```

### Monitor Service Worker Updates

Service workers auto-update when you deploy new code. Users will get the update on next visit.

## Next Steps

### 1. **Deploy to Production**
```bash
git add .
git commit -m "Add PWA support with offline functionality"
git push
```

### 2. **Test on Real Devices**
- Android phone with Chrome
- iPhone with Safari
- Verify install works
- Test offline functionality

### 3. **Monitor Usage**
- Track install rates
- Monitor offline usage
- Gather user feedback

### 4. **Future Enhancements** (Optional)
- [ ] Add push notifications
- [ ] Implement background sync for drafts
- [ ] Add app shortcuts (already in manifest)
- [ ] Create splash screens
- [ ] Add share target API

## PWA vs Native App Decision

**Start with PWA because:**
- ✅ Zero app store friction
- ✅ Instant updates (no store approval)
- ✅ Works on both Android and iOS
- ✅ Uses existing web codebase
- ✅ No platform-specific code

**Consider Native Android App when:**
- Install rates plateau
- Users request native features (camera, contacts, etc.)
- You want Google Play Store visibility
- Performance becomes critical
- You have development resources

For now, **PWA is the perfect solution** - you get 90% of native app benefits with 10% of the effort.

## Support

If you encounter issues:
1. Check Chrome DevTools > Console for errors
2. Verify manifest in Application > Manifest
3. Check service worker status in Application > Service Workers
4. Review this guide's troubleshooting section
5. Test on production URL (HTTPS required for PWA)

---

**Your PWA is ready!** 🎉

Build, deploy, and test on mobile devices. Users can now install ReasonSmith like a native app!
