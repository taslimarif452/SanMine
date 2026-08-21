import fs from 'node:fs';
import path from 'node:path';

interface Violation {
  file: string;
  line: number;
  specifier: string;
  statement: string;
  reason: string;
}

const PRODUCTION_DIRS = ['api', 'server'];
const TEST_FILES = new Set([
  'server/intelligence/runTests.ts',
  'server/intelligence/proposalMind.test.ts',
  'server/intelligence/proposalWriter.test.ts',
  'server/intelligence/qualityGate.test.ts',
  'server/intelligence/pipeline.test.ts',
  'server/research/research.test.ts',
  'server/vercel.test.ts',
  'server/gmail/gmail.test.ts',
  'server/agent.test.ts',
  'server/browser/browser.test.ts',
]);

function getAllFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        files = files.concat(getAllFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function auditFile(filePath: string): Violation[] {
  const isTestFile = TEST_FILES.has(filePath.replace(/\\/g, '/'));
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];
  const dir = path.dirname(filePath);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    let match: RegExpExecArray | null;
    const lineRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.{1,2}\/[^'"]*)['"]|import\(['"](\.{1,2}\/[^'"]*)['"]\)/g;
    while ((match = lineRegex.exec(line)) !== null) {
      const specifier = match[1] || match[2];
      if (!specifier) continue;

      // Check 1: Must not use .ts or .tsx in imports (forbidden in standard Node runtime)
      if (/\.tsx?$/.test(specifier)) {
        violations.push({
          file: filePath,
          line: index + 1,
          specifier,
          statement: trimmed,
          reason: 'Must use explicit .js extension instead of .ts/.tsx in import/export specifier',
        });
        continue;
      }

      // Check 2: Must have a valid extension (.js, .json, .mjs, .cjs)
      const hasValidExt = /\.(js|json|mjs|cjs|css|svg|wasm)$/.test(specifier);
      if (!hasValidExt) {
        violations.push({
          file: filePath,
          line: index + 1,
          specifier,
          statement: trimmed,
          reason: 'Missing explicit extension (.js required for Node.js ESM resolution)',
        });
        continue;
      }

      // Check 3: If in production file, must not import test files
      if (!isTestFile && /\.(test|spec)\.js$/.test(specifier)) {
        violations.push({
          file: filePath,
          line: index + 1,
          specifier,
          statement: trimmed,
          reason: 'Production runtime module must not import/export test files',
        });
        continue;
      }

      // Check 4: The referenced file must exist on disk (as .ts, .tsx, .js, or .json)
      const targetPath = path.resolve(dir, specifier);
      let exists = fs.existsSync(targetPath);
      if (!exists) {
        const tsTarget = targetPath.replace(/\.js$/, '.ts');
        const tsxTarget = targetPath.replace(/\.js$/, '.tsx');
        if (fs.existsSync(tsTarget) || fs.existsSync(tsxTarget)) {
          exists = true;
        }
      }

      if (!exists) {
        violations.push({
          file: filePath,
          line: index + 1,
          specifier,
          statement: trimmed,
          reason: `Target file cannot be resolved: ${targetPath}`,
        });
      }
    }
  });

  return violations;
}

export function runEsmAudit(): { totalViolations: number; violationsByFile: Record<string, Violation[]> } {
  const allFiles: string[] = [];
  for (const dir of PRODUCTION_DIRS) {
    if (fs.existsSync(dir)) {
      allFiles.push(...getAllFiles(dir));
    }
  }

  const violationsByFile: Record<string, Violation[]> = {};
  let totalViolations = 0;

  for (const file of allFiles) {
    const violations = auditFile(file);
    if (violations.length > 0) {
      violationsByFile[file] = violations;
      totalViolations += violations.length;
    }
  }

  return { totalViolations, violationsByFile };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('audit-esm.ts')) {
  console.log('🔍 Running Node.js ESM Import Specifier & Resolution Audit across production server & api...');
  const { totalViolations, violationsByFile } = runEsmAudit();

  if (totalViolations > 0) {
    console.error(`\n❌ ESM audit FAILED: Found ${totalViolations} violations:\n`);
    for (const [file, violations] of Object.entries(violationsByFile)) {
      console.error(`📁 ${file}:`);
      for (const v of violations) {
        console.error(`   Line ${v.line}: "${v.specifier}" -> ${v.statement} (${v.reason})`);
      }
    }
    console.error(`\nAction required: Fix all relative imports to use explicit .js and resolve to real files.`);
    process.exit(1);
  } else {
    console.log(`\n✅ ESM audit PASSED`);
    console.log(`0 extensionless or unresolved production imports found across all production files.\n`);
    process.exit(0);
  }
}
