import QRCode from 'qrcode';

export async function generateQRCode(
	text: string,
	options?: {
		width?: number;
		margin?: number;
		color?: { dark?: string; light?: string; };
	}
): Promise<string> {
	try {
		const dataUrl = await QRCode.toDataURL(text, {
			width: options?.width || 256,
			margin: options?.margin || 2,
			color: {
				dark: options?.color?.dark || '#000000',
				light: options?.color?.light || '#FFFFFF'
			}
		});
		return dataUrl;
	} catch (error) {
		console.error('Error generating QR code:', error);
		throw new Error('Failed to generate QR code');
	}
}

export async function downloadQRCode(text: string, filename: string = 'qrcode.png'): Promise<void> {
	try {
		const dataUrl = await generateQRCode(text);
		const link = document.createElement('a');
		link.href = dataUrl;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	} catch (error) {
		console.error('Error downloading QR code:', error);
		throw new Error('Failed to download QR code');
	}
}
