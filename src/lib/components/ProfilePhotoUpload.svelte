<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { UPDATE_CONTRIBUTOR_AVATAR } from '$lib/graphql/queries';
	import { browser } from '$app/environment';
	import { contributorStore } from '$lib/stores/contributorStore.js';

	interface Props {
		currentAvatarUrl: string | null;
		contributorId: string;
		onUpdate?: (newAvatarUrl: string | null) => void;
	}

	let { currentAvatarUrl = $bindable(), contributorId, onUpdate = () => {} }: Props = $props();

	let uploading = $state(false);
	let converting = $state(false);
	let error = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();

	// Temporary preview URL for newly selected file
	let previewUrl = $state<string | null>(null);

	function getAvatarDisplay() {
		return previewUrl || currentAvatarUrl;
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

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		let file = input.files?.[0];

		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		// Auto-convert HEIC/HEIF files to JPEG
		const isHEIC =
			file.type === 'image/heic' ||
			file.type === 'image/heif' ||
			file.name.toLowerCase().endsWith('.heic') ||
			file.name.toLowerCase().endsWith('.heif');

		if (isHEIC) {
			if (!browser) {
				error = 'HEIC conversion is only available in the browser';
				return;
			}

			try {
				converting = true;
				error = null;
				console.log('Converting HEIC to JPEG...');

				// Dynamically import heic2any only on the client side
				const heic2any = (await import('heic2any')).default;

				// Convert HEIC to JPEG
				const convertedBlob = await heic2any({
					blob: file,
					toType: 'image/jpeg',
					quality: 0.9
				});

				// heic2any can return Blob or Blob[], handle both cases
				const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

				// Create a new File object from the converted Blob
				const newFileName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
				file = new File([blob], newFileName, { type: 'image/jpeg' });

				console.log('HEIC conversion successful');
			} catch (err: any) {
				console.error('HEIC conversion failed:', err);
				error = 'Failed to convert HEIC image. Please try a different format.';
				converting = false;
				return;
			} finally {
				converting = false;
			}
		}

		// Validate file size (max 5MB) - check after conversion
		if (file.size > 5 * 1024 * 1024) {
			error = 'Image must be smaller than 5MB';
			return;
		}

		// Create preview
		previewUrl = URL.createObjectURL(file);
		error = null;

		try {
			uploading = true;

			// Upload to Nhost storage using v4 API
			const uploadResult = await nhost.storage.uploadFiles({
				'file[]': [file],
				'bucket-id': 'default',
				'metadata[]': [
					{
						name: `avatars/${contributorId}-${Date.now()}-${file.name}`,
						metadata: {}
					}
				]
			});

			if (uploadResult.error) {
				throw new Error(uploadResult.error.message);
			}

			console.log('Upload result:', uploadResult);
			console.log('Upload body:', uploadResult.body);

			if (!uploadResult.body?.processedFiles?.[0]) {
				throw new Error('No file metadata returned');
			}

			// Get the uploaded file metadata
			const fileMetadata = uploadResult.body.processedFiles[0];
			console.log('File metadata:', fileMetadata);

			// Use our own API proxy to serve images with authentication
			const avatarUrl = `/api/image/${fileMetadata.id}`;
			console.log('Using proxy URL:', avatarUrl);

			// Update contributor avatar in database
			const result = await nhost.graphql.request(UPDATE_CONTRIBUTOR_AVATAR, {
				contributorId,
				avatarUrl
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to update avatar'
					: result.error.message || 'Failed to update avatar';
				throw new Error(errorMessage);
			}

			// Clean up old preview
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}

			// Update the current avatar URL (bindable prop)
			currentAvatarUrl = avatarUrl;

			// Update the global contributor store so nav-avatar updates
			contributorStore.updateAvatar(avatarUrl);

			// Notify parent component
			onUpdate(avatarUrl);
		} catch (err: any) {
			error = err.message || 'Failed to upload photo';
			// Clean up preview on error
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}
		} finally {
			uploading = false;
		}
	}

	async function removeAvatar() {
		try {
			uploading = true;
			error = null;

			// Update contributor avatar to null in database
			const result = await nhost.graphql.request(UPDATE_CONTRIBUTOR_AVATAR, {
				contributorId,
				avatarUrl: null
			});

			if (result.error) {
				const errorMessage = Array.isArray(result.error)
					? result.error[0]?.message || 'Failed to update avatar'
					: result.error.message || 'Failed to update avatar';
				throw new Error(errorMessage);
			}

			// Clean up preview
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}

			// Update the current avatar URL (bindable prop)
			currentAvatarUrl = null;

			// Update the global contributor store so nav-avatar updates
			contributorStore.updateAvatar(null);

			// Notify parent component
			onUpdate(null);
		} catch (err: any) {
			error = err.message || 'Failed to remove photo';
		} finally {
			uploading = false;
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}
</script>

<div class="avatar-upload">
	<div class="avatar-preview">
		{#if getAvatarDisplay()}
			<img src={getAvatarDisplay()} alt="Profile avatar" />
		{:else}
			<div class="avatar-placeholder">
				<span class="initials">{getInitials(currentAvatarUrl)}</span>
			</div>
		{/if}

		{#if uploading}
			<div class="loading-overlay">
				<div class="loading-spinner"></div>
			</div>
		{/if}
	</div>

	<div class="avatar-controls">
		<input
			bind:this={fileInput}
			type="file"
			accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
			onchange={handleFileSelect}
			disabled={uploading || converting}
			style="display: none;"
		/>

		<button
			type="button"
			class="btn btn-secondary btn-small"
			onclick={triggerFileInput}
			disabled={uploading || converting}
		>
			{#if converting}
				Converting...
			{:else if uploading}
				Uploading...
			{:else}
				{currentAvatarUrl || previewUrl ? 'Change Photo' : 'Upload Photo'}
			{/if}
		</button>

		{#if currentAvatarUrl && !uploading && !converting}
			<button type="button" class="btn btn-small remove-btn" onclick={removeAvatar}>
				Remove
			</button>
		{/if}
	</div>

	{#if converting}
		<div class="info-text">Converting HEIC to JPEG...</div>
	{/if}

	{#if error}
		<div class="error-text">{error}</div>
	{/if}

	<small class="hint">JPG, PNG, GIF, or HEIC. Max 5MB. HEIC files auto-convert to JPEG.</small>
</div>

<style>
	.avatar-upload {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.avatar-preview {
		position: relative;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		overflow: hidden;
		border: 3px solid var(--color-border);
		background: var(--color-surface);
	}

	.avatar-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-alt);
		color: var(--color-text-secondary);
	}

	.initials {
		font-size: 2rem;
		font-weight: 600;
	}

	.loading-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.remove-btn {
		color: #ef4444;
		border-color: #ef4444;
	}

	.remove-btn:hover {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border-color: #ef4444;
	}

	.hint {
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.info-text {
		text-align: center;
		color: var(--color-primary);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.error-text {
		text-align: center;
		color: var(--color-accent);
		font-size: 0.875rem;
	}
</style>
