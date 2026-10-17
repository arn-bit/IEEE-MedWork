import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordTracePage } from './RecordTracePage';

describe('dev trace recorder', () => {
  it('does not touch the camera until consent is given', async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    render(<RecordTracePage />);

    const start = screen.getByRole('button', { name: /Start camera/ });
    expect(start).toBeDisabled();
    expect(screen.getByText(/No video, no images, no names, no dates/)).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: /I agree to record my body landmark positions/ }));
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    // Setup is locked while the camera is on, so the trace labels match what was recorded.
    expect(screen.getByRole('radio', { name: /Sit-to-stand/ })).toBeDisabled();

    // Withdrawing consent turns the camera off again.
    await userEvent.click(screen.getByRole('checkbox', { name: /I agree/ }));
    expect(screen.getByRole('button', { name: /Start camera/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Sit-to-stand/ })).toBeEnabled();
  });
});
