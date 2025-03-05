import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from "meteor/aldeed:simple-schema";
import { EJSON } from 'meteor/ejson';
import { flattenSelector, isInsertType, isUpdateType, isUpsertType, isObject, isEqual } from './lib';
import { createSimpleSchemaAdapter, createZodAdapter, createAjvAdapter } from './adapters';

const meteorVersion = Meteor.release.split('@')[1].split('.');
const noAsyncAllow = meteorVersion[0] >= 3 && meteorVersion[1] >= 1;

const C2 = {};
C2._validators = {};

C2.init = self => {
  self._c2 = self._c2 || Object.create(null);
  self._c2.schemas = self._c2.schemas || [null];
  return self;
};

C2.validator = () => {
  // Get the appropriate validator based on the schema type
  return C2._getValidator();
}

// Helper function to detect schema type and return the appropriate validator
C2._getValidator = () => {
  // If we've already determined a validator, return it
  if (C2._currentValidator) {
    return C2._currentValidator;
  }

  // Try to load validators for known schema libraries
  try {
    // Check for SimpleSchema
    if (typeof SimpleSchema !== 'undefined') {
      C2._validators.SimpleSchema = C2._validators.SimpleSchema || createSimpleSchemaAdapter(SimpleSchema);
    }
  } catch (e) {
    console.error('Error loading schema validators:', e);
  }

  return null;
}

// Function to detect schema type and return appropriate validator
C2._detectSchemaType = (schema) => {
  // First, check if it's a SimpleSchema instance
  if (typeof SimpleSchema !== 'undefined' && SimpleSchema.isSimpleSchema && SimpleSchema.isSimpleSchema(schema)) {
    if (!C2._validators.SimpleSchema) {
      C2._validators.SimpleSchema = createSimpleSchemaAdapter(SimpleSchema);
    }
    C2._currentValidator = C2._validators.SimpleSchema;
    return C2._validators.SimpleSchema;
  }
  
  // Check if it's a Zod schema by looking for Zod-specific properties
  if (schema && 
      typeof schema === 'object' && 
      schema._def && 
      schema.safeParse && 
      schema.parse && 
      typeof schema.safeParse === 'function' && 
      typeof schema.parse === 'function') {
    
    // It's likely a Zod schema
    if (!C2._validators.zod) {
      C2._validators.zod = createZodAdapter({ 
        ZodType: function() {}, // Dummy constructor for instanceof checks
        object: (obj) => obj // Simplified for detection purposes
      });
      
      // Override the 'is' method to use property detection instead of instanceof
      C2._validators.zod.is = (schema) => {
        return schema && 
               typeof schema === 'object' && 
               schema._def && 
               schema.safeParse && 
               schema.parse && 
               typeof schema.safeParse === 'function' && 
               typeof schema.parse === 'function';
      };
    }
    
    C2._currentValidator = C2._validators.zod;
    return C2._validators.zod;
  }
  
  // Check if it's an AJV schema by looking for AJV-specific properties
  if (schema && 
      typeof schema === 'object' && 
      schema.compile && 
      schema.validate && 
      typeof schema.compile === 'function' && 
      typeof schema.validate === 'function') {
    
    // It's likely an AJV instance
    if (!C2._validators.ajv) {
      C2._validators.ajv = createAjvAdapter(function() {}); // Dummy constructor
      
      // Override the 'is' method to use property detection
      C2._validators.ajv.is = (schema) => {
        return schema && 
               typeof schema === 'object' && 
               schema.compile && 
               schema.validate && 
               typeof schema.compile === 'function' && 
               typeof schema.validate === 'function';
      };
    }
    
    C2._currentValidator = C2._validators.ajv;
    return C2._validators.ajv;
  }
  
  // If it's a plain object with type: "object" and properties, it's likely a JSON Schema for AJV
  if (schema && 
      typeof schema === 'object' && 
      schema.type === 'object' && 
      schema.properties && 
      typeof schema.properties === 'object') {
    
    // It's likely a JSON Schema for AJV
    if (!C2._validators.ajv) {
      C2._validators.ajv = createAjvAdapter(function() {}); // Dummy constructor
      
      // Override the 'is' method for JSON Schema detection
      C2._validators.ajv.is = (schema) => {
        return schema && 
               typeof schema === 'object' && 
               ((schema.type === 'object' && schema.properties) || 
                schema.compile || 
                schema.validate);
      };
    }
    
    C2._currentValidator = C2._validators.ajv;
    return C2._validators.ajv;
  }

  // If we can't detect the schema type, default to SimpleSchema if available
  if (C2._validators.SimpleSchema) {
    C2._currentValidator = C2._validators.SimpleSchema;
    return C2._validators.SimpleSchema;
  }

  throw new Error(`Cannot determine schema type. Make sure you have a supported schema library installed (SimpleSchema, Zod, or AJV).`);
};

