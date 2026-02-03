import { describe, expect, test } from "bun:test";
import { chunk, processBatches } from "../src/utils/batch";

describe("chunk", () => {
  test("splits array into chunks of specified size", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    const result = chunk(arr, 3);

    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  test("returns single chunk when array smaller than size", () => {
    const arr = [1, 2];
    const result = chunk(arr, 5);

    expect(result).toEqual([[1, 2]]);
  });

  test("returns empty array for empty input", () => {
    const result = chunk([], 5);

    expect(result).toEqual([]);
  });

  test("throws error for invalid chunk size", () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
    expect(() => chunk([1, 2, 3], -1)).toThrow();
  });
});

describe("processBatches", () => {
  test("processes all batches", async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = async (batch: number[]) => batch.map((n) => n * 2);

    const result = await processBatches(items, 2, processor);

    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  test("handles single batch", async () => {
    const items = [1, 2];
    const processor = async (batch: number[]) => batch;

    const result = await processBatches(items, 10, processor);

    expect(result).toEqual([1, 2]);
  });
});
