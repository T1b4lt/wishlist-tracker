import { describe, expect, it, vi } from 'vitest';
import { request } from './client';
import * as telegram from './telegram';

vi.mock('./client', () => ({ request: vi.fn() }));

describe('telegram api module', () => {
  it('getChatId requests GET /telegram-chat-id', () => {
    telegram.getChatId('sig');
    expect(request).toHaveBeenCalledWith('/telegram-chat-id', {
      signal: 'sig'
    });
  });

  it('sendTestMessage posts to /telegram-test-message', () => {
    telegram.sendTestMessage('sig');
    expect(request).toHaveBeenCalledWith('/telegram-test-message', {
      method: 'POST',
      signal: 'sig'
    });
  });
});
