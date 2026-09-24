import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { SkeletonCards } from './SkeletonCards';

describe('SkeletonCards', () => {
  it('renders the requested number of cards', () => {
    const getUnexpectedErrors = spyOnConsoleError();

    const { container } = renderWithProviders(<SkeletonCards count={4} />);

    expect(container.querySelectorAll('.chakra-card__root')).toHaveLength(4);
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('defaults to 6 cards', () => {
    const { container } = renderWithProviders(<SkeletonCards />);

    expect(container.querySelectorAll('.chakra-card__root')).toHaveLength(6);
  });
});
