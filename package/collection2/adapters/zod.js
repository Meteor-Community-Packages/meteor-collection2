import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType, isUpsertType } from '../lib';
import { isZod4Schema } from '../schemaDetectors';
import { getZodAutoValue } from '../zodAutoValue';

/**
 * Formats Zod validation errors into a consistent structure
 * @param {Object} error - The Zod error object
 * @returns {Array} Formatted error objects
 */
const formatZodErrors = (error) => {
  if (!error || !error.issues) {
    return [
      { name: 'general', type: 'error', message: error?.message || 'Unknown validation error' }
    ];
  }

  return error.issues.map((err) => ({
    name: err.path.join('.'),
    type: err.code,
    value: err.received,
    message: err.message
  }));
};

const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
const getPath = (obj, path) => path.split('.').reduce(
  (value, key) => (hasOwn(value, key) ? value[key] : undefined),
  obj
);

const setOwn = (obj, key, value) => {
  Object.defineProperty(obj, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true
  });
};

const setPath = (obj, path, value) => {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!hasOwn(target, parts[i]) || !target[parts[i]] || typeof target[parts[i]] !== 'object') {
      setOwn(target, parts[i], Object.create(null));
    }
    target = target[parts[i]];
  }
  setOwn(target, parts[parts.length - 1], value);
};

const deletePath = (obj, path) => {
  const parts = path.split('.');
  const target = parts.slice(0, -1).reduce(
    (value, key) => (hasOwn(value, key) ? value[key] : undefined),
    obj
  );
  const key = parts[parts.length - 1];
  if (!target || !hasOwn(target, key)) return;
  if (Array.isArray(target) && /^\d+$/.test(key)) target.splice(Number(key), 1);
  else delete target[key];
};

const cloneDefault = value => EJSON.clone(value);

const applyZodDefaults = (schema, value) => {
  if (!schema) return value;
  const def = getZodDef(schema);

  if (isZodType(schema, 'default')) {
    if (value === undefined) return cloneDefault(def.defaultValue);
    return applyZodDefaults(def.innerType, value);
  }

  if (
    isZodType(
      schema,
      'optional',
      'nullable',
      'nonoptional',
      'prefault',
      'catch',
      'readonly',
      'branded'
    )
  ) {
    return applyZodDefaults(def.innerType || def.type, value);
  }

  if (isZodType(schema, 'pipe', 'pipeline')) {
    return applyZodDefaults(def.in, value);
  }

  if (isZodType(schema, 'lazy')) {
    return applyZodDefaults(def.getter?.(), value);
  }

  if (isZodType(schema, 'object') && value && typeof value === 'object' && !Array.isArray(value)) {
    const shape = getZodShape(schema) || {};
    for (const [key, childSchema] of Object.entries(shape)) {
      const childValue = applyZodDefaults(childSchema, hasOwn(value, key) ? value[key] : undefined);
      if (childValue !== undefined) setOwn(value, key, childValue);
    }
  } else if (isZodType(schema, 'array') && Array.isArray(value)) {
    const element = getZodArrayElement(schema);
    value.forEach((item, index) => {
      value[index] = applyZodDefaults(element, item);
    });
  }

  return value;
};

const getModifierPosition = (modifier, path) => {
  let bestMatch = null;
  for (const [operator, operation] of Object.entries(modifier)) {
    if (!operation || typeof operation !== 'object') continue;
    for (const key of Object.keys(operation)) {
      const isExact = key === path;
      const canTraverseValue = operator === '$set' || operator === '$setOnInsert';
      if (!isExact && (!canTraverseValue || !path.startsWith(`${key}.`))) continue;
      if (bestMatch && bestMatch.key.length >= key.length) continue;

      let relativePath = key === path ? '' : path.slice(key.length + 1);
      bestMatch = {
        key,
        operation,
        operator,
        relativePath,
        value: relativePath ? getPath(operation[key], relativePath) : operation[key]
      };
    }
  }
  return bestMatch;
};

const getModifierValue = (modifier, path) => {
  const position = getModifierPosition(modifier, path);
  if (position) {
    return {
      isSet: position.value !== undefined,
      operator: position.operator,
      value: position.value
    };
  }
  return { isSet: false, operator: null, value: undefined };
};

const removeModifierPath = (modifier, path) => {
  const position = getModifierPosition(modifier, path);
  if (position?.relativePath) {
    deletePath(position.operation[position.key], position.relativePath);
    return;
  }

  for (const [operator, operation] of Object.entries(modifier)) {
    if (operation && typeof operation === 'object') delete operation[path];
    if (operation && typeof operation === 'object' && !Object.keys(operation).length) {
      delete modifier[operator];
    }
  }
};

const modifierAffectsPath = (modifier, path) => Object.values(modifier).some(operation =>
  operation && typeof operation === 'object' && Object.keys(operation).some(key =>
    key === path || key.startsWith(`${path}.`) || path.startsWith(`${key}.`)
  )
);

const getAutoValueThroughWrappers = schema => {
  let current = schema;
  let guard = 0;
  while (current && guard < 10) {
    const fn = getZodAutoValue(current);
    if (fn) return fn;
    const def = getZodDef(current);

    if (
      isZodType(
        current,
        'optional',
        'nullable',
        'default',
        'prefault',
        'nonoptional',
        'catch',
        'readonly',
        'branded'
      )
    ) {
      current = def.innerType || def.type;
    } else if (isZodType(current, 'pipe', 'pipeline')) {
      current = def.in;
    } else {
      return undefined;
    }
    guard++;
  }
  return undefined;
};

