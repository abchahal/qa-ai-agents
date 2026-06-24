import fs from 'fs';
import path from 'path';

export function cleanupOutput(): void {
  console.log('\nCleaning up previous output...');

  const foldersToClean = [
    path.join('output', 'tests'),
    path.join('output', 'pages'),
  ];

  const filesToClean = [
    path.join('output', 'pipeline_report.md'),
  ];

  // Delete and recreate test/pages folders
  for (const folder of foldersToClean) {
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
      console.log(`  ✓ Cleared: ${folder}`);
    }
    fs.mkdirSync(folder, { recursive: true });
  }

  // Delete individual files
  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      console.log(`  ✓ Deleted: ${file}`);
    }
  }

  // Ensure output root exists
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
  }

  console.log('  ✓ Cleanup complete — ready for fresh run\n');
}