import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Downloads a file on web via <a> anchor or opens the native Share sheet on native mobile platforms.
 */
export async function exportOrShareFile({
  filename,
  content,
  base64Data,
  mimeType,
}: {
  filename: string;
  content?: string;
  base64Data?: string;
  mimeType: string;
}): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      let dataToWrite = base64Data;
      if (!dataToWrite && content) {
        dataToWrite = btoa(unescape(encodeURIComponent(content)));
      }
      if (dataToWrite) {
        const fileResult = await Filesystem.writeFile({
          path: filename,
          data: dataToWrite,
          directory: Directory.Cache,
        });

        await Share.share({
          title: filename,
          text: `Export from Self Attendance: ${filename}`,
          url: fileResult.uri,
          dialogTitle: `Share or Save ${filename}`,
        });
        return;
      }
    } catch (err) {
      console.error('Failed to share file natively:', err);
    }
  }

  // Web fallback: download via blob anchor
  if (typeof document !== 'undefined') {
    let blob: Blob;
    if (base64Data) {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    } else {
      blob = new Blob([content ?? ''], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