C2.schemas = (self) => {
  if (!self._c2) {
    C2.init(self);
  }
  return self._c2.schemas;
}

Object.assign(Collection2, { isInsertType, isUpsertType, isUpdateType })

/**
 * Mongo.Collection.prototype.attachSchema
 * @param {SimpleSchema|Object} ss - SimpleSchema instance or a schema definition object
 *    from which to create a new SimpleSchema instance
 * @param {Object} [options]
 * @param {Boolean} [options.transform=false] Set to `true` if your document must be passed
 *    through the collection's transform to properly validate.
 * @param {Boolean} [options.replace=false] Set to `true` to replace any existing schema instead of combining
 * @param {Object} [options.selector]
 * @return {undefined}
 *
 * Use this method to attach a schema to a collection created by another package,
 * such as Meteor.users. It is most likely unsafe to call this method more than
 * once for a single collection, or to call this for a collection that had a
 * schema object passed to its constructor.
 */
Mongo.Collection.prototype.attachSchema = function c2AttachSchema(ss, options) {
    options = options || Object.create(null);

    const self = this;
    
    // Detect schema type and get appropriate validator
    const validator = C2._detectSchemaType(ss);

    // Allow passing just the schema object
    if (!validator.is(ss)) {
      ss = validator.create(ss);
    }

    function attachTo(obj) {
      // we need an array to hold multiple schemas
      // position 0 is reserved for the "base" schema
      C2.init(obj);

      const allSchemas = C2.schemas(obj);

      if (typeof options.selector === 'object') {
        // Selector Schemas

        // Extend selector schema with base schema
        const base = allSchemas[0];
        if (base) {
          ss = validator.extend(base.schema, ss);
        }

        // Index of existing schema with identical selector
        let index;
  
        // Loop through existing schemas with selectors,
        for (index = allSchemas.length - 1; index > 0; index--) {
          const current = allSchemas[index];
          if (current && isEqual(current.selector, options.selector)) break;
        }
  
        if (index <= 0) {
          // We didn't find the schema in our array - push it into the array
          allSchemas.push({
            schema: ss,
            selector: options.selector
          });
        }
        else {
          // We found a schema with an identical selector in our array,
          if (options.replace === true) {
            // Replace existing selector schema with new selector schema
            allSchemas[index].schema = ss;
          }
          else {
            // Extend existing selector schema with new selector schema.
            allSchemas[index].schema = validator.extend(
              allSchemas[index].schema,
              ss
            );
          }
        }
      } else {
        // Base Schema
        if (options.replace === true) {
          // Replace base schema and delete all other schemas
          obj._c2.schemas = [{
            schema: ss,
            selector: options.selector
          }];
        } else {
          // Set base schema if not yet set
          if (!allSchemas[0]) {
            allSchemas[0] = { schema: ss, selector: undefined };
            return allSchemas[0];
          }
          // Extend base schema and therefore extend all schemas
          allSchemas.forEach((schema, i) => {
            if (allSchemas[i]) {
              allSchemas[i].schema = validator.extend(
                allSchemas[i].schema,
                ss
              );
            }
          });
        }
      }
    }
  
    attachTo(self);
    // Attach the schema to the underlying LocalCollection, too
    if (self._collection instanceof LocalCollection) {
      C2.init(self._collection);
      attachTo(self._collection);
    }
  
    defineDeny(self, options);
    keepInsecure(self);
  
    Collection2.emit('schema.attached', self, ss, options);
  };

  for (const obj of [Mongo.Collection, LocalCollection]) {
    /**
     * simpleSchema
     * @description function detect the correct schema by given params. If it
     * detects multi-schema presence in the collection, then it made an attempt to find a
     * `selector` in args
     * @param {Object} doc - It could be <update> on update/upsert or document
     * itself on insert/remove
     * @param {Object} [options] - It could be <update> on update/upsert etc
     * @param {Object} [query] - it could be <query> on update/upsert
     * @return {Object} Schema
     */
    obj.prototype.c2Schema = function (doc, options, query) {
      const self = this;
      if (!self._c2) return null;
      if (self._c2._schema) return self._c2._schema;

      const allSchemas = C2.schemas(self);

      if (allSchemas && allSchemas.length > 0) {
        let schema, selector, target;
        // Position 0 reserved for base schema
        for (let i = 1; i < allSchemas.length; i++) {
          schema = allSchemas[i];
          selector = Object.keys(schema.selector)[0];

          // We will set this to undefined because in theory, you might want to select
          // on a null value.
          target = undefined;
          // here we are looking for selector in different places
          // $set should have more priority here
          if (doc.$set && typeof doc.$set[selector] !== 'undefined') {
            target = doc.$set[selector];
          } else if (typeof doc[selector] !== 'undefined') {
            target = doc[selector];
          } else if (options && options.selector) {
            target = options.selector[selector];
          } else if (query && query[selector]) {
            // on upsert/update operations
            target = query[selector];
          }

          // we need to compare given selector with doc property or option to
          //  find the right schema
          if (target !== undefined && target === schema.selector[selector]) {
            return schema.schema;
          }
        }
        if (allSchemas[0]) {
          return allSchemas[0].schema;
        } else {
          throw new Error('No default schema');
        }
      }

      return null;
    };
  }