const collectZodAutoValues = ({
  schema,
  target,
  isModifier,
  path = '',
  entries = [],
  queuedPaths = new Set()
}) => {
  if (!schema) return entries;
  const fn = getAutoValueThroughWrappers(schema);
  if (fn && path && !queuedPaths.has(path)) {
    entries.push({ path, fn, schema });
    queuedPaths.add(path);
  }

  const unwrapped = unwrapZodSchema(schema);
  if (isZodType(unwrapped, 'object')) {
    for (const [key, childSchema] of Object.entries(getZodShape(unwrapped) || {})) {
      collectZodAutoValues({
        schema: childSchema,
        target,
        isModifier,
        path: path ? `${path}.${key}` : key,
        entries,
        queuedPaths
      });
    }
  } else if (isZodType(unwrapped, 'array') && path) {
    const position = isModifier ? getModifierPosition(target, path) : null;
    const value = isModifier
      ? position && ['$set', '$setOnInsert'].includes(position.operator)
        ? position.value
        : undefined
      : getPath(target, path);
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index--) {
        collectZodAutoValues({
          schema: getZodArrayElement(unwrapped),
          target,
          isModifier,
          path: `${path}.${index}`,
          entries,
          queuedPaths
        });
      }
    }
  }
  return entries;
};

const hasPositionalPathPart = path => path.split('.').some(isArrayPathPart);

const getZodAutoValueEntries = (state, queuedPaths = new Set()) => {
  const entries = collectZodAutoValues({ ...state, queuedPaths });
  if (state.isModifier) {
    for (const operator of ['$set', '$setOnInsert']) {
      for (const path of Object.keys(state.target[operator] || {})) {
        if (hasPositionalPathPart(path)) continue;
        const resolution = resolveZodSchemaPath(state.schema, path);
        if (resolution?.schema) {
          collectZodAutoValues({
            ...state,
            schema: resolution.schema,
            path,
            entries,
            queuedPaths
          });
        }
      }
    }
  }
  return entries;
};

const queueZodAutoValueChildren = (state, entry, entries, queuedPaths) => {
  collectZodAutoValues({
    ...state,
    schema: entry.schema,
    path: entry.path,
    entries,
    queuedPaths
  });
};

const isBelowRemovedPath = (path, removedPaths) => {
  let separator = path.lastIndexOf('.');
  while (separator !== -1) {
    if (removedPaths.has(path.slice(0, separator))) return true;
    separator = path.lastIndexOf('.', separator - 1);
  }
  return false;
};

const createAutoValueContext = ({ target, path, isModifier, context }) => {
  const info = isModifier
    ? getModifierValue(target, path)
    : { isSet: getPath(target, path) !== undefined, operator: null, value: getPath(target, path) };
  let shouldUnset = false;

  return {
    key: path,
    value: info.value,
    isSet: info.isSet,
    isModifier,
    operator: info.operator,
    ...context,
    field(fieldName) {
      const fieldInfo = isModifier
        ? getModifierValue(target, fieldName)
        : { value: getPath(target, fieldName) };
      return {
        isSet: fieldInfo.value !== undefined,
        operator: fieldInfo.operator || null,
        value: fieldInfo.value
      };
    },
    siblingField(fieldName) {
      const parent = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
      return this.field(`${parent}${fieldName}`);
    },
    parentField() {
      const parent = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
      return this.field(parent);
    },
    unset() {
      shouldUnset = true;
    },
    wasUnset() {
      return shouldUnset;
    }
  };
};

const applyAutoValueResult = ({ target, path, result, isModifier, isUpsert, unset }) => {
  if (unset) {
    if (isModifier) removeModifierPath(target, path);
    else deletePath(target, path);
    return;
  }
  if (result === undefined) return;

  if (!isModifier) {
    setPath(target, path, result);
    return;
  }

  const position = getModifierPosition(target, path);
  const resultOperator = result && typeof result === 'object'
    ? Object.keys(result).find(key => key.startsWith('$'))
    : null;
  if (position?.relativePath) {
    if (resultOperator && resultOperator !== position.operator) {
      throw new Error(
        `Zod autoValue for '${path}' cannot change the operator of a containing ${position.operator} value`
      );
    }
    setPath(
      position.operation[position.key],
      position.relativePath,
      resultOperator ? result[resultOperator] : result
    );
    return;
  }

  let operator = '$set';
  let value = result;
  if (resultOperator) {
    operator = resultOperator;
    value = result[resultOperator];
  }
  removeModifierPath(target, path);
  if (modifierAffectsPath(target, path)) return;
  if (!hasOwn(target, operator) || !target[operator] || typeof target[operator] !== 'object') {
    setOwn(target, operator, Object.create(null));
  }
  setOwn(target[operator], path, value);
};

const cleanZodDefaults = ({ target, schema, isModifier, isUpsert }) => {
  if (!isModifier) {
    applyZodDefaults(schema, target);
    return;
  }

  for (const operator of ['$set', '$setOnInsert']) {
    if (!target[operator]) continue;
    for (const [path, value] of Object.entries(target[operator])) {
      const resolution = resolveZodSchemaPath(schema, path);
      if (resolution?.schema) {
        target[operator][path] = applyZodDefaults(resolution.schema, value);
      }
    }
  }

  if (isUpsert) {
    if (!hasOwn(target, '$setOnInsert') || !target.$setOnInsert) {
      setOwn(target, '$setOnInsert', Object.create(null));
    }
    for (const [key, childSchema] of Object.entries(getZodShape(unwrapZodSchema(schema)) || {})) {
      if (modifierAffectsPath(target, key)) continue;
      const defaultValue = applyZodDefaults(childSchema, undefined);
      if (defaultValue !== undefined) setOwn(target.$setOnInsert, key, defaultValue);
    }
    if (!Object.keys(target.$setOnInsert).length) delete target.$setOnInsert;
  }
};

