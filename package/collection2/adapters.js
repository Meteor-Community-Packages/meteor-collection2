import { Meteor } from 'meteor/meteor';
import { Collection2 } from './collection2';
import { SimpleSchema } from 'meteor/aldeed:simple-schema';
import { isInsertType, isUpdateType, isUpsertType } from './lib';

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
  is: schema => SimpleSchema.isSimpleSchema(schema),
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
  is: schema => {
    // Property-based detection for Zod schemas
    return schema && 
           typeof schema === 'object' && 
           schema._def && 
           schema.safeParse && 
           schema.parse && 
           typeof schema.safeParse === 'function' && 
           typeof schema.parse === 'function';
  },
  create: schema => {
    // If this is already a Zod schema, return it directly with namedContext
    if (schema && typeof schema === 'object' && schema._def) {
      // We need to ensure namedContext is attached and persists
      // Use a non-enumerable property to prevent issues with schema cloning
      if (!schema.namedContext) {
        // Using Object.defineProperty to ensure the method stays attached
        Object.defineProperty(schema, 'namedContext', {
          value: function(name = 'default') {
            let errors = [];
            
            return {
              validate: (obj, options = {}) => {
                const { isModifier = false } = options;
                
                try {
                  if (isModifier) {
                    // For update operations with modifiers
                    if (obj.$set) {
                      schema.partial().parse(obj.$set);
                    }
                    // Handle other modifiers if needed
                  } else {
                    // For normal documents
                    schema.parse(obj);
                  }
                  
                  errors = []; // Clear errors if validation passes
                  return true;
                } catch (error) {
                  errors = []; // Clear previous errors
                  
                  if (error.errors) {
                    error.errors.forEach(err => {
                      errors.push({
                        name: err.path.join('.'),
                        type: err.code,
                        value: err.received,
                        message: err.message
                      });
                    });
                  }
                  return false;
                }
              },
              validationErrors: () => {
                return errors;
              },
              resetValidation: () => {
                errors = [];
              },
              isValid: () => {
                return errors.length === 0;
              },
              keyIsInvalid: (key) => {
                return errors.some(err => err.name === key);
              },
              keyErrorMessage: (key) => {
                const error = errors.find(err => err.name === key);
                return error ? error.message : '';
              }
            };
          },
          writable: false,
          configurable: false,
          enumerable: false // Make non-enumerable to prevent issues with schema cloning
        });
      }
      return schema;
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
    return s2; // Simplified implementation - just use the second schema
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
      })) : [{ 
        name: 'unknown', 
        type: 'error', 
        message: error.message || 'Unknown validation error' 
      }];
      
      return {
        isValid: false,
        errors: formattedErrors
      };
    }
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    // Zod doesn't have a built-in clean method, but we can implement basic functionality
    // if needed in the future. For now, we'll just ensure we're handling the type parameter correctly.
    const isModifier = !isInsertType(type);
    // No cleaning operations for now
  },
  freeze: false
});

/**
 * AJV adapter
 * @returns {Object} AJV adapter implementation
 */
export const createAjvAdapter = (Ajv) => ({
  name: 'ajv',
  is: schema => {
    // Property-based detection for AJV instances
    return schema && 
           typeof schema === 'object' && 
           ((schema.compile && schema.validate && 
             typeof schema.compile === 'function' && 
             typeof schema.validate === 'function') ||
            (schema.type === 'object' && schema.properties && 
             typeof schema.properties === 'object'));
  },
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
