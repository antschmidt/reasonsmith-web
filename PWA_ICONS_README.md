# PWA Icon Generation Guide

## Required Icons

To complete the PWA setup, you need to generate the following icon sizes from your `static/logo-only.png`:

### Standard Icons

- **icon-192.png** (192x192px) - Home screen icon for Android
- **icon-512.png** (512x512px) - Splash screen and high-res displays

### Maskable Icons (Android Adaptive)

- **icon-192-maskable.png** (192x192px) - With safe zone padding
- **icon-512-maskable.png** (512x512px) - With safe zone padding

### Apple Touch Icon

- **apple-touch-icon.png** (180x180px) - iOS home screen icon

## Option 1: Use Online Tool (Easiest)

1. Go to https://realfavicongenerator.net/ or https://www.pwabuilder.com/imageGenerator
2. Upload `static/logo-only.png`
3. Download the generated icon pack
4. Place files in `static/` directory

## Option 2: Use ImageMagick (Command Line)

```bash
# Install ImageMagick if needed
# macOS: brew install imagemagick
# Ubuntu: sudo apt-get install imagemagick

cd static

# Generate standard icons
convert logo-only.png -resize 192x192 icon-192.png
convert logo-only.png -resize 512x512 icon-512.png

# Generate maskable icons (add 20% padding for safe zone)
convert logo-only.png -resize 154x154 -gravity center -extent 192x192 -background transparent icon-192-maskable.png
convert logo-only.png -resize 410x410 -gravity center -extent 512x512 -background transparent icon-512-maskable.png

# Generate Apple touch icon
convert logo-only.png -resize 180x180 apple-touch-icon.png
```

## Option 3: Use Sharp (Node.js)

Create a script `scripts/generate-icons.js`:

```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputFile = 'static/logo-only.png';
const outputDir = 'static';

const sizes = [
	{ name: 'icon-192.png', size: 192, maskable: false },
	{ name: 'icon-512.png', size: 512, maskable: false },
	{ name: 'icon-192-maskable.png', size: 192, maskable: true },
	{ name: 'icon-512-maskable.png', size: 512, maskable: true },
	{ name: 'apple-touch-icon.png', size: 180, maskable: false }
];

async function generateIcons() {
	for (const { name, size, maskable } of sizes) {
		const outputPath = path.join(outputDir, name);

		if (maskable) {
			// Add 20% padding for maskable icons
			const innerSize = Math.floor(size * 0.8);
			await sharp(inputFile)
				.resize(innerSize, innerSize)
				.extend({
					top: Math.floor((size - innerSize) / 2),
					bottom: Math.floor((size - innerSize) / 2),
					left: Math.floor((size - innerSize) / 2),
					right: Math.floor((size - innerSize) / 2),
					background: { r: 0, g: 0, b: 0, alpha: 0 }
				})
				.toFile(outputPath);
		} else {
			await sharp(inputFile).resize(size, size).toFile(outputPath);
		}

		console.log(`Generated ${name}`);
	}
}

generateIcons().then(() => console.log('All icons generated!'));
```

Run with:

```bash
pnpm add -D sharp
node scripts/generate-icons.js
```

## Maskable Icons Explained

Maskable icons have a "safe zone" in the center to ensure the icon looks good when Android applies circular, rounded square, or other mask shapes. The icon content should be centered with at least 20% padding on all sides.

## Verifying Icons

After generating icons:

1. Check that all files exist in `static/` directory
2. Build and deploy: `pnpm build`
3. Test on Chrome DevTools > Application > Manifest
4. Use https://www.pwabuilder.com/ to validate your manifest

## Current Status

- ✅ Manifest created (`static/manifest.webmanifest`)
- ✅ Service Worker created (`static/service-worker.js`)
- ✅ HTML meta tags added (`src/app.html`)
- ⏳ Icons need to be generated (see above)

Once icons are generated, your PWA will be fully installable on Android and iOS devices!