const prepareZodClean = (args) => {
  const { doc, modifier, schema, type } = args;
  const options = args.options || {
    extendAutoValueContext: {
      isInsert: isInsertType(type),
      isUpdate: !isInsertType(type),
      isUpsert: false,
      userId: args.userId,
      isFromTrustedCode: false,
      docId: doc?._id,
      isLocalCollection: args.isLocalCollection
    }
  };
  const isModifier = !isInsertType(type);
  const isUpsert = isUpsertType(type) || options.extendAutoValueContext?.isUpsert;
  const target = isModifier ? modifier : doc;

  cleanZodDefaults({ target, schema, isModifier, isUpsert });
  return { isModifier, isUpsert, options, schema, target };
};

const cleanZodSync = args => {
  const state = prepareZodClean(args);
  if (state.options.getAutoValues === false) return state.target;

  const queuedPaths = new Set();
  const removedPaths = new Set();
  const entries = getZodAutoValueEntries(state, queuedPaths);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const { path, fn } = entry;
    if (isBelowRemovedPath(path, removedPaths)) continue;
    const context = createAutoValueContext({
      target: state.target,
      path,
      isModifier: state.isModifier,
      context: state.options.extendAutoValueContext || {}
    });
    const result = fn.call(context, state.target);
    if (result && typeof result.then === 'function') {
      throw new Error('Async Zod autoValues require Mongo.Collection async mutation methods');
    }
    applyAutoValueResult({
      target: state.target,
      path,
      result,
      isModifier: state.isModifier,
      isUpsert: state.isUpsert,
      unset: context.wasUnset()
    });
    if (context.wasUnset()) removedPaths.add(path);
    else queueZodAutoValueChildren(state, entry, entries, queuedPaths);
  }
  return state.target;
};

const cleanZodAsync = async args => {
  const state = prepareZodClean(args);
  if (state.options.getAutoValues === false) return state.target;

  const queuedPaths = new Set();
  const removedPaths = new Set();
  const entries = getZodAutoValueEntries(state, queuedPaths);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const { path, fn } = entry;
    if (isBelowRemovedPath(path, removedPaths)) continue;
    const context = createAutoValueContext({
      target: state.target,
      path,
      isModifier: state.isModifier,
      context: state.options.extendAutoValueContext || {}
    });
    applyAutoValueResult({
      target: state.target,
      path,
      result: await fn.call(context, state.target),
      isModifier: state.isModifier,
      isUpsert: state.isUpsert,
      unset: context.wasUnset()
    });
    if (context.wasUnset()) removedPaths.add(path);
    else queueZodAutoValueChildren(state, entry, entries, queuedPaths);
  }
  return state.target;
};

/**
 * Zod adapter
 * @returns {Object} Zod adapter implementation
 */
