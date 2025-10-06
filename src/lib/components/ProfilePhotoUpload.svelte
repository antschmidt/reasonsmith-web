<script lang="ts">
	import { nhost } from '$lib/nhostClient';
	import { UPDATE_CONTRIBUTOR_AVATAR } from '$lib/graphql/queries';

	interface Props {
		currentAvatarUrl: string | null;
		contributorId: string;
		onUpdate?: (newAvatarUrl: string | null) => void;
	}

	let { currentAvatarUrl = $bindable(), contributorId, onUpdate = () => {} }: Props = $props();

	let uploading = $state(false);
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
		const file = input.files?.[0];

		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		// Validate file size (max 5MB)
		if (file.size > 5 * 1024 * 1024) {
			error = 'Image must be smaller than 5MB';
			return;
		}

		// Create preview
		previewUrl = URL.createObjectURL(file);
		error = null;

		try {
			uploading = true;

			// Upload to Nhost storage
			const { fileMetadata, error: uploadError } = await nhost.storage.upload({
				file,
				bucketId: 'default',
				name: `avatars/${contributorId}-${Date.now()}-${file.name}`
			});

			if (uploadError) {
				throw new Error(uploadError.message);
			}

			// Use our own API proxy to serve images with authentication
			const avatarUrl = `/api/image/${fileMetadata!.id}`;
			console.log('Using proxy URL:', avatarUrl);

			// Update contributor avatar in database
			const result = await nhost.graphql.request(UPDATE_CONTRIBUTOR_AVATAR, {
				contributorId,
				avatarUrl
			});

			if (result.error) {
				throw new Error(result.error.message);
			}

			// Clean up old preview
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}

			// Update the current avatar URL (bindable prop)
			currentAvatarUrl = avatarUrl;

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
				throw new Error(result.error.message);
			}

			// Clean up preview
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
				previewUrl = null;
			}

			// Update the current avatar URL (bindable prop)
			currentAvatarUrl = null;

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
			accept="image/*"
			onchange={handleFileSelect}
			disabled={uploading}
			style="display: none;"
		/>

		<button
			type="button"
			class="btn btn-secondary btn-small"
			onclick={triggerFileInput}
			disabled={uploading}
		>
			{currentAvatarUrl || previewUrl ? 'Change Photo' : 'Upload Photo'}
		</button>

		{#if currentAvatarUrl && !uploading}
			<button type="button" class="btn btn-small remove-btn" onclick={removeAvatar}>
				Remove
			</button>
		{/if}
	</div>

	{#if error}
		<div class="error-text">{error}</div>
	{/if}

	<small class="hint">JPG, PNG or GIF. Max 5MB.</small>
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
</style>