function getArgumentsAndValidationContext(methodName, args, async) {
    let options = isInsertType(methodName) ? args[1] : args[2];

    // Support missing options arg
    if (!options || typeof options === 'function') {
       options = {};
    }

    let validationContext = {};
    let validatedArgs = args;
    if (this._c2 && options.bypassCollection2 !== true) {
       let userId = null;
       try {
          // https://github.com/aldeed/meteor-collection2/issues/175
         userId = Meteor.userId();
       } catch (err) {}

       [validatedArgs, validationContext] = doValidate({
         collection: this,
         type: methodName,
         args,
         getAutoValues: Meteor.isServer || this._connection === null, // getAutoValues
         userId,
         isFromTrustedCode: Meteor.isServer, // isFromTrustedCode
         async
       });

       if (!validatedArgs) {
         // doValidate already called the callback or threw the error, so we're done.
         // But insert should always return an ID to match core behavior.
         return isInsertType(methodName) ? this._makeNewID() : undefined;
       }
    } else {
       // We still need to adjust args because insert does not take options
       if (isInsertType(methodName) && typeof validatedArgs[1] !== 'function') validatedArgs.splice(1, 1);
    }

    return [validatedArgs, validationContext];
   }

   function _methodMutation(async, methodName) {
    const _super = Meteor.isFibersDisabled
       ? Mongo.Collection.prototype[methodName]
       : Mongo.Collection.prototype[methodName.replace('Async', '')];

    if (!_super) return;
  
    Mongo.Collection.prototype[methodName] = function (...args) {
      let options = isInsertType(methodName) ? args[1] : args[2];
  
      // Support missing options arg
      if (!options || typeof options === 'function') {
        options = {};
      }
  
      let validationContext = {};
      let error;
      if (this._c2 && options.bypassCollection2 !== true) {
        let userId = null;
        try {
          // https://github.com/aldeed/meteor-collection2/issues/175
          userId = Meteor.userId();
        } catch (err) {}
  
        [args, validationContext] = doValidate({
          collection: this,
          type: methodName,
          args,
          getAutoValues: Meteor.isServer || this._connection === null, // getAutoValues
          userId,
          isFromTrustedCode: Meteor.isServer, // isFromTrustedCode
          async
        });
  
        if (!args) {
          // doValidate already called the callback or threw the error, so we're done.
          // But insert should always return an ID to match core behavior.
          return isInsertType(methodName) ? this._makeNewID() : undefined;
        }
      } else {
        // We still need to adjust args because insert does not take options
        if (isInsertType(methodName) && typeof args[1] !== 'function') args.splice(1, 1);
      }
  
      if (async && !Meteor.isFibersDisabled) {
        try {
          this[methodName.replace('Async', '')].isCalledFromAsync = true;
          _super.isCalledFromAsync = true;
          return Promise.resolve(_super.apply(this, args));
        } catch (err) {
          const addValidationErrorsPropName =
            typeof validationContext.addValidationErrors === 'function'
              ? 'addValidationErrors'
              : 'addInvalidKeys';
          parsingServerError([err], validationContext, addValidationErrorsPropName);
          error = getErrorObject(validationContext, err.message, err.code);
          return Promise.reject(error);
        }
      } else {
        return _super.apply(this, args);
      }
    };
  }
  
  function _methodMutationAsync(methodName) {
    const _super = Mongo.Collection.prototype[methodName];
    Mongo.Collection.prototype[methodName] = async function (...args) {
       const [validatedArgs, validationContext] = getArgumentsAndValidationContext.call(this, methodName, args, true);

       try {
         return await _super.apply(this, validatedArgs);
       } catch (err) {
        if (this._c2) {
         const addValidationErrorsPropName =
           typeof validationContext.addValidationErrors === 'function'
             ? 'addValidationErrors'
             : 'addInvalidKeys';
         parsingServerError([err], validationContext, addValidationErrorsPropName);
         throw getErrorObject(validationContext, err.message, err.code);
        } else {
          // do not change error if collection isn't being validated by collection2
         throw err;
        }
       }
    };
   }


  // Wrap DB write operation methods
