import { Meteor } from 'meteor/meteor';

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
        if (options.modifier) {
          // For update operations with modifiers
          if (obj.$set) {
            // Create a partial schema for update validation
            const partialSchema = schema.partial();
            try {
              const result = partialSchema.safeParse(obj.$set);
              if (!result.success) {
                processZodError(result.error);
                return false;
              }
            } catch (error) {
              processZodError(error);
              return false;
            }
          }
          
          // Handle other modifiers if needed
          if (obj.$push) {
            // We'll just allow push operations for now
          }
          
          if (obj.$unset) {
            // We'll just allow unset operations for now
          }
          
          // For upserts, validate the combined document if provided
          if (options.upsert && options.extendedCustomContext && options.extendedCustomContext.upsertDocument) {
            try {
              const result = schema.safeParse(options.extendedCustomContext.upsertDocument);
              if (!result.success) {
                processZodError(result.error);
                return false;
              }
            } catch (error) {
              processZodError(error);
              return false;
            }
          }
          
          // If we reach this point and have no errors, validation passed
          return errors.length === 0;
        } else {
          // For normal documents (insert)
          try {
            const result = schema.safeParse(obj);
            if (!result.success) {
              processZodError(result.error);
              return false;
            }
            return true;
          } catch (error) {
            processZodError(error);
            return false;
          }
        }
      } catch (error) {
        processZodError(error);
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
  
  // Helper function to process Zod validation errors
  function processZodError(error) {
    // Check if it's a Zod error with issues array
    if (error && error.issues && Array.isArray(error.issues)) {
      error.issues.forEach(issue => {
        // Convert the path array to a string path
        const path = issue.path.length > 0 ? issue.path.join('.') : 'general';
        
        errors.push({
          name: path,
          type: issue.code,
          value: issue.received,
          message: issue.message
        });
      });
    } else if (error && error.errors && Array.isArray(error.errors)) {
      // Handle array of errors
      error.errors.forEach(err => {
        const path = Array.isArray(err.path) && err.path.length > 0 
          ? err.path.join('.') 
          : (typeof err.path === 'string' ? err.path : 'general');
        
        errors.push({
          name: path,
          type: err.code || 'invalid',
          value: err.received,
          message: err.message || 'Invalid value'
        });
      });
    } else if (error && error.message) {
      // Add a generic error if we don't have specific path errors
      errors.push({
        name: 'general',
        type: 'error',
        value: null,
        message: error.message
      });
    } else if (error && error.toString) {
      // Last resort - add a generic error
      errors.push({
        name: 'general',
        type: 'error',
        value: null,
        message: error.toString()
      });
    } else {
      // Fallback error
      errors.push({
        name: 'general',
        type: 'error',
        value: null,
        message: 'Unknown validation error'
      });
    }
  }
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
 * Determines if a schema is a Zod schema
 * @param {Object} schema - The schema to check
 * @returns {Boolean} True if the schema is a Zod schema
 */
export const isZodSchema = (schema) => {
  return schema && 
         typeof schema === 'object' && 
         (
           (schema._def && 
            (schema._def.typeName === 'ZodObject' || 
             typeof schema._def.typeName === 'string')) || 
           (typeof schema.safeParse === 'function' && 
            typeof schema.parse === 'function')
         );
};

/**
 * Creates or gets a validation context for a schema
 * @param {Object} schema - The schema
 * @param {String|Object} validationContext - Optional validation context name or object
 * @returns {Object} A validation context
 */
export const getValidationContext = (schema, validationContext) => {
  if (validationContext) {
    if (typeof validationContext === 'string') {
      return schema.namedContext(validationContext);
    }
    return validationContext;
  }
  
  // Special handling for Zod schema
  if (isZodSchema(schema)) {
    enhanceZodSchema(schema);
  }
  
  return schema.namedContext();
};
