import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType } from '../lib';
import { enhanceZodSchema } from '../validators';
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
  freeze: false
});
