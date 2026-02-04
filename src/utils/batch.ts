export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("Chunk size must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export interface BatchProcessorOptions {
  concurrency?: number;
  rateLimit?: number; // requests per second
}

export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  options: BatchProcessorOptions = {}
): Promise<R[]> {
  const { concurrency = 1, rateLimit = 0 } = options;
  const batches = chunk(items, batchSize);

  if (batches.length === 0) return [];

  // Calculate delay between requests based on rate limit
  const delayMs = rateLimit > 0 ? Math.ceil(1000 / rateLimit) : 0;

  // Process with concurrency control
  const results: R[][] = new Array(batches.length);
  let currentIndex = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < batches.length) {
      const index = currentIndex++;
      const batch = batches[index]!;

      // Apply rate limiting delay before each request
      if (delayMs > 0 && index > 0) {
        await sleep(delayMs);
      }

      results[index] = await processor(batch);
    }
  };

  // Start concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () =>
    processNext()
  );

  await Promise.all(workers);

  return results.flat();
}

export async function processBatchesParallel<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  options: BatchProcessorOptions = {}
): Promise<R[]> {
  const { concurrency = 5, rateLimit = 10 } = options;
  const batches = chunk(items, batchSize);

  if (batches.length === 0) return [];

  const results: R[][] = new Array(batches.length);
  const delayMs = rateLimit > 0 ? Math.ceil(1000 / rateLimit) : 0;

  // Semaphore for concurrency control
  let running = 0;
  let nextIndex = 0;
  const queue: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (running < concurrency) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => queue.push(resolve));
  };

  const release = (): void => {
    running--;
    const next = queue.shift();
    if (next) {
      running++;
      next();
    }
  };

  const processBatch = async (index: number): Promise<void> => {
    await acquire();
    try {
      // Rate limiting - stagger requests
      if (delayMs > 0 && index > 0) {
        await sleep(delayMs * (index % concurrency));
      }
      results[index] = await processor(batches[index]!);
    } finally {
      release();
    }
  };

  await Promise.all(batches.map((_, index) => processBatch(index)));

  return results.flat();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