export const createZodAdapter = (z) => ({
  name: 'zod',
  asyncOnly: false,
  is: (schema) => isZod4Schema(schema),
  create: (schema) => {
    // If this is already a Zod schema, return it directly with namedContext
    if (isZod4Schema(schema)) {
      // Enhance the schema with Collection2 compatibility methods
      return enhanceZodSchema(schema);
    }

    // For non-Zod schemas, we can't convert without the actual Zod library
    throw new Error(
      'Cannot create Zod schema from non-Zod object. Please use a Zod schema directly.'
    );
  },
  extend: (s1, s2) => {
    // For property-based detection, we need to ensure both schemas have the right properties
    if (!isZod4Schema(s1) || !isZod4Schema(s2)) {
      throw new Error('Both schemas must be Zod schemas');
    }

    // Since we don't have direct access to Zod's methods, we'll use a simplified approach
    // In a real implementation, you'd merge the schemas properly
    const mergedSchema = s1.merge(s2);

    // Ensure the merged schema has all the Collection2 compatibility methods
    return enhanceZodSchema(mergedSchema);
  },
  validate: (obj, schema, options = {}) => {
    try {
      // Handle modifiers for updates
      if (options.modifier) {
        const context = createZodValidationContext(schema);
        const isValid = context.validate(obj, options);
        if (isValid) {
          return { isValid: true };
        } else {
          return {
            isValid: false,
            errors: context.validationErrors()
          };
        }
      } else {
        // Handle regular document validation
        const result = schema.safeParse(obj);
        if (result.success) {
          return { isValid: true };
        } else {
          return {
            isValid: false,
            errors: formatZodErrors(result.error)
          };
        }
      }
    } catch (error) {
      // Handle any unexpected errors
      return {
        isValid: false,
        errors: formatZodErrors(error)
      };
    }
  },
  cleanSync: args => cleanZodSync(args),
  cleanAsync: args => cleanZodAsync(args),
  validateSync: ({ context, target, options }) => context.validate(target, options),
  validateAsync: ({ context, target, options }) => context.validate(target, options),
  getErrorObject: (context, appendToMessage = '', code) => {
    const invalidKeys = context.validationErrors();

    if (!invalidKeys || invalidKeys.length === 0) {
      const error = new Error('Unknown validation error');
      error.name = 'ValidationError';
      return error;
    }

    const firstErrorKey = invalidKeys[0].name;
    const firstErrorMessage = invalidKeys[0].message;
    let message = firstErrorMessage;

    // Special handling for required/missing fields (invalid_type with undefined value)
    if (invalidKeys[0].type === 'invalid_type' && invalidKeys[0].value === undefined) {
      // Get the expected type directly from the error
      const expectedType = invalidKeys[0].expected || 'string';
      message = `Field '${firstErrorKey}' is required but was not provided (expected ${expectedType})`;
    }
    // Special handling for other type errors
    else if (invalidKeys[0].type === 'invalid_type') {
      // Get the expected type directly from the error
      const expectedType = invalidKeys[0].expected || 'string';
      const receivedValue = invalidKeys[0].value;
      message = `Field '${firstErrorKey}' has invalid type: expected ${expectedType}, received ${receivedValue}`;
    }
    // Special handling for string length errors
    else if (invalidKeys[0].type === 'too_small' && firstErrorKey) {
      message = `Field '${firstErrorKey}' ${firstErrorMessage}`;
    }
    // Special handling for regex pattern errors
    else if (invalidKeys[0].type === 'invalid_string' && invalidKeys[0].validation === 'regex') {
      message = `Field '${firstErrorKey}' does not match required pattern`;
    }
    // General case with error type and value
    else if (invalidKeys[0].type && invalidKeys[0].value !== undefined) {
      message = `${firstErrorMessage} for field '${firstErrorKey}' (${
        invalidKeys[0].type
      }: received ${JSON.stringify(invalidKeys[0].value)})`;
    }
    // Fallback to standard message format
    else {
      if (firstErrorKey.indexOf('.') === -1) {
        message = `${firstErrorMessage} for field '${firstErrorKey}'`;
      } else {
        message = `${firstErrorMessage} (${firstErrorKey})`;
      }
    }

    message = `${message} ${appendToMessage}`.trim();
    const error = new Error(message);
    error.invalidKeys = invalidKeys;
    error.validationContext = context;
    error.code = code;
    error.name = 'ValidationError'; // Set the name to ValidationError consistently
    // If on the server, we add a sanitized error, too, in case we're
    // called from a method.
    if (Meteor.isServer) {
      error.sanitizedError = new Meteor.Error(400, message, EJSON.stringify(error.invalidKeys));
    }
    return error;
  },
  getValidationContext: (schema, validationContext) => {
    if (validationContext && typeof validationContext === 'object') {
      return validationContext;
    }

    // Ensure the schema is enhanced with Collection2 compatibility methods
    const enhancedSchema = enhanceZodSchema(schema);
    return enhancedSchema.namedContext(validationContext);
  },
  enhance: (schema) => {
    // Enhance the schema with Collection2 compatibility methods
    return enhanceZodSchema(schema);
  },
  freeze: false
});

/**
 * ZodValidationContext class for handling Zod schema validation
 * Provides a Collection2-compatible validation context
 */
class ZodValidationContext {
  /**
   * Create a new ZodValidationContext
   * @param {Object} schema - The Zod schema
   * @param {String} name - Optional name for the context
   */
  constructor(schema, name = 'default') {
    this.schema = schema;
    this.name = name;
    this.errors = [];
  }

