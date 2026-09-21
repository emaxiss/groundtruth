import { buildGroundingBlock, groundingStats } from '../lib/corpus/index.ts';

console.log(buildGroundingBlock());
console.log('\n--- STATS ---');
console.log(JSON.stringify(groundingStats(), null, 2));
