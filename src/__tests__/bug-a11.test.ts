import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GEMINI_MODEL,
  classifyGeminiError,
  getGeminiApiKey,
  setGeminiApiKey,
  extractTimetable,
  extractAttendance,
} from '../gemini';

describe('BUG-A11: Gemini model constant, API key management, and distinct error reporting', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('centralizes the model id as GEMINI_MODEL', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('allows user to get and set custom Gemini key in local storage', () => {
    expect(getGeminiApiKey()).toBe(import.meta.env.VITE_GEMINI_API_KEY || '');
    setGeminiApiKey('custom-key-123');
    expect(getGeminiApiKey()).toBe('custom-key-123');
    setGeminiApiKey('');
    expect(getGeminiApiKey()).toBe(import.meta.env.VITE_GEMINI_API_KEY || '');
  });

  it('classifies missing key error', () => {
    const err = classifyGeminiError(new Error('AI import is not configured. Add a restricted Gemini key'));
    expect(err.message).toMatch(/missing/i);
  });

  it('classifies quota / 429 error', () => {
    const err = classifyGeminiError(new Error('[GoogleGenerativeAI Error]: [429 Too Many Requests] RESOURCE_EXHAUSTED'));
    expect(err.message).toMatch(/quota|429|rate limit/i);
  });

  it('classifies invalid key error', () => {
    const err = classifyGeminiError(new Error('[GoogleGenerativeAI Error]: API_KEY_INVALID: API key not valid. Please pass a valid API key.'));
    expect(err.message).toMatch(/invalid.*key/i);
  });

  it('classifies network and timeout errors', () => {
    const timeoutErr = classifyGeminiError(new Error('Request timed out'));
    expect(timeoutErr.message).toMatch(/timed out|network/i);

    const netErr = classifyGeminiError(new Error('Failed to fetch'));
    expect(netErr.message).toMatch(/network/i);
  });

  it('classifies bad JSON response structure error', () => {
    const jsonErr = classifyGeminiError(new SyntaxError('Unexpected token < in JSON at position 0'));
    expect(jsonErr.message).toMatch(/invalid response structure/i);
  });
});
