import { Meteor } from 'meteor/meteor';
import { EJSON } from 'meteor/ejson';
import { isInsertType, isUpdateType, isUpsertType } from '../lib';
import { isSimpleSchema } from '../schemaDetectors';

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
  getErrorObject: (context, appendToMessage = '', code) => {
    let message;
    const invalidKeys = 
      typeof context.validationErrors === 'function'
        ? context.validationErrors()
        : context.invalidKeys();

    if (invalidKeys?.length) {
      const firstErrorKey = invalidKeys[0].name;
      const firstErrorMessage = context.keyErrorMessage(firstErrorKey);

      // If the error is in a nested key, add the full key to the error message
      // to be more helpful.
      if (firstErrorKey.indexOf('.') === -1) {
        message = firstErrorMessage;
      } else {
        message = `${firstErrorMessage} (${firstErrorKey})`;
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
    
    return schema.namedContext(validationContext);
  },
  
  // Attach createValidationContext method to the schema library
  attachToLibrary: (SimpleSchemaLib) => {
    if (!SimpleSchemaLib.createValidationContext) {
      SimpleSchemaLib.createValidationContext = function(schema, validationContext) {
        if (validationContext && typeof validationContext === 'object') {
          return validationContext;
        }
        
        return schema.namedContext(validationContext);
      };
    }
    return SimpleSchemaLib;
  }
});
