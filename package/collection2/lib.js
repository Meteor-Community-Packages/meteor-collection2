export function flattenSelector(selector) {
  // If the selector uses $and format, convert to plain object selector
  if (Array.isArray(selector.$and)) {
    selector.$and.forEach((sel) => {
      Object.assign(selector, flattenSelector(sel));
    });

    delete selector.$and;
  }

  const obj = {};

  for (const [key, value] of Object.entries(selector) || []) {
    // Ignoring logical selectors (https://docs.mongodb.com/manual/reference/operator/query/#logical)
    if (!key.startsWith('$')) {
      if (typeof value === 'object' && value !== null) {
        if (value.$eq !== undefined) {
          obj[key] = value.$eq;
        } else if (Array.isArray(value.$in) && value.$in.length === 1) {
          obj[key] = value.$in[0];
        } else if (Object.keys(value).every((v) => !(typeof v === 'string' && v.startsWith('$')))) {
          obj[key] = value;
        }
      } else {
        obj[key] = value;
      }
    }
  }

  return obj;
}

export const isInsertType = function (type) {
  return ['insert', 'insertAsync'].includes(type);
};
export const isUpdateType = function (type) {
  return ['update', 'updateAsync'].includes(type);
};
export const isUpsertType = function (type) {
  return ['upsert', 'upsertAsync'].includes(type);
};

export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEqual(a, b) {
  // Handle primitive types and null/undefined
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Get object keys
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  // Check if number of keys match
  if (keysA.length !== keysB.length) return false;

  // Compare each key-value pair recursively
  return keysA.every(key => {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    return isEqual(a[key], b[key]);
  });
}


