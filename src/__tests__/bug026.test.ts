import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('BUG-026: Responsive timetable review card layout <=560px', () => {
  const cssPath = path.join(__dirname, '..', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('does not hide the end-time input (input:nth-of-type(3)) in the media query', () => {
    // Check inside @media (max-width:560px)
    const media560Match = css.match(/@media\s*\(\s*max-width:\s*560px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(media560Match).toBeTruthy();
    const mediaBlock = media560Match![1];

    // Ensure display:none is NOT applied to input:nth-of-type(3)
    expect(mediaBlock).not.toMatch(/\.review-row\s+input:nth-of-type\(3\)\s*\{\s*display:\s*none/);
  });

  it('stacks timetable review rows into a multi-row card layout at <=560px', () => {
    const media560Match = css.match(/@media\s*\(\s*max-width:\s*560px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(media560Match).toBeTruthy();
    const mediaBlock = media560Match![1];

    // Ensure review-row defines grid rows or grid template for card layout
    expect(mediaBlock).toContain('.review-row');
    expect(mediaBlock).toMatch(/grid-row/);
  });
});
