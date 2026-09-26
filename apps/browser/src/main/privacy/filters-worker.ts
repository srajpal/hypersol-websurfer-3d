/**
 * Builds the filter engine from downloaded list texts in a worker
 * thread: parsing the lists takes most of a second, too long to hold up
 * the main process (see GitHub issue #4). Gets { lists, resources,
 * checksum } and answers with the engine's saved form, or { error }.
 */
import { parentPort } from 'node:worker_threads';
import { FiltersEngine } from '@ghostery/adblocker';

interface Job {
  lists: string[];
  resources: string;
  checksum: string;
}

parentPort?.once('message', (job: Job) => {
  try {
    const engine = FiltersEngine.parse(job.lists.join('\n'));
    engine.updateResources(job.resources, job.checksum);
    const bin = engine.serialize();
    parentPort?.postMessage({ bin }, [bin.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort?.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
