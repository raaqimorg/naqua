
import { readFileSync, writeFileSync } from 'node:fs';
import { DATASET_PATH, parseDataset } from '../src/data/dataset.ts';
import { formatDataset } from '../src/data/format.ts';

const source = readFileSync(DATASET_PATH, 'utf8');
const dataset = parseDataset(source);
const formatted = formatDataset(dataset);

if (formatted === source) {
  console.log('data/companies.json is valid and already formatted.');
} else {
  writeFileSync(DATASET_PATH, formatted);
  console.log('data/companies.json is valid; reformatted.');
}