  /**
   * Validate an object against the schema
   * @param {Object} obj - The object to validate
   * @param {Object} options - Validation options
   * @returns {Boolean} True if valid, false otherwise
   */
  validate(obj, options = {}) {
    this.errors = []; // Clear previous errors

    try {
      // For modifiers, we need special handling
      if (options.modifier) {
        // For now, we'll just validate that the fields being modified are valid
        // In a real implementation, we would validate each modifier operation
        const modifier = obj;
        let isValid = true;

        // Check $set operations
        if (modifier.$set) {
          if (!validateSetModifierFields(this.schema, modifier.$set, this.errors)) {
            isValid = false;
          }
        }

        // Check $setOnInsert operations
        if (modifier.$setOnInsert) {
          if (!validateSetModifierFields(this.schema, modifier.$setOnInsert, this.errors)) {
            isValid = false;
          }
        }

        // Check $unset operations against required fields
        if (modifier.$unset) {
          if (!validateUnsetModifierFields(this.schema, modifier.$unset, this.errors)) {
            isValid = false;
          }
        }

        // Check $inc operations against numeric fields
        if (modifier.$inc) {
          if (!validateIncModifierFields(this.schema, modifier.$inc, this.errors)) {
            isValid = false;
          }
        }

        // Check $push operations
        if (modifier.$push) {
          // For each field in $push
          Object.entries(modifier.$push).forEach(([field, value]) => {
            // Get the array element schema for this field
            const elementSchema = getArrayElementSchema(this.schema, field);

            if (elementSchema === ZOD_UNRESTRICTED_PATH) {
              return;
            } else if (elementSchema) {
              // Handle $each operator
              if (value && typeof value === 'object' && value.$each) {
                for (const item of value.$each) {
                  const result = elementSchema.safeParse(item);
                  if (!result.success) {
                    isValid = false;
                    // Add validation error for each invalid item
                    const err = result.error.issues[0] || {};
                    const errorPath = err.path ? err.path.join('.') : '';
                    const fieldName = errorPath ? `${field}.${errorPath}` : field;

                    // Create a more specific error message for missing fields
                    let errorMessage = '';
                    // Extract received value from error message since Zod v4 doesn't include it as a property
                    let receivedValue = err.received;
                    if (receivedValue === undefined && err.message) {
                      if (err.message.includes('received undefined')) {
                        receivedValue = undefined;
                      } else if (err.message.includes('received number')) {
                        receivedValue = 'number';
                      } else if (err.message.includes('received string')) {
                        receivedValue = 'string';
                      }
                    }

                    if (err.code === 'invalid_type' && receivedValue === undefined) {
                      errorMessage = `Field is required but was not provided in array field '${field}'`;
                    } else {
                      errorMessage = `Invalid value for array field '${field}': ${
                        err.message || 'validation failed'
                      }`;
                    }

                    this.errors.push({
                      name: fieldName,
                      type: err.code || 'invalid_type',
                      value: item,
                      expected: err.expected || 'valid type',
                      message: errorMessage,
                      zodError: err
                    });
                  }
                }
              } else {
                // Handle direct value
                const result = elementSchema.safeParse(value);
                if (!result.success) {
                  isValid = false;
                  // Add validation error for invalid value
                  const err = result.error.issues[0] || {};
                  const errorPath = err.path ? err.path.join('.') : '';
                  const fieldName = errorPath ? `${field}.${errorPath}` : field;

                  // Create a more specific error message for missing fields
                  let errorMessage = '';
                  // Extract received value from error message since Zod v4 doesn't include it as a property
                  let receivedValue = err.received;
                  if (receivedValue === undefined && err.message) {
                    if (err.message.includes('received undefined')) {
                      receivedValue = undefined;
                    } else if (err.message.includes('received number')) {
                      receivedValue = 'number';
                    } else if (err.message.includes('received string')) {
                      receivedValue = 'string';
                    }
                  }

                  if (err.code === 'invalid_type' && receivedValue === undefined) {
                    errorMessage = `Field is required but was not provided in array field '${field}'`;
                  } else {
                    errorMessage = `Invalid value for array field '${field}': ${
                      err.message || 'validation failed'
                    }`;
                  }

                  this.errors.push({
                    name: fieldName,
                    type: 'ValidationError',
                    value: value,
                    expected: err.expected || 'valid type',
                    message: errorMessage
                  });
                }
              }
            } else {
              // If we can't find a schema for this field, check if the field is allowed
              if (!this.schema.allowsKey(field)) {
                this.errors.push({
                  name: field,
                  type: 'invalid_key',
                  value: value,
                  message: `Field '${field}' is not allowed by the schema`
                });
                isValid = false;
              } else {
                // Field is allowed but we couldn't extract array element schema
                // This might indicate an issue with the schema structure
                this.errors.push({
                  name: field,
                  type: 'schema_error',
                  value: value,
                  message: `Cannot validate array field '${field}': unable to extract element schema`
                });
                isValid = false;
              }
            }
          });
        }

        // Check $addToSet operations
        if (modifier.$addToSet) {
          // For each field in $addToSet
          Object.entries(modifier.$addToSet).forEach(([field, value]) => {
            // Get the array element schema for this field
            const elementSchema = getArrayElementSchema(this.schema, field);

            if (elementSchema === ZOD_UNRESTRICTED_PATH) {
              return;
            } else if (elementSchema) {
              // Handle $each operator
              if (value && typeof value === 'object' && value.$each) {
                for (const item of value.$each) {
                  const result = elementSchema.safeParse(item);
                  if (!result.success) {
                    isValid = false;
                    // Add validation error for each invalid item
                    const err = result.error.issues[0] || {};
                    const errorPath = err.path ? err.path.join('.') : '';
                    const fieldName = errorPath ? `${field}.${errorPath}` : field;

                    // Create a more specific error message for missing fields
                    let errorMessage = '';
                    // Extract received value from error message since Zod v4 doesn't include it as a property
                    let receivedValue = err.received;
                    if (receivedValue === undefined && err.message) {
                      if (err.message.includes('received undefined')) {
                        receivedValue = undefined;
                      } else if (err.message.includes('received number')) {
                        receivedValue = 'number';
                      } else if (err.message.includes('received string')) {
                        receivedValue = 'string';
                      }
                    }

                    if (err.code === 'invalid_type' && receivedValue === undefined) {
                      errorMessage = `Field is required but was not provided in array field '${field}'`;
                    } else {
                      errorMessage = `Invalid value for array field '${field}': ${
                        err.message || 'validation failed'
                      }`;
                    }

                    this.errors.push({
                      name: fieldName,
                      type: err.code || 'invalid_type',
                      value: item,
                      expected: err.expected || 'valid type',
                      message: errorMessage,
                      zodError: err
                    });
                  }
                }
              } else {
                // Handle direct value
                const result = elementSchema.safeParse(value);
                if (!result.success) {
                  isValid = false;
                  // Add validation error for invalid value
                  const err = result.error.issues[0] || {};
                  const errorPath = err.path ? err.path.join('.') : '';
                  const fieldName = errorPath ? `${field}.${errorPath}` : field;

                  // Create a more specific error message for missing fields
                  let errorMessage = '';
                  // Extract received value from error message since Zod v4 doesn't include it as a property
                  let receivedValue = err.received;
                  if (receivedValue === undefined && err.message) {
                    if (err.message.includes('received undefined')) {
                      receivedValue = undefined;
                    } else if (err.message.includes('received number')) {
                      receivedValue = 'number';
                    } else if (err.message.includes('received string')) {
                      receivedValue = 'string';
                    }
                  }

                  if (err.code === 'invalid_type' && receivedValue === undefined) {
                    errorMessage = `Field is required but was not provided in array field '${field}'`;
                  } else {
                    errorMessage = `Invalid value for array field '${field}': ${
                      err.message || 'validation failed'
                    }`;
                  }

                  this.errors.push({
                    name: fieldName,
                    type: 'ValidationError',
                    value: value,
                    expected: err.expected || 'valid type',
                    message: errorMessage
                  });
                }
              }
            } else {
              // If we can't find a schema for this field, check if the field is allowed
              if (!this.schema.allowsKey(field)) {
                this.errors.push({
                  name: field,
                  type: 'invalid_key',
                  value: value,
                  message: `Field '${field}' is not allowed by the schema`
                });
                isValid = false;
              } else {
                // Field is allowed but we couldn't extract array element schema
                // This might indicate an issue with the schema structure
                this.errors.push({
                  name: field,
                  type: 'schema_error',
                  value: value,
                  message: `Cannot validate array field '${field}': unable to extract element schema`
                });
                isValid = false;
              }
            }
          });
        }

        return isValid;
      } else {
        // For normal documents (insert)
        const result = this.schema.safeParse(obj);
        if (result.success) {
          return true;
        } else {
          this._processZodErrors(result);
          return false;
        }
      }
    } catch (error) {
      this.errors.push({
        name: 'general',
        type: 'validation_error',
        value: null,
        message: error.message || 'Validation failed'
      });
      return false;
    }
  }

