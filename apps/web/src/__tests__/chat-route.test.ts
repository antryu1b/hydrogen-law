// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';

const chatReq = () =>
  new NextRequest(new URL('/api/chat', 'https://example.test'), {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });

describe('/api/chat while disabled', () => {
  afterEach(() => {
    delete process.env.CHAT_ENABLED;
  });

  it('returns 404 when CHAT_ENABLED is unset', async () => {
    expect((await POST(chatReq())).status).toBe(404);
  });

  it('returns 404 when CHAT_ENABLED is not exactly "true"', async () => {
    process.env.CHAT_ENABLED = '1';
    expect((await POST(chatReq())).status).toBe(404);
  });
});
