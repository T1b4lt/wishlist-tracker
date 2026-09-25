import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Link, Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const LocationProbe = () => {
  const [location] = useLocation();
  return <div data-testid="location">{location}</div>;
};

/** Mirrors real usage: a `wouter` `Link` (header nav, a page's back link)
 * plus a plain same-page hash anchor (an in-page section nav), guarded by
 * the hook under test. No real `ConfirmDialog` here: a bare stand-in is
 * enough to assert the hook's own state machine. */
const Harness = ({ isDirty }) => {
  const { isConfirmOpen, confirmNavigation, cancelNavigation } =
    useUnsavedChangesGuard(isDirty);

  return (
    <>
      <LocationProbe />
      <Link href="/elsewhere">Elsewhere</Link>
      <a href="/settings#general">Jump to General</a>
      {isConfirmOpen && (
        <div role="alertdialog">
          <button onClick={confirmNavigation}>Leave</button>
          <button onClick={cancelNavigation}>Stay</button>
        </div>
      )}
    </>
  );
};

const renderHarness = (isDirty) => {
  const { hook } = memoryLocation({ path: '/settings' });
  // `memoryLocation` simulates routing entirely in memory, so jsdom's real
  // `window.location` never moves off its default. Syncing it here (as a
  // real browser's address bar would already be) keeps the same-path check
  // for hash anchors accurate and avoids jsdom logging an unrelated "not
  // implemented" navigation warning for what is really just an in-page
  // hash change.
  window.history.replaceState(null, '', '/settings');
  return render(
    <Router hook={hook}>
      <Harness isDirty={isDirty} />
    </Router>
  );
};

describe('useUnsavedChangesGuard', () => {
  it('lets an in-app link navigate normally when there is nothing unsaved', async () => {
    const user = userEvent.setup();
    renderHarness(false);

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('intercepts an in-app link click while dirty, staying put until confirmed', async () => {
    const user = userEvent.setup();
    renderHarness(true);

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('stays on the page when the pending navigation is canceled', async () => {
    const user = userEvent.setup();
    renderHarness(true);

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    await user.click(screen.getByRole('button', { name: 'Stay' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('proceeds to the intercepted destination once confirmed', async () => {
    const user = userEvent.setup();
    renderHarness(true);

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    await user.click(screen.getByRole('button', { name: 'Leave' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere');
  });

  it('does not intercept a same-page hash anchor while dirty', async () => {
    const user = userEvent.setup();
    renderHarness(true);

    await user.click(screen.getByRole('link', { name: 'Jump to General' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not intercept a modified click (e.g. open in a new tab)', () => {
    // Left uncaught by the hook (as intended: a modified click should reach
    // its native "open in a new tab" behavior), this real `<a>` targets a
    // different path, which jsdom cannot actually navigate to and logs a
    // harmless "Not implemented" warning for. Silenced here since it is
    // this test's own artifact (a real browser would open a new tab
    // in-process instead), not something the hook or app does wrong.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    renderHarness(true);

    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }), {
      ctrlKey: true
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('warns on beforeunload only while dirty', () => {
    const { rerender } = renderHarness(true);

    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    rerender(
      <Router hook={memoryLocation({ path: '/settings' }).hook}>
        <Harness isDirty={false} />
      </Router>
    );

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });
});