  /**
   * Process Zod validation errors
   * @private
   * @param {Object} result - The Zod validation result
   * @param {Boolean} isArray - Whether the validation is for an array
   * @returns {Boolean} True if valid, false otherwise
   */
  _processZodErrors(result, isArray = false) {
    if (!result.success) {
      // Set the error name to ValidationError for consistent error handling
      if (result.error) {
        result.error.name = 'ValidationError';
      }

      const zodErrors = result.error.issues || [];
      for (const err of zodErrors) {
        const path = isArray
          ? Array.isArray(err.path)
            ? err.path.join('.')
            : err.path
          : err.path.join('.');

        // Extract expected type from Zod error
        let expectedType = 'valid type';
        if (err.code === 'invalid_type') {
          // For type errors, Zod provides the expected type
          expectedType = err.expected;
        } else if (err.code === 'too_small' || err.code === 'too_big') {
          // For string length errors
          expectedType = 'string';
        } else if (err.code === 'invalid_string') {
          // For string validation errors (regex, email, etc.)
          expectedType = `string (${err.validation})`;
        }

        // Extract received value from error message since Zod v4 doesn't include it as a property
        let receivedValue = err.received;
        if (receivedValue === undefined && err.message) {
          if (err.message.includes('received undefined')) {
            receivedValue = undefined;
          } else if (err.message.includes('received number')) {
            receivedValue = 'number';
          } else if (err.message.includes('received string')) {
            receivedValue = 'string';
          } else if (err.message.includes('received object')) {
            receivedValue = 'object';
          } else if (err.message.includes('received array')) {
            receivedValue = 'array';
          } else if (err.message.includes('received boolean')) {
            receivedValue = 'boolean';
          }
        }

        this.errors.push({
          name: path || 'general',
          type: err.code, // Use the original Zod error code instead of hardcoding 'ValidationError'
          value: receivedValue,
          expected: expectedType,
          message: err.message,
          zodError: err
        });
      }
      return false;
    }
    return true;
  }

  /**
   * Get all validation errors
   * @returns {Array} Array of validation errors
   */
  validationErrors() {
    return this.errors;
  }

  /**
   * Get all invalid keys (alias for validationErrors)
   * @returns {Array} Array of validation errors
   */
  invalidKeys() {
    return this.errors;
  }

  /**
   * Reset validation state
   */
  resetValidation() {
    this.errors = [];
  }

  /**
   * Check if the validation is valid
   * @returns {Boolean} True if valid, false otherwise
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Check if a specific key is invalid
   * @param {String} key - The key to check
   * @returns {Boolean} True if the key is invalid, false otherwise
   */
  keyIsInvalid(key) {
    return this.errors.some((err) => err.name === key);
  }

  /**
   * Get the error message for a specific key
   * @param {String} key - The key to get the error message for
   * @returns {String} The error message or empty string if no error
   */
  keyErrorMessage(key) {
    const error = this.errors.find((err) => err.name === key);
    return error ? error.message : '';
  }
}

/**
 * Creates a validation context for Zod schemas
 * @param {Object} schema - The Zod schema
 * @param {String} name - Optional name for the context
 * @returns {Object} A validation context compatible with Collection2
 */
const createZodValidationContext = (schema, name = 'default') => {
  return new ZodValidationContext(schema, name);
};

/**
 * Helper utilities for reading enough Zod internals to validate Mongo modifier
 * paths without importing a specific Zod version.
 */
const getZodDef = (schema) => schema?._zod?.def || schema?._def || schema?.def || {};

const getZodType = (schema) => {
  const def = getZodDef(schema);
  return typeof def.type === 'string' ? def.type : def.typeName;
};

const isZodType = (schema, ...types) => {
  const type = getZodType(schema);
  return types.some((t) => type === t || type === `Zod${t[0].toUpperCase()}${t.slice(1)}`);
};

const getZodShape = (schema) => {
  const shape = getZodDef(schema).shape;
  return typeof shape === 'function' ? shape() : shape;
};

const getZodArrayElement = (schema) => {
  const def = getZodDef(schema);
  return def.element || (typeof def.type !== 'string' ? def.type : null) || def.innerType;
};

