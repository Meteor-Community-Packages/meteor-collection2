const zodAutoValues = new WeakMap();

export const autoValue = (schema, fn) => {
  if (!schema || typeof schema !== 'object' || typeof fn !== 'function') {
    throw new TypeError('Collection2.autoValue requires a Zod schema and a function');
  }

  zodAutoValues.set(schema, fn);
  return schema;
};

export const getZodAutoValue = schema => zodAutoValues.get(schema);
