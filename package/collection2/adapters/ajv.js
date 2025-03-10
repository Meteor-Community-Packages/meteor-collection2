import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType } from '../lib';
import { isAjvSchema } from '../schemaDetectors';

/**
 * AJV adapter
 * @returns {Object} AJV adapter implementation
 */
export const createAjvAdapter = () => ({
  name: 'ajv',
  is: schema => isAjvSchema(schema),
  create: schema => {
    // If this is already an AJV schema, return it directly
    if (schema && typeof schema === 'object' && (schema.definition || schema.$id)) {
      // Enhance the schema with Collection2 compatibility methods
      return enhanceAjvSchema(schema);
    }
    
    // For non-AJV schemas, we can't convert without the actual AJV library
    throw new Error('Cannot create AJV schema from non-AJV object. Please use an AJV schema directly.');
  },
  extend: (s1, s2) => {
    // For property-based detection, we need to ensure both schemas have the right properties
    if (!(s1 && (s1.definition || s1.$id)) || !(s2 && (s2.definition || s2.$id))) {
      throw new Error('Both schemas must be AJV schemas');
    }
    
    // Since we don't have direct access to AJV's methods, we'll use a simplified approach
    // In a real implementation, you'd merge the schemas properly
    return enhanceAjvSchema(s2); // Simplified implementation - just use the second schema
  },
  validate: (obj, schema, options = {}) => {
    try {
      // Handle modifiers for updates
      if (options.modifier) {
        // For now, just allow modifiers without validation
        // In a real implementation, we would validate each modifier operation
        return { isValid: true };
      } else {
        // For normal documents (insert)
        // In a real implementation, we would use AJV's validate method
        // For now, we'll just do a simple check for required fields
        const definition = schema.definition || schema;
        let isValid = true;
        const errors = [];
        
        if (definition.required && Array.isArray(definition.required)) {
          for (const field of definition.required) {
            if (obj[field] === undefined) {
              isValid = false;
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
                isValid = false;
                errors.push({
                  name: field,
                  type: 'type',
                  value: obj[field],
                  message: `${field} must be a string`
                });
              } else if (propDef.type === 'number' && typeof obj[field] !== 'number') {
                isValid = false;
                errors.push({
                  name: field,
                  type: 'type',
                  value: obj[field],
                  message: `${field} must be a number`
                });
              } else if (propDef.type === 'boolean' && typeof obj[field] !== 'boolean') {
                isValid = false;
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
        
        return {
          isValid,
          errors
        };
      }
    } catch (error) {
      // Handle any unexpected errors
      return {
        isValid: false,
        errors: [{ name: 'general', type: 'error', message: error.message }]
      };
    }
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    // AJV schemas don't have a built-in clean method, so we use our custom implementation
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
    
    // Fallback to standard message format
    if (firstErrorKey.indexOf('.') === -1) {
      message = `${firstErrorMessage}`;
    } else {
      message = `${firstErrorMessage} (${firstErrorKey})`;
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
    const enhancedSchema = enhanceAjvSchema(schema);
    return enhancedSchema.namedContext(validationContext);
  }
});

/**
 * Creates a validation context for AJV schemas
 * @param {Object} schema - The AJV schema
 * @param {String} name - Optional name for the context
 * @returns {Object} A validation context compatible with Collection2
 */
const createAjvValidationContext = (schema, name = 'default') => {
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
const enhanceAjvSchema = (schema) => {
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
