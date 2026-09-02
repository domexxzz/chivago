/**
 * The API contract, captured as SHAPES.
 *
 * Two more clients (Swift, Dart) are two more hand-written copies of what this
 * server returns, and a hand-written copy drifts. Not loudly - a field gets
 * renamed here, the mobile app is updated because it lives in the same
 * repository and the same typecheck, and the Swift client keeps compiling
 * perfectly while decoding nothing. The failure surfaces on a traveller's
 * phone, in another language, weeks later.
 *
 * So the shape of every response the SDKs read is captured and checked in
 * (`contract/*.json`, tracked). `contract.test.ts` checks the samples against
 * the shapes they were captured with; drift is caught when somebody re-runs
 * `pnpm contract` and the diff of the tracked files names which path moved.
 * The capture is not automatic - a running server is still needed - and that
 * is the remaining gap.
 *
 * SHAPES, not values. What matters to a decoder is that `balances.green` is a
 * number and still called that. Whether it is 1240 today is nobody's business.
 */

/** A recursively described response shape. */
export type Shape =
  | 'string' | 'number' | 'boolean' | 'null' | 'unknown'
  | { array: Shape }
  | { object: Record<string, Shape> };

export function shapeOf(value: unknown): Shape {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    // The first element stands for the list. A heterogeneous array would be a
    // bug in the API long before it was a problem for the capture.
    return { array: value.length > 0 ? shapeOf(value[0]) : 'unknown' };
  }
  switch (typeof value) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'object': {
      const out: Record<string, Shape> = {};
      for (const key of Object.keys(value as object).sort()) {
        out[key] = shapeOf((value as Record<string, unknown>)[key]);
      }
      return { object: out };
    }
    default: return 'unknown';
  }
}

export interface Difference {
  path: string;
  expected: string;
  actual: string;
}

const describe = (s: Shape): string =>
  typeof s === 'string' ? s : 'array' in s ? 'array' : 'object';

/**
 * Compare a captured shape against the recorded one.
 *
 * `null` is a WILDCARD on both sides. A nullable field that happened to be null
 * when the fixture was taken must not fail the day it holds a string - that is
 * the field working, not the contract breaking. What breaks a decoder is a
 * field vanishing, or changing from one non-null type to another.
 */
export function diffShapes(expected: Shape, actual: Shape, path = ''): Difference[] {
  if (expected === 'null' || actual === 'null') return [];
  if (expected === 'unknown' || actual === 'unknown') return [];

  if (typeof expected === 'string' || typeof actual === 'string') {
    return expected === actual
      ? []
      : [{ path, expected: describe(expected), actual: describe(actual) }];
  }

  if ('array' in expected && 'array' in actual) {
    return diffShapes(expected.array, actual.array, `${path}[]`);
  }
  if ('object' in expected && 'object' in actual) {
    const out: Difference[] = [];
    for (const [key, sub] of Object.entries(expected.object)) {
      const here = path ? `${path}.${key}` : key;
      if (!(key in actual.object)) {
        out.push({ path: here, expected: describe(sub), actual: 'missing' });
        continue;
      }
      out.push(...diffShapes(sub, actual.object[key]!, here));
    }
    // An ADDED field is not a break: an old decoder ignores it.
    return out;
  }
  return [{ path, expected: describe(expected), actual: describe(actual) }];
}

/** Fields present now and absent from the fixture. Informational, never fatal. */
export function addedFields(expected: Shape, actual: Shape, path = ''): string[] {
  if (typeof expected === 'string' || typeof actual === 'string') return [];
  if ('array' in expected && 'array' in actual) {
    return addedFields(expected.array, actual.array, `${path}[]`);
  }
  if ('object' in expected && 'object' in actual) {
    const out: string[] = [];
    for (const key of Object.keys(actual.object)) {
      const here = path ? `${path}.${key}` : key;
      if (!(key in expected.object)) out.push(here);
      else out.push(...addedFields(expected.object[key]!, actual.object[key]!, here));
    }
    return out;
  }
  return [];
}
