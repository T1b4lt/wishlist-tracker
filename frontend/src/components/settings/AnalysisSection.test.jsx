import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AnalysisSection } from './AnalysisSection';

// Neither the hour `Select` nor the historical-window `Select` is opened
// here (both stay closed): interacting with the segmented control below is
// not an Ark overlay, so it carries none of the one-open-per-file
// restriction that applies to `Select`/`Menu`/`Dialog`.

const baseProps = {
  analysisHour: 12,
  onAnalysisHourChange: vi.fn(),
  histWindowSize: 60,
  onHistWindowSizeChange: vi.fn()
};

describe('AnalysisSection', () => {
  it('shows the current analysis hour and historical window', () => {
    renderWithProviders(<AnalysisSection {...baseProps} />);

    expect(
      screen.getByRole('combobox', { name: 'Analysis hour' })
    ).toHaveTextContent('12:00');
    // The segmented control (>= sm) and the mobile Select (< sm) both
    // render in jsdom (there is no real viewport to hide one of them), each
    // showing the current value.
    expect(screen.getAllByText('60 days').length).toBeGreaterThan(0);
  });

  it('changes the historical window via the segmented control', async () => {
    const user = userEvent.setup();
    const onHistWindowSizeChange = vi.fn();
    renderWithProviders(
      <AnalysisSection
        {...baseProps}
        onHistWindowSizeChange={onHistWindowSizeChange}
      />
    );

    await user.click(screen.getByRole('radio', { name: '90 days' }));

    expect(onHistWindowSizeChange).toHaveBeenCalledWith(90);
  });
});