const getZodRecordKey = (schema) => getZodDef(schema).keyType;
const getZodRecordValue = (schema) => getZodDef(schema).valueType;
const isRequiredZodRecordKey = (schema, key) => {
  const values = schema?._zod?.values;
  return values ? Array.from(values).some((value) => String(value) === key) : false;
};
const parseZodRecordKey = (schema, key) => {
  const stringResult = schema.safeParse(key);
  if (stringResult.success) return stringResult;

  const numericKey = Number(key);
  return String(numericKey) === key ? schema.safeParse(numericKey) : stringResult;
};

const ZOD_UNRESTRICTED_PATH = Symbol('zodUnrestrictedPath');

const unwrapZodSchema = (schema) => {
  let current = schema;
  let guard = 0;

  while (current && guard < 10) {
    const def = getZodDef(current);

    if (
      isZodType(
        current,
        'optional',
        'nullable',
        'default',
        'prefault',
        'nonoptional',
        'catch',
        'readonly',
        'branded'
      )
    ) {
      current = def.innerType || def.type;
    } else if (isZodType(current, 'pipe', 'pipeline')) {
      current = isZodType(def.in, 'transform') ? def.out || def.in : def.in || def.out;
    } else if (isZodType(current, 'effects')) {
      current = def.schema;
    } else if (isZodType(current, 'lazy')) {
      current = def.getter?.();
    } else {
      return current;
    }

    guard++;
  }

  return current;
};

const isArrayPathPart = (part) =>
  /^\d+$/.test(part) || part === '$' || part === '$[]' || /^\$\[.+\]$/.test(part);

const isUnrestrictedZodSchema = (schema) => {
  const unwrapped = unwrapZodSchema(schema);
  return isZodType(unwrapped, 'any', 'unknown');
};

const getZodUnknownKeySchema = (schema) => {
  const def = getZodDef(schema);
  const catchall = def.catchall;

  if (catchall && !isZodType(catchall, 'never')) {
    return catchall;
  }

  if (def.unknownKeys === 'passthrough' || def.unknownKeys === 'ignore') {
    return ZOD_UNRESTRICTED_PATH;
  }

  return null;
};

const resolveZodSchemaPath = (schema, fieldPath) => {
  const parts = fieldPath.split('.');
  let currentSchema = schema;
  let isDynamic = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentSchema = unwrapZodSchema(currentSchema);

    if (isUnrestrictedZodSchema(currentSchema)) {
      return { schema: currentSchema, isDynamic: true, isUnrestricted: true };
    }

    if (isZodType(currentSchema, 'array')) {
      currentSchema = getZodArrayElement(currentSchema);
      if (isArrayPathPart(part)) {
        isDynamic = false;
        continue;
      }
    }

    currentSchema = unwrapZodSchema(currentSchema);

    if (isZodType(currentSchema, 'record')) {
      const keySchema = getZodRecordKey(currentSchema);
      const valueSchema = getZodRecordValue(currentSchema);
      const keyResult = keySchema?.safeParse ? parseZodRecordKey(keySchema, part) : null;

      if (!valueSchema || (keyResult && !keyResult.success)) {
        return null;
      }

      currentSchema = valueSchema;
      isDynamic = !isRequiredZodRecordKey(keySchema, part);
      continue;
    }

    if (!isZodType(currentSchema, 'object')) {
      return null;
    }

    const shape = getZodShape(currentSchema);
    if (shape && Object.prototype.hasOwnProperty.call(shape, part)) {
      currentSchema = shape[part];
      isDynamic = false;
      continue;
    }

    const unknownKeySchema = getZodUnknownKeySchema(currentSchema);
    if (!unknownKeySchema) {
      return null;
    }

    if (unknownKeySchema === ZOD_UNRESTRICTED_PATH) {
      return { schema: null, isDynamic: true, isUnrestricted: true };
    }

    currentSchema = unknownKeySchema;
    isDynamic = true;
  }

  return {
    schema: currentSchema,
    isDynamic,
    isUnrestricted: false,
    acceptsAnyValue: isUnrestrictedZodSchema(currentSchema)
  };
};

const isOptionalZodSchema = (schema) => {
  if (!schema) return false;
  if (typeof schema.isOptional === 'function' && schema.isOptional()) return true;

  return isZodType(schema, 'optional', 'default', 'catch');
};

const isNumberZodSchema = (schema) => {
  const unwrapped = unwrapZodSchema(schema);
  return isZodType(unwrapped, 'number');
};

const pushZodIssueErrors = (errors, fieldPath, value, result) => {
  const zodErrors = result.error?.issues || [];

  for (const err of zodErrors) {
    const nestedPath = Array.isArray(err.path) && err.path.length ? err.path.join('.') : '';
    const name = nestedPath ? `${fieldPath}.${nestedPath}` : fieldPath;
    errors.push({
      name,
      type: err.code || 'invalid_type',
      value,
      expected: err.expected || 'valid type',
      message: err.message,
      zodError: err
    });
  }
};

const pushInvalidKeyError = (errors, fieldPath, value) => {
  errors.push({
    name: fieldPath,
    type: 'invalid_key',
    value,
    message: `Field '${fieldPath}' is not allowed by the schema`
  });
};

const validateSetModifierFields = (schema, fields, errors) => {
  let isValid = true;

  Object.entries(fields).forEach(([fieldPath, value]) => {
    const resolution = resolveZodSchemaPath(schema, fieldPath);

    if (!resolution) {
      pushInvalidKeyError(errors, fieldPath, value);
      isValid = false;
      return;
    }

    if (resolution.isUnrestricted) return;

    const result = resolution.schema.safeParse(value);
    if (!result.success) {
      pushZodIssueErrors(errors, fieldPath, value, result);
      isValid = false;
    }
  });

  return isValid;
};

