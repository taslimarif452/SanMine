import { runProposalMindTests } from './proposalMind.test.js';
import { runQualityGateTests } from './qualityGate.test.js';
import { runProposalWriterTests } from './proposalWriter.test.js';
import { runPipelineIntegrationTests } from './pipeline.test.js';

async function main() {
  console.log('==============================================');
  console.log('Running Proposal Intelligence Test Suite');
  console.log('==============================================\n');

  console.log('--- 1. Proposal Mind Tests ---');
  const mindResults = runProposalMindTests();
  let mindPassed = 0;
  for (const r of mindResults) {
    if (r.passed) {
      mindPassed++;
      console.log(`✓ [PASS] ${r.test}`);
    } else {
      console.error(`✗ [FAIL] ${r.test}: ${r.details || ''}`);
    }
  }
  console.log(`Mind Tests: ${mindPassed}/${mindResults.length} passed\n`);

  console.log('--- 2. Quality Gate Tests ---');
  const gateResults = runQualityGateTests();
  let gatePassed = 0;
  for (const r of gateResults) {
    if (r.passed) {
      gatePassed++;
      console.log(`✓ [PASS] ${r.test}`);
    } else {
      console.error(`✗ [FAIL] ${r.test}: ${r.details || ''}`);
    }
  }
  console.log(`Quality Gate Tests: ${gatePassed}/${gateResults.length} passed\n`);

  console.log('--- 3. Proposal Writer Tests ---');
  const writerResults = await runProposalWriterTests();
  let writerPassed = 0;
  for (const r of writerResults) {
    if (r.passed) {
      writerPassed++;
      console.log(`✓ [PASS] ${r.test}`);
    } else {
      console.error(`✗ [FAIL] ${r.test}: ${r.details || ''}`);
    }
  }
  console.log(`Writer Tests: ${writerPassed}/${writerResults.length} passed\n`);

  console.log('--- 4. End-to-End Pipeline Integration Tests ---');
  const pipelineResults = await runPipelineIntegrationTests();
  let pipelinePassed = 0;
  for (const r of pipelineResults) {
    if (r.passed) {
      pipelinePassed++;
      console.log(`✓ [PASS] ${r.test}`);
    } else {
      console.error(`✗ [FAIL] ${r.test}: ${r.details || ''}`);
    }
  }
  console.log(`Pipeline Tests: ${pipelinePassed}/${pipelineResults.length} passed\n`);

  const totalTests = mindResults.length + gateResults.length + writerResults.length + pipelineResults.length;
  const totalPassed = mindPassed + gatePassed + writerPassed + pipelinePassed;

  console.log('==============================================');
  console.log(`TOTAL SUITE: ${totalPassed}/${totalTests} TESTS PASSED`);
  console.log('==============================================');

  if (totalPassed !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
