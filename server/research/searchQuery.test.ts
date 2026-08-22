import assert from 'node:assert/strict';
import { buildWebSearchQuery } from './searchQuery.js';

const hinglish = buildWebSearchQuery(
  'Mujhe Delhi ke 20 SaaS businesses find karke unke decision makers ke emails nikalo.'
);
assert.equal(hinglish, 'SaaS companies Delhi');
assert(!hinglish.includes('Mujhe'));
assert(!hinglish.includes('decision makers'));

const english = buildWebSearchQuery('Find 10 AI SaaS companies in Bangalore and get founder emails');
assert.equal(english, 'AI SaaS companies Bangalore');

console.log('✓ searchQuery: Hinglish and English task prompts become compact subject queries');
