import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputFile = join(projectRoot, 'static', 'logo-only.png');
const outputDir = join(projectRoot, 'static');

const sizes = [
	{ name: 'icon-192.png', size: 192, maskable: false },
	{ name: 'icon-512.png', size: 512, maskable: false },
	{ name: 'icon-192-maskable.png', size: 192, maskable: true },
	{ name: 'icon-512-maskable.png', size: 512, maskable: true },
	{ name: 'apple-touch-icon.png', size: 180, maskable: false }
];

async function generateIcons() {
	console.log('Generating PWA icons...\n');

	for (const { name, size, maskable } of sizes) {
		const outputPath = join(outputDir, name);

		try {
			if (maskable) {
				// Add 20% padding for maskable icons (safe zone)
				const innerSize = Math.floor(size * 0.8);
				const padding = Math.floor((size - innerSize) / 2);

				await sharp(inputFile)
					.resize(innerSize, innerSize, {
						fit: 'contain',
						background: { r: 0, g: 0, b: 0, alpha: 0 }
					})
					.extend({
						top: padding,
						bottom: padding,
						left: padding,
						right: padding,
						background: { r: 0, g: 0, b: 0, alpha: 0 }
					})
					.toFile(outputPath);

				console.log(`✓ Generated ${name} (maskable with safe zone)`);
			} else {
				await sharp(inputFile)
					.resize(size, size, {
						fit: 'contain',
						background: { r: 0, g: 0, b: 0, alpha: 0 }
					})
					.toFile(outputPath);

				console.log(`✓ Generated ${name}`);
			}
		} catch (error) {
			console.error(`✗ Failed to generate ${name}:`, error.message);
		}
	}

	console.log('\n✅ All PWA icons generated successfully!');
	console.log('\nNext steps:');
	console.log('1. Run `pnpm build` to build the app');
	console.log('2. Deploy to Vercel');
	console.log('3. Test PWA install on mobile device');
	console.log('4. Check Chrome DevTools > Application > Manifest');
}

generateIcons().catch((error) => {
	console.error('Error generating icons:', error);
	process.exit(1);
});
