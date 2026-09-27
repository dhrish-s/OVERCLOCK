'use strict';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePngDataUrl(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Export must be a PNG image.');
  }
  const encoded = dataUrl.slice('data:image/png;base64,'.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Export contains invalid PNG data.');
  }
  // Reject oversized input before allocating the decoded buffer.
  if (encoded.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    throw new Error('Image export exceeds the safety limit.');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > maxBytes) throw new Error('Image export exceeds the safety limit.');
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Export contains invalid PNG data.');
  }
  return buffer;
}

module.exports = { decodePngDataUrl };
