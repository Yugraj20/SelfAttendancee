import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../App';

describe('BUG-008: ErrorBoundary and logout reset', () => {
  it('ErrorBoundary catches child error and renders Reload button', () => {
    const ProblemChild = () => {
      throw new Error('Test crash in settings');
    };

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined();
  });
});
