import type { RequestHandler } from './$types';
import { fetchHasura } from '$lib/utils/hasuraFetch';
import { GET_PODCAST_FEED_ITEMS } from '$lib/graphql/queries';

const SITE_URL = 'https://reasonsmith.com';
const PODCAST_TITLE = 'ReasonSmith: Analysis Breakdown';
const PODCAST_DESCRIPTION =
	'AI-powered breakdowns of political speeches, podcasts, and media. Each episode explores the rhetorical strategies, logical fallacies, good-faith indicators, and manipulative language found in public discourse.';

interface PodcastItem {
	id: string;
	title: string;
	subtitle?: string | null;
	summary?: string | null;
	creator?: string | null;
	media_type?: string | null;
	podcast_audio_url: string;
	source_url?: string | null;
	tags?: string[] | null;
	date_published?: string | null;
	created_at: string;
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function toRFC822(dateStr: string): string {
	const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00Z'));
	return date.toUTCString();
}

function buildItemXml(item: PodcastItem): string {
	const pubDate = item.date_published ? toRFC822(item.date_published) : toRFC822(item.created_at);

	const fullText = item.summary || item.subtitle || '';
	const description = fullText.split('\n')[0].trim();
	const audioUrl = `${SITE_URL}${item.podcast_audio_url}`;
	const link = `${SITE_URL}/featured/${item.id}`;

	let xml = '    <item>\n';
	xml += `      <title>${escapeXml(item.title)}</title>\n`;
	xml += `      <link>${link}</link>\n`;
	xml += `      <guid isPermaLink="false">${item.id}</guid>\n`;
	xml += `      <pubDate>${pubDate}</pubDate>\n`;
	xml += `      <description>${escapeXml(description)}</description>\n`;
	xml += `      <enclosure url="${escapeXml(audioUrl)}" type="audio/mpeg" />\n`;
	xml += `      <itunes:summary>${escapeXml(description)}</itunes:summary>\n`;
	xml += `      <itunes:author>The ReasonSmith Review</itunes:author>\n`;
	xml += `      <itunes:explicit>false</itunes:explicit>\n`;
	xml += '    </item>';

	return xml;
}

export const GET: RequestHandler = async ({ fetch }) => {
	const result = await fetchHasura<{ public_showcase_item: PodcastItem[] }>(fetch, {
		query: GET_PODCAST_FEED_ITEMS
	});

	if (result.error || !result.data) {
		return new Response(
			'<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate feed</error>',
			{
				status: 500,
				headers: { 'Content-Type': 'application/xml; charset=utf-8' }
			}
		);
	}

	const items = result.data.public_showcase_item ?? [];
	const lastBuildDate = items.length > 0 ? toRFC822(items[0].created_at) : new Date().toUTCString();

	const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(PODCAST_TITLE)}</title>
    <link>${SITE_URL}/discussions</link>
    <atom:link href="${SITE_URL}/api/podcast-feed" rel="self" type="application/rss+xml" />
    <description>${escapeXml(PODCAST_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <itunes:author>The ReasonSmith Review</itunes:author>
    <itunes:summary>${escapeXml(PODCAST_DESCRIPTION)}</itunes:summary>
    <itunes:owner>
      <itunes:name>The ReasonSmith Review</itunes:name>
    </itunes:owner>
    <itunes:image href="${SITE_URL}/reason-smith-review.png" />
    <itunes:category text="News">
      <itunes:category text="News Commentary" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <image>
      <url>${SITE_URL}/podcast-cover.png</url>
      <title>${escapeXml(PODCAST_TITLE)}</title>
      <link>${SITE_URL}/discussions</link>
    </image>
${items.map(buildItemXml).join('\n')}
  </channel>
</rss>`;

	return new Response(rssXml, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
