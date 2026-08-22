import assert from 'node:assert/strict';
import { searchWeb, pickUnvisitedOfficialCandidate } from './searchRouter.js';
import { __resetOfficialSearchCooldownsForTests } from './officialSearch.js';

const originalTavily = process.env.TAVILY_API_KEY;
const originalSerper = process.env.SERPER_API_KEY;
process.env.TAVILY_API_KEY = 'test-tavily-key';
process.env.SERPER_API_KEY = 'test-serper-key';
__resetOfficialSearchCooldownsForTests();

const calls: string[] = [];
const fetchImpl = (async (input: any) => {
  const url = String(input);
  calls.push(url);
  if (url === 'https://api.tavily.com/search') {
    return new Response(
      JSON.stringify({
        results: [
          { title: 'Growth.cx listicle', url: 'https://growth.cx/blog/top-saas', content: 'not a company' },
          { title: 'Acme official', url: 'https://www.acme.test/about', content: 'homepage' },
          { title: 'Acme team', url: 'https://acme.test/team', content: 'duplicate domain' },
        ],
      }),
      { status: 200 }
    );
  }
  if (url === 'https://google.serper.dev/search') {
    return new Response(
      JSON.stringify({ organic: [{ title: 'Beta official', link: 'https://beta.test/' }] }),
      { status: 200 }
    );
  }
  if (url.includes('google.com/search')) {
    return new Response(
      '<div class="MjjYud"><a href="https://gamma.test/"><h3>Gamma official</h3></a></div>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    );
  }
  return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
}) as unknown as typeof fetch;

const first = await searchWeb('Mujhe Delhi ke 20 SaaS businesses find karke emails nikalo', {
  attempt: 0,
  fetchImpl,
});
assert.equal(first.query, 'SaaS companies Delhi');
assert.deepEqual(first.items.map((item) => item.url), ['https://acme.test/']);
assert.equal(calls.filter((url) => url === 'https://api.tavily.com/search').length, 1);

const second = await searchWeb('SaaS companies Delhi', { attempt: 1, fetchImpl });
assert.equal(second.providerUsed, 'serper');
assert.deepEqual(second.items.map((item) => item.url), ['https://beta.test/']);

const third = await searchWeb('SaaS companies Delhi', { attempt: 2, fetchImpl });
assert.equal(third.providerUsed, 'html');
assert.deepEqual(third.items.map((item) => item.url), ['https://gamma.test/']);

const picked = pickUnvisitedOfficialCandidate(
  [{ url: 'https://acme.test/about', title: 'Acme' }, { url: 'https://new.test', title: 'New' }],
  new Set(['https://acme.test/']),
  new Set(['acme.test'])
);
assert.equal(picked?.url, 'https://new.test/');

if (originalTavily === undefined) delete process.env.TAVILY_API_KEY;
else process.env.TAVILY_API_KEY = originalTavily;
if (originalSerper === undefined) delete process.env.SERPER_API_KEY;
else process.env.SERPER_API_KEY = originalSerper;

console.log('✓ searchRouter: fixed attempts, URL-only candidates, editorial filtering, and domain deduplication');
