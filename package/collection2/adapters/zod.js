import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType } from '../lib';
import { isZodSchema } from '../schemaDetectors';

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
  getErrorObject: (context, appendToMessage = '', code) => {
    const invalidKeys = context.validationErrors();
    
    if (!invalidKeys || invalidKeys.length === 0) {
      return new Error('Unknown validation error');
    }
    
    const firstErrorKey = invalidKeys[0].name;
    const firstErrorMessage = invalidKeys[0].message;
    let message = firstErrorMessage;
    
    // Special handling for required/missing fields (invalid_type with undefined value)
    if (invalidKeys[0].type === 'invalid_type' && invalidKeys[0].value === undefined) {
      // Get the expected type directly from the error
      const expectedType = invalidKeys[0].expected || 'string';
      message = `Field '${firstErrorKey}' is required but was not provided. Please provide a value of type ${expectedType}.`;
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
      message = `${firstErrorMessage} for field '${firstErrorKey}' (${invalidKeys[0].type}: received ${JSON.stringify(invalidKeys[0].value)})`;
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
  freeze: false,
  
  // Add validation context handling directly to the adapter
  getValidationContext: (schema, validationContext) => {
    if (validationContext && typeof validationContext === 'object') {
      return validationContext;
    }
    
    // Ensure the schema is enhanced with Collection2 compatibility methods
    const enhancedSchema = enhanceZodSchema(schema);
    return enhancedSchema.namedContext(validationContext);
  }
});

/**
 * Creates a validation context for Zod schemas
 * @param {Object} schema - The Zod schema
 * @param {String} name - Optional name for the context
 * @returns {Object} A validation context compatible with Collection2
 */
const createZodValidationContext = (schema, name = 'default') => {
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
const enhanceZodSchema = (schema) => {
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