const validateUnsetModifierFields = (schema, fields, errors) => {
  let isValid = true;

  Object.entries(fields).forEach(([fieldPath, value]) => {
    const resolution = resolveZodSchemaPath(schema, fieldPath);

    if (!resolution) {
      pushInvalidKeyError(errors, fieldPath, value);
      isValid = false;
      return;
    }

    if (
      !resolution.isUnrestricted &&
      !resolution.isDynamic &&
      !isOptionalZodSchema(resolution.schema)
    ) {
      errors.push({
        name: fieldPath,
        type: 'required',
        value: undefined,
        expected: 'defined',
        message: `Field '${fieldPath}' is required and cannot be unset`
      });
      isValid = false;
    }
  });

  return isValid;
};

const validateIncModifierFields = (schema, fields, errors) => {
  let isValid = true;

  Object.entries(fields).forEach(([fieldPath, value]) => {
    const resolution = resolveZodSchemaPath(schema, fieldPath);

    if (!resolution) {
      pushInvalidKeyError(errors, fieldPath, value);
      isValid = false;
      return;
    }

    if (
      typeof value !== 'number' ||
      (!resolution.isUnrestricted &&
        !resolution.acceptsAnyValue &&
        !isNumberZodSchema(resolution.schema))
    ) {
      errors.push({
        name: fieldPath,
        type: 'invalid_type',
        value,
        expected: 'number',
        message: `Field '${fieldPath}' must be a number for $inc`
      });
      isValid = false;
    }
  });

  return isValid;
};

const getArrayElementSchema = (schema, fieldPath) => {
  const resolution = resolveZodSchemaPath(schema, fieldPath);
  if (!resolution) return null;
  if (resolution.isUnrestricted || resolution.acceptsAnyValue) {
    return ZOD_UNRESTRICTED_PATH;
  }

  const arraySchema = unwrapZodSchema(resolution.schema);
  return isZodType(arraySchema, 'array') ? getZodArrayElement(arraySchema) : null;
};

/**
 * Enhances a Zod schema with Collection2 compatibility methods
 * @param {Object} schema - The Zod schema to enhance
 * @returns {Object} The enhanced schema
 */
const enhanceZodSchema = (schema) => {
  // Store validation contexts by name
  const validationContexts = {};

  // Add namedContext method if it doesn't exist
  if (typeof schema.namedContext !== 'function') {
    schema.namedContext = function (name = 'default') {
      // Reuse existing context if available
      if (validationContexts[name]) {
        return validationContexts[name];
      }

      // Create and store a new context
      const context = createZodValidationContext(schema, name);
      validationContexts[name] = context;
      return context;
    };
  }

  // Add allowsKey method to the schema
  if (typeof schema.allowsKey !== 'function') {
    schema.allowsKey = (key) => {
      if (key === '_id') return true; // Always allow _id
      return !!resolveZodSchemaPath(schema, key);
    };
  }

  // Add clean method for Zod schemas
  if (typeof schema.clean !== 'function') {
    schema.clean = (obj, options = {}) => {
      const { mutate = false, isModifier = false } = options;

      // If not mutating, clone the object first
      let cleanObj = mutate ? obj : JSON.parse(JSON.stringify(obj));

      if (isModifier) {
        // For update operations with modifiers like $set, $unset, etc.
        if (cleanObj.$set) {
          // Process each field in $set
          Object.keys(cleanObj.$set).forEach((key) => {
            const value = cleanObj.$set[key];

            // Remove empty strings if option is enabled
            if (options.removeEmptyStrings && value === '') {
              delete cleanObj.$set[key];
            }

            // Auto-convert strings to numbers/booleans/etc if option is enabled
            if (options.autoConvert) {
              // Would need more complex logic to properly convert types
              // For now, we just do a basic conversion for common types
              if (typeof value === 'string') {
                if (value === 'true') cleanObj.$set[key] = true;
                else if (value === 'false') cleanObj.$set[key] = false;
                else if (!isNaN(value) && value.trim() !== '') cleanObj.$set[key] = Number(value);
              }
            }

            // Trim strings if option is enabled
            if (options.trimStrings && typeof value === 'string') {
              cleanObj.$set[key] = value.trim();
            }
          });

          // Remove $set if it's empty after processing
          if (Object.keys(cleanObj.$set).length === 0) {
            delete cleanObj.$set;
          }
        }

        // Process other modifiers if needed
      } else {
        // For insert/update operations without modifiers

        // Process each field in the document
        Object.keys(cleanObj).forEach((key) => {
          const value = cleanObj[key];

          // Remove empty strings if option is enabled
          if (options.removeEmptyStrings && value === '') {
            delete cleanObj[key];
          }

          // Auto-convert strings to numbers/booleans/etc if option is enabled
          if (options.autoConvert) {
            // Would need more complex logic to properly convert types
            // For now, we just do a basic conversion for common types
            if (typeof value === 'string') {
              if (value === 'true') cleanObj[key] = true;
              else if (value === 'false') cleanObj[key] = false;
              else if (!isNaN(value) && value.trim() !== '') cleanObj[key] = Number(value);
            }
          }

          // Trim strings if option is enabled
          if (options.trimStrings && typeof value === 'string') {
            cleanObj[key] = value.trim();
          }
        });
      }

      return cleanObj;
    };

    // Set default clean options
    schema._cleanOptions = {
      filter: true,
      autoConvert: true,
      removeEmptyStrings: true,
      trimStrings: true
    };
  }

  return schema;
};
