import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { FadeIn } from './FadeIn';
import { Stagger, StaggerItem } from './Stagger';
import { AnimatedList, AnimatedListItem } from './AnimatedList';
import { PageTransition } from './PageTransition';

// Mutable flag read by the mocked `useReducedMotion`, so each test can pick
// the reduced or normal case while sharing one module mock.
let reducedMotion = false;

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useReducedMotion: () => reducedMotion
  };
});

afterEach(() => {
  reducedMotion = false;
});

describe('presets under reduced motion', () => {
  it('FadeIn renders without a transform when reduced motion is on', () => {
    reducedMotion = true;
    renderWithProviders(
      <FadeIn data-testid="target">
        <span>Content</span>
      </FadeIn>
    );

    const node = screen.getByTestId('target');
    expect(node.style.transform).toBeFalsy();
  });

  it('FadeIn renders with a transform when reduced motion is off', () => {
    reducedMotion = false;
    renderWithProviders(
      <FadeIn data-testid="target">
        <span>Content</span>
      </FadeIn>
    );

    const node = screen.getByTestId('target');
    expect(node.style.transform).toBeTruthy();
  });

  it('StaggerItem renders without a transform when reduced motion is on', () => {
    reducedMotion = true;
    renderWithProviders(
      <Stagger>
        <StaggerItem data-testid="item">
          <span>Item</span>
        </StaggerItem>
      </Stagger>
    );

    expect(screen.getByTestId('item').style.transform).toBeFalsy();
  });

  it('StaggerItem renders with a transform when reduced motion is off', () => {
    reducedMotion = false;
    renderWithProviders(
      <Stagger>
        <StaggerItem data-testid="item">
          <span>Item</span>
        </StaggerItem>
      </Stagger>
    );

    expect(screen.getByTestId('item').style.transform).toBeTruthy();
  });

  it('AnimatedListItem does not enable layout animations when reduced motion is on', () => {
    reducedMotion = true;
    renderWithProviders(
      <AnimatedList>
        <AnimatedListItem key="one" data-testid="row">
          <span>Row</span>
        </AnimatedListItem>
      </AnimatedList>
    );

    // No entrance offset either way (only the exit collapses), but under
    // reduced motion the item must not be a `layout` element (no FLIP
    // transform on future reflows).
    expect(screen.getByTestId('row').style.transform).toBeFalsy();
  });

  it('PageTransition renders without a transform when reduced motion is on', () => {
    reducedMotion = true;
    renderWithProviders(
      <PageTransition data-testid="page">
        <span>Page</span>
      </PageTransition>
    );

    expect(screen.getByTestId('page').style.transform).toBeFalsy();
  });

  it('PageTransition renders with a transform when reduced motion is off', () => {
    reducedMotion = false;
    renderWithProviders(
      <PageTransition data-testid="page">
        <span>Page</span>
      </PageTransition>
    );

    expect(screen.getByTestId('page').style.transform).toBeTruthy();
  });
});
