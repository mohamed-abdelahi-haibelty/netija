import { scrubPii } from '../sentryScrub';

describe('scrubPii (error-handling.md: "beforeSend scrubs known PII fields defensively")', () => {
  it('strips query string, cookies, and body from the request, and the query part of the url', () => {
    const event = {
      request: {
        url: 'https://netija.example/api/search/exam?no=00573&year=2024',
        query_string: 'no=00573&year=2024',
        cookies: { session: 'secret-token' },
        data: { no: '00573' },
        headers: { cookie: 'session=secret-token', accept: 'application/json' },
      },
    };

    const scrubbed = scrubPii(event as never);

    expect(scrubbed.request?.url).toBe('https://netija.example/api/search/exam');
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.headers).not.toHaveProperty('cookie');
    expect(scrubbed.request?.headers).toHaveProperty('accept');
  });

  it('is a no-op when the event has no request', () => {
    const event = { message: 'boom' };
    expect(scrubPii(event as never)).toEqual(event);
  });
});
