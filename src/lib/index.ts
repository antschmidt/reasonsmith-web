// place files you want to import through the `$lib` alias in this folder.
export * from './autosaveDraft';
// Good Faith scoring client helper
export async function scoreGoodFaithRemote(
	nhost: any,
	params: { content: string; postId?: string; persist?: boolean; approveIf?: number }
) {
	const payload: Record<string, any> = { content: params.content };
	if (params.postId) payload.post_id = params.postId;
	if (params.persist) payload.persist = true;
	if (typeof params.approveIf === 'number') payload.approve_if = params.approveIf;
	const { res, error } = await nhost.functions.call('goodFaithScore', payload);
	if (error) throw error;
	return res as { good_faith_score: number; good_faith_label: string; approved?: boolean };
}

// Atomic publish helper: score + approve if threshold met
export async function atomicScoreAndPublish(
	nhost: any,
	opts: { postId: string; content: string; threshold: number }
) {
	return scoreGoodFaithRemote(nhost, {
		content: opts.content,
		postId: opts.postId,
		persist: true,
		approveIf: opts.threshold
	});
}