if (Mongo.Collection.prototype.insertAsync) {
  if (Meteor.isFibersDisabled) {
    ['insertAsync', 'updateAsync'].forEach(_methodMutationAsync.bind(this));
  } else {
    ['insertAsync', 'updateAsync'].forEach(_methodMutation.bind(this, true));
  }
  ['insert', 'update'].forEach(_methodMutation.bind(this, false));
} 

/*
 * Private
 */
  
function doValidate({ collection, type, args = [], getAutoValues, userId, isFromTrustedCode, async }) {
    let doc, callback, error, options, selector;

    if (!args.length) {
      throw new Error(type + ' requires an argument');
    }

    // Gather arguments and cache the selector
    if (isInsertType(type)) {
      doc = args[0];
      options = args[1];
      callback = args[2];

      // The real insert doesn't take options
      if (typeof options === 'function') {
        args = [doc, options];
      } else if (typeof callback === 'function') {
        args = [doc, callback];
      } else {
        args = [doc];
      }
    } else if (isUpdateType(type)) {
      selector = args[0];
      doc = args[1];
      options = args[2];
      callback = args[3];
    } else {
      throw new Error('invalid type argument');
    }
  
    const validatedObjectWasInitiallyEmpty = Object.keys(doc).length === 0;
  
    // Support missing options arg
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || Object.create(null);

    const last = args.length - 1;

    const hasCallback = typeof args[last] === 'function';

    // If update was called with upsert:true, flag as an upsert
    const isUpsert = isUpdateType(type) && options.upsert === true;

    // we need to pass `doc` and `options` to `simpleSchema` method, that's why
    // schema declaration moved here
    let schema = collection.c2Schema(doc, options, selector);
    const isLocalCollection = collection._connection === null;

    // On the server and for local collections, we allow passing `getAutoValues: false` to disable autoValue functions
    if ((Meteor.isServer || isLocalCollection) && options.getAutoValues === false) {
      getAutoValues = false;
    }

    // Process pick/omit options if they are present
    const picks = Array.isArray(options.pick) ? options.pick : null;
    const omits = Array.isArray(options.omit) ? options.omit : null;

    if (picks && omits) {
      // Pick and omit cannot both be present in the options
      throw new Error('pick and omit options are mutually exclusive');
    } else if (picks) {
      schema = schema.pick(...picks);
    } else if (omits) {
      schema = schema.omit(...omits);
    }

    // Determine validation context
    let validationContext = options.validationContext;
    if (validationContext) {
      if (typeof validationContext === 'string') {
        validationContext = schema.namedContext(validationContext);
      }
    } else {
      // Special handling for Zod schema that might be missing namedContext
      if (schema._def && schema._def.typeName === 'ZodObject') {
        
        // Create a validation context manually for Zod schemas
        let errors = [];
        
        // Attach namedContext method if it doesn't exist
        if (typeof schema.namedContext !== 'function') {
          
          // Define the namedContext method
          schema.namedContext = function(name = 'default') {
            return {
              validate: (obj, options = {}) => {
                try {
                  if (options.modifier) {
                    // For update operations with modifiers
                    if (obj.$set) {
                      // Create a partial schema for update validation
                      const partialSchema = schema.partial();
                      try {
                        partialSchema.parse(obj.$set);
                      } catch (error) {
                        collectErrors(error);
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
                    
                    // If no specific modifiers to validate, treat it as valid
                    if (!obj.$set && !obj.$push && !obj.$unset) {}
                    
                    // For upserts, validate the combined document if provided
                    if (options.upsert && options.extendedCustomContext && options.extendedCustomContext.upsertDocument) {
                      try {
                        schema.parse(options.extendedCustomContext.upsertDocument);
                      } catch (error) {
                        collectErrors(error);
                        return false;
                      }
                    }
                    
                    // If we reach this point, all validation passed
                    errors = []; // Clear errors if validation passes
                    return true;
                  } else {
                    // For normal documents (insert)
                    try {
                      schema.parse(obj);
                      errors = []; // Clear errors if validation passes
                      return true;
                    } catch (error) {
                      collectErrors(error);
                      return false;
                    }
                  }
                } catch (error) {
                  collectErrors(error);
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
            
            // Helper function to collect errors
            function collectErrors(error) {
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
              } else if (error.message) {
                // Add a generic error if we don't have specific path errors
                errors.push({
                  name: 'general',
                  type: 'error',
                  value: null,
                  message: error.message
                });
              }
            }
          };
          
          // Also add allowsKey method to the schema itself
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
          
          // Add a clean method for Zod schemas
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
        
        // Set the validation context to use the schema's namedContext
        validationContext = schema.namedContext();
      } else {
        validationContext = schema.namedContext();
      }
    }

    // Add a default callback function if we're on the client and no callback was given
    if (Meteor.isClient && !callback && !async) {
      // Client can't block, so it can't report errors by exception,
      // only by callback. If they forget the callback, give them a
      // default one that logs the error, so they aren't totally
      // baffled if their writing doesn't work because their database is
      // down.
      callback = function (err) {
        if (err) {
          Meteor._debug(type + ' failed: ' + (err.reason || err.stack));
        }
      };
    }

    // If client validation is fine or is skipped but then something
    // is found to be invalid on the server, we get that error back
    // as a special Meteor.Error that we need to parse.
    if (Meteor.isClient && hasCallback) {
      callback = args[last] = wrapCallbackForParsingServerErrors(validationContext, callback);
    }

    const schemaAllowsId = schema.allowsKey('_id');
    if (isInsertType(type) && !doc._id && schemaAllowsId) {
      doc._id = collection._makeNewID();
    }

    // Get the docId for passing in the autoValue/custom context
    let docId;
    if (isInsertType(type)) {
      docId = doc._id; // might be undefined
    } else if (isUpdateType(type) && selector) {
      docId =
        typeof selector === 'string' || selector instanceof Mongo.ObjectID ? selector : selector._id;
    }

    // If _id has already been added, remove it temporarily if it's
    // not explicitly defined in the schema.
    let cachedId;
    if (doc._id && !schemaAllowsId) {
      cachedId = doc._id;
      delete doc._id;
    }

    const autoValueContext = {
      isInsert: isInsertType(type),
      isUpdate: isUpdateType(type) && options.upsert !== true,
      isUpsert,
      userId,
      isFromTrustedCode,
      docId,
      isLocalCollection
    };

    const extendAutoValueContext = {
      ...((schema._cleanOptions || {}).extendAutoValueContext || {}),
      ...autoValueContext,
      ...options.extendAutoValueContext
    };

    const cleanOptionsForThisOperation = {};
    for (const prop of ['autoConvert', 'filter', 'removeEmptyStrings', 'removeNullsFromArrays', 'trimStrings']) {
      if (typeof options[prop] === 'boolean') {
        cleanOptionsForThisOperation[prop] = options[prop];
      }
    }

    // Preliminary cleaning on both client and server. On the server and for local
    // collections, automatic values will also be set at this point.
    schema.clean(doc, {
      mutate: true, // Clean the doc/modifier in place
      isModifier: !isInsertType(type),
      // The extent with the schema-level defaults (from SimpleSchema constructor options)
      ...(schema._cleanOptions || {}),
      // Finally, options for this specific operation should take precedence
      ...cleanOptionsForThisOperation,
      extendAutoValueContext, // This was extended separately above
      getAutoValues // Force this override
    });

    // We clone before validating because in some cases, we need to adjust the
    // object a bit before validating it. If we adjusted `doc` itself, our
    // changes would persist into the database.
    const docToValidate = {};
    for (const prop in doc) {
      // We omit prototype properties when cloning because they will not be valid
      // and mongo omits them when saving to the database anyway.
      if (Object.prototype.hasOwnProperty.call(doc, prop)) {
        docToValidate[prop] = doc[prop];
      }
    }

    // On the server, upserts are possible; SimpleSchema handles upserts pretty
    // well by default, but it will not know about the fields in the selector,
    // which are also stored in the database if an insert is performed. So we
    // will allow these fields to be considered for validation by adding them
    // to the $set in the modifier, while stripping out query selectors as these
    // don't make it into the upserted document and break validation.
    // This is no doubt prone to errors, but there probably isn't any better way
    // right now.
    if (Meteor.isServer && isUpsert && isObject(selector)) {
      const set = docToValidate.$set || {};
      docToValidate.$set = flattenSelector(selector);

      if (!schemaAllowsId) delete docToValidate.$set._id;
      Object.assign(docToValidate.$set, set);
    }
    // Set automatic values for validation on the client.
    // On the server, we already updated doc with auto values, but on the client,
    // we will add them to docToValidate for validation purposes only.
    // This is because we want all actual values generated on the server.
    if (Meteor.isClient && !isLocalCollection) {
      schema.clean(docToValidate, {
        autoConvert: false,
        extendAutoValueContext,
        filter: false,
        getAutoValues: true,
        isModifier: !isInsertType(type),
        mutate: true, // Clean the doc/modifier in place
        removeEmptyStrings: false,
        removeNullsFromArrays: false,
        trimStrings: false
      });
    }

    // XXX Maybe move this into SimpleSchema
    if (!validatedObjectWasInitiallyEmpty && Object.keys(docToValidate).length === 0) {
      throw new Error(
        'After filtering out keys not in the schema, your ' +
          (isUpdateType(type) ? 'modifier' : 'object') +
          ' is now empty'
      );
    }

    // Validate doc
    let isValid;
    if (options.validate === false) {
      isValid = true;
    } else {
      isValid = validationContext.validate(docToValidate, {
        modifier: isUpdateType(type) || isUpsertType(type),
        upsert: isUpsert,
        extendedCustomContext: {
          isInsert: isInsertType(type),
          isUpdate: isUpdateType(type) && options.upsert !== true,
          isUpsert,
          userId,
          isFromTrustedCode,
          docId,
          isLocalCollection,
          ...(options.extendedCustomContext || {})
        }
      });
    }

    if (isValid) {
      // Add the ID back
      if (cachedId) {
        doc._id = cachedId;
      }

      // Update the args to reflect the cleaned doc
      // XXX not sure if this is necessary since we mutate
      if (isInsertType(type)) {
        args[0] = doc;
      } else {
        args[1] = doc;
      }

      // If callback, set invalidKey when we get a mongo unique error
      if (Meteor.isServer && hasCallback) {
        args[last] = wrapCallbackForParsingMongoValidationErrors(validationContext, args[last]);
      }

      return [args, validationContext];
    } else {
      error = getErrorObject(
        validationContext,
        Meteor.settings?.packages?.collection2?.disableCollectionNamesInValidation
          ? ''
          : `in ${collection._name} ${type}`
      );
      if (callback) {
        // insert/update/upsert pass `false` when there's an error, so we do that
        callback(error, false);
        return [];
      } else {
        throw error;
      }
    }
  }

  function getErrorObject(context, appendToMessage = '', code) {
    let message;
    const invalidKeys =
      typeof context.validationErrors === 'function'
        ? context.validationErrors()
        : context.invalidKeys?.();

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
  }

  function addUniqueError(context, errorMessage) {
    const name = errorMessage.split('c2_')[1].split(' ')[0];
    const val = errorMessage.split('dup key:')[1].split('"')[1];

    const addValidationErrorsPropName =
      typeof context.addValidationErrors === 'function' ? 'addValidationErrors' : 'addInvalidKeys';
    context[addValidationErrorsPropName]([
      {
        name,
        type: 'notUnique',
        value: val
      }
    ]);
  }

  function parsingServerError(args, validationContext, addValidationErrorsPropName) {
    const error = args[0];
    // Handle our own validation errors
    if (
      error instanceof Meteor.Error &&
      error.error === 400 &&
      error.reason === 'INVALID' &&
      typeof error.details === 'string'
    ) {
      const invalidKeysFromServer = EJSON.parse(error.details);
      validationContext[addValidationErrorsPropName](invalidKeysFromServer);
      args[0] = getErrorObject(validationContext);
    } else if (
      error instanceof Meteor.Error &&
      // Handle Mongo unique index errors, which are forwarded to the client as 409 errors
      error.error === 409 &&
      error.reason &&
      error.reason.indexOf('E11000') !== -1 &&
      error.reason.indexOf('c2_') !== -1
    ) {
      addUniqueError(validationContext, error.reason);
      args[0] = getErrorObject(validationContext);
    }
  }

  function wrapCallbackForParsingMongoValidationErrors(validationContext, cb) {
    return function wrappedCallbackForParsingMongoValidationErrors(...args) {
      const error = args[0];
      if (
        error &&
        ((error.name === 'MongoError' && error.code === 11001) ||
          error.message.indexOf('MongoError: E11000') !== -1) &&
        error.message.indexOf('c2_') !== -1
      ) {
        addUniqueError(validationContext, error.message);
        args[0] = getErrorObject(validationContext);
      }
      return cb.apply(this, args);
    };
  }

  function wrapCallbackForParsingServerErrors(validationContext, cb) {
    const addValidationErrorsPropName =
      typeof validationContext.addValidationErrors === 'function'
        ? 'addValidationErrors'
        : 'addInvalidKeys';
    return function wrappedCallbackForParsingServerErrors(...args) {
      parsingServerError(args, validationContext, addValidationErrorsPropName);
      return cb.apply(this, args);
    };
  }

  const alreadyInsecure = {};

  function keepInsecure(c) {
    // If insecure package is in use, we need to add allow rules that return
    // true. Otherwise, it would seemingly turn off insecure mode.
    if (Package && Package.insecure && !alreadyInsecure[c._name]) {
      const allow = {
        insert: function () {
          return true;
        },
        update: function () {
          return true;
        },
        remove: function () {
          return true;
        },
        fetch: [],
        transform: null
      };

      if (Meteor.isFibersDisabled && !noAsyncAllow) {
        Object.assign(allow, {
          insertAsync: allow.insert,
          updateAsync: allow.update,
          removeAsync: allow.remove
        });
      }

      c.allow(allow);

      alreadyInsecure[c._name] = true;
    }
    // If insecure package is NOT in use, then adding the two deny functions
    // does not have any effect on the main app's security paradigm. The
    // user will still be required to add at least one allow function of her
    // own for each operation for this collection. And the user may still add
    // additional deny functions, but does not have to.
  }
  
C2.alreadyDefined = {};
  
function defineDeny(collection, options) {
  const validator = C2.validator();
  if (C2.alreadyDefined[collection._name]) {
    return false; // no definition added;
  }
  const isLocalCollection = collection._connection === null;

  // First, define deny functions to extend doc with the results of clean
  // and auto-values. This must be done with "transform: null" or we would be
  // extending a clone of doc and therefore have no effect.
  const firstDeny = {
    insert: function (userId, doc) {
      // Referenced doc is cleaned in place
      const schema = collection.c2Schema(doc);
      validator.clean({ doc, schema, userId, isLocalCollection, type: 'insert' });
      return false;
    },
    update: function (userId, doc, fields, modifier) {
      // Referenced modifier is cleaned in place
      const schema = collection.c2Schema(doc);
      validator.clean({ userId, doc, fields, modifier, schema, type: 'update' });
      return false;
    },
    fetch: ['_id'],
    transform: null
  };

      if (Meteor.isFibersDisabled && !noAsyncAllow) {
        Object.assign(firstDeny, {
          insertAsync: firstDeny.insert,
          updateAsync: firstDeny.update
        });
      }

  collection.deny(firstDeny);

  // Second, define deny functions to validate again on the server
  // for client-initiated inserts and updates. These should be
  // called after the clean/auto-value functions since we're adding
  // them after. These must *not* have "transform: null" if options.transform is true because
  // we need to pass the doc through any transforms to be sure
  // that custom types are properly recognized for type validation.
  const secondDeny = {
    insert: function (userId, doc) {
      // We pass the false options because we will have done them on the client if desired
      doValidate({
        collection,
        type: 'insert',
        args: [
          doc,
          {
            trimStrings: false,
            removeEmptyStrings: false,
            filter: false,
            autoConvert: false
          },
          function (error) {
            if (error) {
              throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
            }
          }
        ],
        getAutoValues: false, // getAutoValues
        userId,
        isFromTrustedCode: false // isFromTrustedCode
      });

      return false;
    },
    update: function (userId, doc, fields, modifier) {
      // NOTE: This will never be an upsert because client-side upserts
      // are not allowed once you define allow/deny functions.
      // We pass the false options because we will have done them on the client if desired
      doValidate({
        collection,
        type: 'update',
        args: [
          { _id: doc && doc._id },
          modifier,
          {
            trimStrings: false,
            removeEmptyStrings: false,
            filter: false,
            autoConvert: false
          },
          function (error) {
            if (error) {
              throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
            }
          }
        ],
        getAutoValues: false, // getAutoValues
        userId,
        isFromTrustedCode: false // isFromTrustedCode
      });

      return false;
    },
    fetch: ['_id'],
    ...(options.transform === true ? {} : { transform: null })
  };

      if (Meteor.isFibersDisabled && !noAsyncAllow) {
        Object.assign(secondDeny, {
          insertAsync: secondDeny.insert,
          updateAsync: secondDeny.update
        });
      }

  collection.deny(secondDeny);

  // note that we've already done this collection so that we don't do it again
  // if attachSchema is called again
  C2.alreadyDefined[collection._name] = true;
  return true; // new definition added
}