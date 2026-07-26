export function flattenSelector(selector) {
  // Use a prototype-less accumulator so selector field names are always copied
  // as data properties, including names such as "__proto__".
  const obj = Object.create(null);

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

  // If the selector uses $and format, add its equality-like fields to the
  // validation projection without changing the selector that Mongo will use.
  if (Array.isArray(selector.$and)) {
    selector.$and.forEach((sel) => {
      Object.assign(obj, flattenSelector(sel));
    });
  }

  // Return a normal object for compatibility with the validation adapters.
  // Object spread creates own data properties without invoking __proto__ setters.
  return { ...obj };
}

export function mergeSelectorAndSet(selector, set) {
  // Modifier values take precedence over values inferred from the selector.
  return {
    ...flattenSelector(selector),
    ...set
  };
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

