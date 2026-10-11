import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from './App';
import * as listings from './services/listings';

it('shows the mock dataset and booking boundary', async () => {
  render(<App />);
  expect(await screen.findByText(/18 fictional tours/)).toBeInTheDocument();
  expect(screen.getByText(/Nothing can be reserved/)).toBeInTheDocument();
});
it('does not disguise an adapter error as an empty catalogue', async () => {
  vi.spyOn(listings, 'getListings').mockRejectedValueOnce(new Error('offline'));
  render(<App />);
  expect(await screen.findByText(/Unable to load/)).toBeInTheDocument();
  vi.restoreAllMocks();
});
