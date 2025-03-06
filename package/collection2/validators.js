import { Meteor } from 'meteor/meteor';
import { isZodSchema, isAjvSchema } from './schemaDetectors';

/**
 * Schema validators for different validation libraries
 * These validators provide consistent validation context handling
 * for different schema types
 */

/**
 * Creates a validation context for Zod schemas
 * @param {Object} schema - The Zod schema
 * @param {String} name - Optional name for the context
 * @returns {Object} A validation context compatible with Collection2
 */
export const createZodValidationContext = (schema, name = 'default') => {
  let errors = [];
  
  return {
    validate: (obj, options = {}) => {
      errors = []; // Clear previous errors
      
      try {
        // For modifiers, we need special handling
        if (options.modifier) {
          // For now, we'll just validate that the fields being modified are valid
          // In a real implementation, we would validate each modifier operation
          const modifier = obj;
          let isValid = true;
          
          // Check $set operations
          if (modifier.$set) {
            const result = schema.partial().safeParse(modifier.$set);
            if (!result.success) {
              isValid = false;
              // Extract errors from Zod validation result
              const zodErrors = result.error.errors || [];
              for (const err of zodErrors) {
                const path = err.path.join('.');
                
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
                
                errors.push({
                  name: path,
                  type: err.code,
                  value: err.received,
                  expected: expectedType,
                  message: err.message,
                  zodError: err
                });
              }
            }
          }
          
          // Check $setOnInsert operations
          if (modifier.$setOnInsert) {
            const result = schema.partial().safeParse(modifier.$setOnInsert);
            if (!result.success) {
              isValid = false;
              // Extract errors from Zod validation result
              const zodErrors = result.error.errors || [];
              for (const err of zodErrors) {
                const path = err.path.join('.');
                
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
                
                errors.push({
                  name: path,
                  type: err.code,
                  value: err.received,
                  expected: expectedType,
                  message: err.message,
                  zodError: err
                });
              }
            }
          }
          
          return isValid;
        } else {
          // For normal documents (insert)
          const result = schema.safeParse(obj);
          if (result.success) {
            return true;
          } else {
            // Extract errors from Zod validation result
            const zodErrors = result.error.errors || [];
            for (const err of zodErrors) {
              const path = Array.isArray(err.path) ? err.path.join('.') : err.path;
              
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
              
              errors.push({
                name: path || 'general',
                type: err.code || 'invalid',
                value: err.received,
                expected: expectedType,
                message: err.message,
                zodError: err
              });
            }
            return false;
          }
        }
      } catch (error) {
        errors.push({
          name: 'general',
          type: 'error',
          value: null,
          message: error.message || 'Validation failed'
        });
        return false;
      }
    },
    validationErrors: () => {
      return errors;
    },
    invalidKeys: () => {
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
};

/**
 * Enhances a Zod schema with Collection2 compatibility methods
 * @param {Object} schema - The Zod schema to enhance
 * @returns {Object} The enhanced schema
 */
export const enhanceZodSchema = (schema) => {
  // Store validation contexts by name
  const validationContexts = {};
  
  // Add namedContext method if it doesn't exist
  if (typeof schema.namedContext !== 'function') {
    schema.namedContext = function(name = 'default') {
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
      // For Zod schemas, check if the key exists in the shape
      if (key === '_id') return true; // Always allow _id
      
      // Try to get the shape from the Zod schema
      const shape = schema._def?.shape?.();
      if (shape) {
        return key in shape;
      }
      
      // If we can't determine, default to allowing the key
      return true;
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
          Object.keys(cleanObj.$set).forEach(key => {
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
        Object.keys(cleanObj).forEach(key => {
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

/**
 * Creates a validation context for AJV schemas
 * @param {Object} schema - The AJV schema
 * @param {String} name - Optional name for the context
 * @returns {Object} A validation context compatible with Collection2
 */
export const createAjvValidationContext = (schema, name = 'default') => {
  let errors = [];
  
  return {
    validate: (obj, options = {}) => {
      errors = []; // Clear previous errors
      
      try {
        // Use the schema definition for validation
        const definition = schema.definition || schema;
        
        // For modifiers, we need special handling
        if (options.modifier) {
          // For now, just allow modifiers without validation
          // In a real implementation, we would validate each modifier operation
          return true;
        } else {
          // For normal documents (insert)
          // In a real implementation, we would use AJV's validate method
          // For now, we'll just do a simple check for required fields
          if (definition.required && Array.isArray(definition.required)) {
            for (const field of definition.required) {
              if (obj[field] === undefined) {
                errors.push({
                  name: field,
                  type: 'required',
                  value: undefined,
                  message: `${field} is required`
                });
              }
            }
          }
          
          // Check property types
          if (definition.properties && typeof definition.properties === 'object') {
            for (const [field, propDef] of Object.entries(definition.properties)) {
              if (obj[field] !== undefined) {
                // Type validation
                if (propDef.type === 'string' && typeof obj[field] !== 'string') {
                  errors.push({
                    name: field,
                    type: 'type',
                    value: obj[field],
                    message: `${field} must be a string`
                  });
                } else if (propDef.type === 'number' && typeof obj[field] !== 'number') {
                  errors.push({
                    name: field,
                    type: 'type',
                    value: obj[field],
                    message: `${field} must be a number`
                  });
                } else if (propDef.type === 'boolean' && typeof obj[field] !== 'boolean') {
                  errors.push({
                    name: field,
                    type: 'type',
                    value: obj[field],
                    message: `${field} must be a boolean`
                  });
                }
              }
            }
          }
          
          return errors.length === 0;
        }
      } catch (error) {
        errors.push({
          name: 'general',
          type: 'error',
          value: null,
          message: error.message || 'Validation failed'
        });
        return false;
      }
    },
    validationErrors: () => {
      return errors;
    },
    invalidKeys: () => {
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
};

/**
 * Enhances an AJV schema with Collection2 compatibility methods
 * @param {Object} schema - The AJV schema to enhance
 * @returns {Object} The enhanced schema
 */
export const enhanceAjvSchema = (schema) => {
  // Store validation contexts by name
  const validationContexts = {};
  
  // Add namedContext method if it doesn't exist
  if (typeof schema.namedContext !== 'function') {
    schema.namedContext = function(name = 'default') {
      // Reuse existing context if available
      if (validationContexts[name]) {
        return validationContexts[name];
      }
      
      // Create and store a new context
      const context = createAjvValidationContext(schema, name);
      validationContexts[name] = context;
      return context;
    };
  }
  
  // Add allowsKey method to the schema
  if (typeof schema.allowsKey !== 'function') {
    schema.allowsKey = (key) => {
      // For AJV schemas, check if the key exists in the properties
      if (key === '_id') return true; // Always allow _id
      
      // Try to get the properties from the AJV schema
      const definition = schema.definition || schema;
      const properties = definition.properties;
      
      if (properties) {
        return key in properties;
      }
      
      // If we can't determine, default to allowing the key
      return true;
    };
  }
  
  // Add clean method for AJV schemas
  if (typeof schema.clean !== 'function') {
    schema.clean = (obj, options = {}) => {
      const { mutate = false, isModifier = false } = options;
      
      // If not mutating, clone the object first
      let cleanObj = mutate ? obj : JSON.parse(JSON.stringify(obj));
      
      // For now, we'll just implement basic cleaning operations
      // In a real implementation, we would do more sophisticated cleaning
      
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

/**
 * Creates or gets a validation context for a schema
 * @param {Object} schema - The schema
 * @param {String|Object} validationContext - Optional validation context name or object
 * @returns {Object} A validation context
 */
export const getValidationContext = (schema, validationContext) => {
  if (validationContext && typeof validationContext === 'object') {
    return validationContext;
  }
  
  // Special handling for Zod schema
  if (isZodSchema(schema)) {
    enhanceZodSchema(schema);
  }
  
  // Special handling for AJV schema
  if (isAjvSchema(schema)) {
    enhanceAjvSchema(schema);
  }
  
  return schema.namedContext(validationContext);
};
