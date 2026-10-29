// Pack PNG images into a Windows .ico container (PNG-compressed entries, Vista+).
export function buildIco(images: Array<{ size: number; png: Uint8Array }>): Uint8Array {
    if (!images.length) throw new Error('No images to pack');
    const header = 6, dir = 16 * images.length;
    const total = header + dir + images.reduce((n, i) => n + i.png.length, 0);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, images.length, true);
    let offset = header + dir;
    images.forEach((img, k) => {
        if (img.size < 1 || img.size > 256) throw new Error(`ICO sizes must be 1-256 (got ${img.size})`);
        const e = header + k * 16;
        out[e] = img.size === 256 ? 0 : img.size;
        out[e + 1] = img.size === 256 ? 0 : img.size;
        dv.setUint16(e + 4, 1, true); // planes
        dv.setUint16(e + 6, 32, true); // bpp
        dv.setUint32(e + 8, img.png.length, true);
        dv.setUint32(e + 12, offset, true);
        out.set(img.png, offset);
        offset += img.png.length;
    });
    return out;
}

export const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512];
export const ICO_SIZES = [16, 32, 48];

export function faviconHtml(): string {
    return [
        '<link rel="icon" href="/favicon.ico" sizes="any">',
        '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
        '<link rel="apple-touch-icon" href="/favicon-180.png">',
    ].join('\n');
}
