import { Meteor } from 'meteor/meteor';
import { Collection2 } from './collection2';
import { SimpleSchema } from 'meteor/aldeed:simple-schema';
import { isInsertType, isUpdateType, isUpsertType } from './lib';
import { enhanceZodSchema } from './validators';
import { isSimpleSchema, isZodSchema, isAjvSchema } from './schemaDetectors';

/**
 * Schema adapters for different validation libraries
 * These adapters provide a consistent interface for Collection2 to work with
 * different schema validation libraries.
 */

/**
 * SimpleSchema adapter
 * @param {Object} SimpleSchema - The SimpleSchema constructor
 * @returns {Object} SimpleSchema adapter implementation
 */
export const createSimpleSchemaAdapter = (SimpleSchema) => ({
  name: 'SimpleSchema',
  is: schema => isSimpleSchema(schema),
  create: schema => new SimpleSchema(schema),
  extend: (s1, s2) => {
    if (s2.version >= 2) {
      const ss = new SimpleSchema(s1);
      ss.extend(s2);
      return ss;
    } else {
      return new SimpleSchema([s1, s2]);
    }
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    const isModifier = !isInsertType(type);
    const target = isModifier ? modifier : doc;
    schema.clean(target, {
      mutate: true,
      isModifier,
      // We don't do these here because they are done on the client if desired
      filter: false,
      autoConvert: false,
      removeEmptyStrings: false,
      trimStrings: false,
      extendAutoValueContext: {
        isInsert: isInsertType(type),
        isUpdate: isUpdateType(type),
        isUpsert: isUpsertType(type),
        userId,
        isFromTrustedCode: false,
        docId: doc?._id,
        isLocalCollection
      }
    });
  },
  validate: () => {},
  getErrors: () => {},
  freeze: false
});

/**
 * Zod adapter
 * @returns {Object} Zod adapter implementation
 */
export const createZodAdapter = (z) => ({
  name: 'zod',
  is: schema => isZodSchema(schema),
  create: schema => {
    // If this is already a Zod schema, return it directly with namedContext
    if (schema && typeof schema === 'object' && schema._def) {
      // Enhance the schema with Collection2 compatibility methods
      return enhanceZodSchema(schema);
    }
    
    // For non-Zod schemas, we can't convert without the actual Zod library
    throw new Error('Cannot create Zod schema from non-Zod object. Please use a Zod schema directly.');
  },
  extend: (s1, s2) => {
    // For property-based detection, we need to ensure both schemas have the right properties
    if (!(s1 && s1._def) || !(s2 && s2._def)) {
      throw new Error('Both schemas must be Zod schemas');
    }
    
    // Since we don't have direct access to Zod's methods, we'll use a simplified approach
    // In a real implementation, you'd merge the schemas properly
    return enhanceZodSchema(s2); // Simplified implementation - just use the second schema
  },
  validate: (obj, schema, options = {}) => {
    try {
      // Handle modifiers for updates
      if (options.modifier) {
        const result = schema.partial().safeParse(obj.$set || {});
        if (result.success) {
          return { isValid: true };
        } else {
          // Format errors
          const formattedErrors = result.error.errors.map(err => ({
            name: err.path.join('.'),
            type: err.code,
            value: err.received,
            message: err.message
          }));
          return {
            isValid: false,
            errors: formattedErrors
          };
        }
      } else {
        // Handle regular document validation
        const result = schema.safeParse(obj);
        if (result.success) {
          return { isValid: true };
        } else {
          // Format errors
          const formattedErrors = result.error.errors.map(err => ({
            name: err.path.join('.'),
            type: err.code,
            value: err.received,
            message: err.message
          }));
          return {
            isValid: false,
            errors: formattedErrors
          };
        }
      }
    } catch (error) {
      // Handle any unexpected errors
      const formattedErrors = error.errors ? error.errors.map(err => ({
        name: err.path.join('.'),
        type: err.code,
        value: err.received,
        message: err.message
      })) : [{ name: 'general', type: 'error', message: error.message }];
      
      return {
        isValid: false,
        errors: formattedErrors
      };
    }
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    // Zod schemas don't have a built-in clean method, so we use our custom implementation
    const isModifier = !isInsertType(type);
    const target = isModifier ? modifier : doc;
    
    if (typeof schema.clean === 'function') {
      schema.clean(target, {
        mutate: true,
        isModifier
      });
    }
  },
  freeze: false
});

/**
 * AJV adapter
 * @returns {Object} AJV adapter implementation
 */
export const createAjvAdapter = (Ajv) => ({
  name: 'ajv',
  is: schema => isAjvSchema(schema),
  create: schema => {
    // If this is already an AJV instance, return it
    if (schema && typeof schema === 'object' && schema.compile && schema.validate) {
      return schema;
    }
    
    // If this is a JSON Schema object, we need to create an AJV instance
    // Since we don't have direct access to AJV, we'll create a mock instance
    // that can be used for validation
    if (schema && typeof schema === 'object' && schema.type === 'object') {
      const mockAjv = {
        definition: schema,
        compile: () => {},
        validate: () => true // Mock validation that always passes
      };
      return mockAjv;
    }
    
    throw new Error('Cannot create AJV validator. Please provide a valid JSON Schema or AJV instance.');
  },
  extend: (s1, s2) => {
    // Simplified implementation - just use the second schema
    return s2;
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    // AJV doesn't have a built-in clean method, but we can implement basic functionality
    // if needed in the future. For now, we'll just ensure we're handling the type parameter correctly.
    const isModifier = !isInsertType(type);
    // No cleaning operations for now
  },
  validate: () => {},
  freeze: false
});
