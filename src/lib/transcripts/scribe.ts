/**
 * ElevenLabs Scribe (speech-to-text) API client.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 *
 * Two ingestion modes are supported here:
 *
 * 1. `transcribeFromUrl(url)` — hands Scribe a publicly-accessible
 *    media URL. YouTube page URLs are NOT valid input to the API
 *    directly (the API expects a media file, not an HTML page).
 *    For YouTube ingestion the current flow is: (a) run the video
 *    through the ElevenLabs web UI, (b) upload the resulting JSON
 *    to ReasonSmith via the admin route. A follow-up task can wire
 *    yt-dlp in for automated extraction.
 *
 * 2. `transcribeFromFile(file)` — multipart upload of an audio or
 *    video file. Used when the caller has already pulled the media
 *    down (yt-dlp, a C-SPAN MP4, a self-hosted video).
 *
 * This module is server-only. It reads ELEVENLABS_API_KEY from
 * private env and should never be imported into client code.
 */

import type { ScribeTranscript } from './types.ts';

const SCRIBE_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

export interface ScribeOptions {
	/** Scribe model id. Defaults to the current recommended model. */
	modelId?: string;
	/** Enable speaker diarization. Defaults to true. */
	diarize?: boolean;
	/** Emit bracketed audio events (`[applause]`, etc.). Defaults to true. */
	tagAudioEvents?: boolean;
	/** ISO 639-1 code to bias transcription; auto-detected if omitted. */
	languageCode?: string;
	/**
	 * Upper bound for the number of speakers to diarize. Helpful when
	 * you know it's a solo speech or a panel of known size.
	 */
	numSpeakers?: number;
}

export class ScribeError extends Error {
	constructor(
		message: string,
		public status: number,
		public body: unknown
	) {
		super(message);
		this.name = 'ScribeError';
	}
}

function buildFormBase(opts: ScribeOptions): FormData {
	const form = new FormData();
	form.set('model_id', opts.modelId ?? 'scribe_v1');
	form.set('diarize', String(opts.diarize ?? true));
	form.set('tag_audio_events', String(opts.tagAudioEvents ?? true));
	if (opts.languageCode) form.set('language_code', opts.languageCode);
	if (opts.numSpeakers != null) form.set('num_speakers', String(opts.numSpeakers));
	return form;
}

async function callScribe(apiKey: string, form: FormData): Promise<ScribeTranscript> {
	const res = await fetch(SCRIBE_ENDPOINT, {
		method: 'POST',
		headers: { 'xi-api-key': apiKey },
		body: form
	});

	if (!res.ok) {
		let body: unknown = null;
		try {
			body = await res.json();
		} catch {
			try {
				body = await res.text();
			} catch {
				/* give up */
			}
		}
		throw new ScribeError(
			`ElevenLabs Scribe returned ${res.status}`,
			res.status,
			body
		);
	}

	return (await res.json()) as ScribeTranscript;
}

/**
 * Transcribe a publicly-accessible media URL (not a YouTube page URL).
 */
export async function transcribeFromUrl(
	apiKey: string,
	url: string,
	opts: ScribeOptions = {}
): Promise<ScribeTranscript> {
	const form = buildFormBase(opts);
	form.set('cloud_storage_url', url);
	return callScribe(apiKey, form);
}

/**
 * Transcribe an uploaded audio or video file.
 *
 * `file` can be a Blob/File (browser or modern Node) — fetch's
 * FormData handles both. The `filename` hint helps Scribe pick the
 * right container parser.
 */
export async function transcribeFromFile(
	apiKey: string,
	file: Blob,
	filename: string,
	opts: ScribeOptions = {}
): Promise<ScribeTranscript> {
	const form = buildFormBase(opts);
	form.set('file', file, filename);
	return callScribe(apiKey, form);
}
