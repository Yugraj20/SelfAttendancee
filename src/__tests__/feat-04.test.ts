import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportOrShareFile } from '../native-file';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(),
  },
  Directory: {
    Cache: 'CACHE',
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(),
  },
}));

describe('FEAT-04: Native export and share adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shares via Capacitor Filesystem and Share when on native platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/export.xlsx' });
    vi.mocked(Share.share).mockResolvedValue({} as any);

    await exportOrShareFile({
      filename: 'test-backup.txt',
      content: 'Sample backup data',
      mimeType: 'text/plain',
    });

    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'test-backup.txt',
      data: expect.any(String),
      directory: Directory.Cache,
    });

    expect(Share.share).toHaveBeenCalledWith({
      title: 'test-backup.txt',
      text: 'Export from Self Attendance: test-backup.txt',
      url: 'file:///cache/export.xlsx',
      dialogTitle: 'Share or Save test-backup.txt',
    });
  });

  it('downloads via anchor on web platform', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    let clicked = false;
    let anchorHref = '';
    let anchorDownload = '';

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = () => {
          clicked = true;
          anchorHref = (el as HTMLAnchorElement).href;
          anchorDownload = (el as HTMLAnchorElement).download;
        };
      }
      return el;
    });

    await exportOrShareFile({
      filename: 'web-backup.txt',
      content: 'Web backup content',
      mimeType: 'text/plain',
    });

    expect(clicked).toBe(true);
    expect(anchorDownload).toBe('web-backup.txt');
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
  });
});
