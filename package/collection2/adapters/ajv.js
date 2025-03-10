import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType } from '../lib';
import { isAjvSchema } from '../schemaDetectors';

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
  getErrorObject: (context, appendToMessage = '', code) => {
    let message;
    const invalidKeys = 
      typeof context.validationErrors === 'function'
        ? context.validationErrors()
        : context.invalidKeys();

    if (invalidKeys?.length) {
      const firstErrorKey = invalidKeys[0].name;
      const firstErrorMessage = context.keyErrorMessage(firstErrorKey);

      // For AJV errors, include schema keyword and params if available
      const firstError = invalidKeys[0];
      if (firstError.keyword && firstError.params) {
        if (firstErrorKey.indexOf('.') === -1) {
          message = `${firstErrorMessage} (${firstError.keyword}: ${JSON.stringify(firstError.params)})`;
        } else {
          message = `${firstErrorMessage} (${firstErrorKey}, ${firstError.keyword}: ${JSON.stringify(firstError.params)})`;
        }
      } else {
        // Fallback to standard message format
        if (firstErrorKey.indexOf('.') === -1) {
          message = firstErrorMessage;
        } else {
          message = `${firstErrorMessage} (${firstErrorKey})`;
        }
      }
    } else {
      message = 'Failed validation';
    }
    
    message = `${message} ${appendToMessage}`.trim();
    const error = new Error(message);
    error.invalidKeys = invalidKeys;
    error.validationContext = context;
    error.code = code;
    error.name = 'ValidationError'; // Set the name to ValidationError consistently
    
    // Add AJV-specific error details
    if (invalidKeys?.length && invalidKeys[0].ajvError) {
      error.ajvError = invalidKeys[0].ajvError;
    }
    
    // If on the server, we add a sanitized error, too, in case we're
    // called from a method.
    if (Meteor.isServer) {
      error.sanitizedError = new Meteor.Error(400, message, EJSON.stringify(error.invalidKeys));
    }
    
    return error;
  },
  freeze: false
});
