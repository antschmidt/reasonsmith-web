/**
 * ICS (iCalendar) file generator
 * Creates RFC 5545 compliant .ics files for calendar events
 */

export interface ICSEvent {
	title: string;
	description?: string;
	startTime: Date;
	endTime: Date;
	timezone?: string;
	location?: string;
	url?: string;
}

function formatICSDate(date: Date, timezone?: string): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const hours = String(date.getUTCHours()).padStart(2, '0');
	const minutes = String(date.getUTCMinutes()).padStart(2, '0');
	const seconds = String(date.getUTCSeconds()).padStart(2, '0');

	if (timezone) {
		return `${year}${month}${day}T${hours}${minutes}${seconds}`;
	}
	return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeICSText(text: string): string {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
	if (line.length <= 75) return line;
	const lines: string[] = [];
	let start = 0;
	while (start < line.length) {
		if (start === 0) {
			lines.push(line.substring(start, Math.min(start + 75, line.length)));
			start += 75;
		} else {
			lines.push(' ' + line.substring(start, Math.min(start + 74, line.length)));
			start += 74;
		}
	}
	return lines.join('\r\n');
}

export function generateICS(event: ICSEvent): string {
	const lines: string[] = [];
	lines.push('BEGIN:VCALENDAR');
	lines.push('VERSION:2.0');
	lines.push('PRODID:-//ReasonSmith//Event Calendar//EN');
	lines.push('CALSCALE:GREGORIAN');
	lines.push('METHOD:PUBLISH');
	lines.push('BEGIN:VEVENT');
	const uid = `${Date.now()}-${Math.random().toString(36).substring(2)}@reasonsmith.com`;
	lines.push(`UID:${uid}`);
	lines.push(`DTSTAMP:${formatICSDate(new Date())}`);

	// Always use UTC time (Z suffix) since the database stores times in UTC
	// The calendar app will convert to the user's local timezone
	lines.push(`DTSTART:${formatICSDate(event.startTime)}`);
	lines.push(`DTEND:${formatICSDate(event.endTime)}`);

	lines.push(foldLine(`SUMMARY:${escapeICSText(event.title)}`));
	if (event.description) {
		lines.push(foldLine(`DESCRIPTION:${escapeICSText(event.description)}`));
	}
	if (event.location) {
		lines.push(foldLine(`LOCATION:${escapeICSText(event.location)}`));
	}
	if (event.url) {
		lines.push(foldLine(`URL:${event.url}`));
	}
	lines.push('END:VEVENT');
	lines.push('END:VCALENDAR');
	return lines.join('\r\n');
}

export function downloadICS(event: ICSEvent, filename?: string): void {
	const icsContent = generateICS(event);
	const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename || `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
