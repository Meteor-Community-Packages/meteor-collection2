import { EventEmitter } from 'meteor/raix:eventemitter';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
import clone from 'clone';
import { EJSON } from 'meteor/ejson';
import isEmpty from 'lodash.isempty';
import isEqual from 'lodash.isequal';
import isObject from 'lodash.isobject';

checkNpmVersions({ 'simpl-schema': '>=0.0.0' }, 'aldeed:collection2');

const SimpleSchema = require('simpl-schema').default;

// Exported only for listening to events
const Collection2 = new EventEmitter();

const defaultCleanOptions = {
  filter: true,
  autoConvert: true,
  removeEmptyStrings: true,
  trimStrings: true,
  removeNullsFromArrays: false,
};

/**
 * Mongo.Collection.prototype.attachSchema
 * @param {SimpleSchema|Object} ss - SimpleSchema instance or a schema definition object
 *    from which to create a new SimpleSchema instance
 * @param {Object} [options]
 * @param {Boolean} [options.transform=false] Set to `true` if your document must be passed
 *    through the collection's transform to properly validate.
 * @param {Boolean} [options.replace=false] Set to `true` to replace any existing schema instead of combining
 * @return {undefined}
 *
 * Use this method to attach a schema to a collection created by another package,
 * such as Meteor.users. It is most likely unsafe to call this method more than
 * once for a single collection, or to call this for a collection that had a
 * schema object passed to its constructor.
 */
Mongo.Collection.prototype.attachSchema = function c2AttachSchema(ss, options) {
  options = options || {};

  // Allow passing just the schema object
  if (!SimpleSchema.isSimpleSchema(ss)) {
    ss = new SimpleSchema(ss);
  }

  this._c2 = this._c2 || {};

  // If we've already attached one schema, we combine both into a new schema unless options.replace is `true`
  if (this._c2._simpleSchema && options.replace !== true) {
    if (ss.version >= 2) {
      var newSS = new SimpleSchema(this._c2._simpleSchema);
      newSS.extend(ss);
      ss = newSS;
    } else {
      ss = new SimpleSchema([this._c2._simpleSchema, ss]);
    }
  }

  var selector = options.selector;

  function attachTo(obj) {
    if (typeof selector === "object") {
      // Index of existing schema with identical selector
      var schemaIndex = -1;

      // we need an array to hold multiple schemas
      obj._c2._simpleSchemas = obj._c2._simpleSchemas || [];

      // Loop through existing schemas with selectors
      obj._c2._simpleSchemas.forEach((schema, index) => {
        // if we find a schema with an identical selector, save it's index
        if(isEqual(schema.selector, selector)) {
          schemaIndex = index;
        }
      });
      if (schemaIndex === -1) {
        // We didn't find the schema in our array - push it into the array
        obj._c2._simpleSchemas.push({
          schema: SimpleSchema.isSimpleSchema(ss) ? ss : new SimpleSchema(ss),
          selector: selector,
        });
      } else {
        // We found a schema with an identical selector in our array,
        if (options.replace !== true) {
          // Merge with existing schema unless options.replace is `true`
          if (obj._c2._simpleSchemas[schemaIndex].schema.version >= 2) {
            obj._c2._simpleSchemas[schemaIndex].schema.extend(ss);
          } else {
            obj._c2._simpleSchemas[schemaIndex].schema = new SimpleSchema([obj._c2._simpleSchemas[schemaIndex].schema, ss]);
          }
        } else {
          // If options.replace is `true` replace existing schema with new schema
          obj._c2._simpleSchemas[schemaIndex].schema = ss;
        }

      }

      // Remove existing schemas without selector
      delete obj._c2._simpleSchema;
    } else {
      // Track the schema in the collection
      obj._c2._simpleSchema = ss;

      // Remove existing schemas with selector
      delete obj._c2._simpleSchemas;
    }
  }

  attachTo(this);
  // Attach the schema to the underlying LocalCollection, too
  if (this._collection instanceof LocalCollection) {
    this._collection._c2 = this._collection._c2 || {};
    attachTo(this._collection);
  }

  defineDeny(this, options);
  keepInsecure(this);

  Collection2.emit('schema.attached', this, ss, options);
};

[Mongo.Collection, LocalCollection].forEach((obj) => {
  /**
   * simpleSchema
   * @description function detect the correct schema by given params. If it
   * detect multi-schema presence in the collection, then it made an attempt to find a
   * `selector` in args
   * @param {Object} doc - It could be <update> on update/upsert or document
   * itself on insert/remove
   * @param {Object} [options] - It could be <update> on update/upsert etc
   * @param {Object} [query] - it could be <query> on update/upsert
   * @return {Object} Schema
   */
  obj.prototype.simpleSchema = function (doc, options, query) {
    if (!this._c2) return null;
    if (this._c2._simpleSchema) return this._c2._simpleSchema;

    var schemas = this._c2._simpleSchemas;
    if (schemas && schemas.length > 0) {
      if (!doc) throw new Error('collection.simpleSchema() requires doc argument when there are multiple schemas');

      var schema, selector, target;
      for (var i = 0; i < schemas.length; i++) {
        schema = schemas[i];
        selector = Object.keys(schema.selector)[0];

        // We will set this to undefined because in theory you might want to select
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
        } else if (query && query[selector]) { // on upsert/update operations
          target = query[selector];
        }

        // we need to compare given selector with doc property or option to
        // find right schema
        if (target !== undefined && target === schema.selector[selector]) {
          return schema.schema;
        }
      }
    }

    return null;
  };
});

// Wrap DB write operation methods
['insert', 'update'].forEach((methodName) => {
  const _super = Mongo.Collection.prototype[methodName];
  Mongo.Collection.prototype[methodName] = function(...args) {
    let options = (methodName === "insert") ? args[1] : args[2];

    // Support missing options arg
    if (!options || typeof options === "function") {
      options = {};
    }

    if (this._c2 && options.bypassCollection2 !== true) {
      var userId = null;
      try { // https://github.com/aldeed/meteor-collection2/issues/175
        userId = Meteor.userId();
      } catch (err) {}

      args = doValidate(
        this,
        methodName,
        args,
        Meteor.isServer || this._connection === null, // getAutoValues
        userId,
        Meteor.isServer // isFromTrustedCode
      );
      if (!args) {
        // doValidate already called the callback or threw the error so we're done.
        // But insert should always return an ID to match core behavior.
        return methodName === "insert" ? this._makeNewID() : undefined;
      }
    } else {
      // We still need to adjust args because insert does not take options
      if (methodName === "insert" && typeof args[1] !== 'function') args.splice(1, 1);
    }

    return _super.apply(this, args);
  };
});

/*
 * Private
 */

function doValidate(collection, type, args, getAutoValues, userId, isFromTrustedCode) {
  var doc, callback, error, options, isUpsert, selector, last, hasCallback;

  if (!args.length) {
    throw new Error(type + " requires an argument");
  }

  // Gather arguments and cache the selector
  if (type === "insert") {
    doc = args[0];
    options = args[1];
    callback = args[2];

    // The real insert doesn't take options
    if (typeof options === "function") {
      args = [doc, options];
    } else if (typeof callback === "function") {
      args = [doc, callback];
    } else {
      args = [doc];
    }
  } else if (type === "update") {
    selector = args[0];
    doc = args[1];
    options = args[2];
    callback = args[3];
  } else {
    throw new Error("invalid type argument");
  }

  var validatedObjectWasInitiallyEmpty = isEmpty(doc);

  // Support missing options arg
  if (!callback && typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};

  last = args.length - 1;

  hasCallback = (typeof args[last] === 'function');

  // If update was called with upsert:true, flag as an upsert
  isUpsert = (type === "update" && options.upsert === true);

  // we need to pass `doc` and `options` to `simpleSchema` method, that's why
  // schema declaration moved here
  var schema = collection.simpleSchema(doc, options, selector);
  var isLocalCollection = (collection._connection === null);

  // On the server and for local collections, we allow passing `getAutoValues: false` to disable autoValue functions
  if ((Meteor.isServer || isLocalCollection) && options.getAutoValues === false) {
    getAutoValues = false;
  }

  // Determine validation context
  var validationContext = options.validationContext;
  if (validationContext) {
    if (typeof validationContext === 'string') {
      validationContext = schema.namedContext(validationContext);
    }
  } else {
    validationContext = schema.namedContext();
  }

  // Add a default callback function if we're on the client and no callback was given
  if (Meteor.isClient && !callback) {
    // Client can't block, so it can't report errors by exception,
    // only by callback. If they forget the callback, give them a
    // default one that logs the error, so they aren't totally
    // baffled if their writes don't work because their database is
    // down.
    callback = function(err) {
      if (err) {
        Meteor._debug(type + " failed: " + (err.reason || err.stack));
      }
    };
  }

  // If client validation is fine or is skipped but then something
  // is found to be invalid on the server, we get that error back
  // as a special Meteor.Error that we need to parse.
  if (Meteor.isClient && hasCallback) {
    callback = args[last] = wrapCallbackForParsingServerErrors(validationContext, callback);
  }

  var schemaAllowsId = schema.allowsKey("_id");
  if (type === "insert" && !doc._id && schemaAllowsId) {
    doc._id = collection._makeNewID();
  }

  // Get the docId for passing in the autoValue/custom context
  var docId;
  if (type === 'insert') {
    docId = doc._id; // might be undefined
  } else if (type === "update" && selector) {
    docId = typeof selector === 'string' || selector instanceof Mongo.ObjectID ? selector : selector._id;
  }

  // If _id has already been added, remove it temporarily if it's
  // not explicitly defined in the schema.
  var cachedId;
  if (doc._id && !schemaAllowsId) {
    cachedId = doc._id;
    delete doc._id;
  }

  const autoValueContext = {
    isInsert: (type === "insert"),
    isUpdate: (type === "update" && options.upsert !== true),
    isUpsert,
    userId,
    isFromTrustedCode,
    docId,
    isLocalCollection
  };

  const extendAutoValueContext = {
    ...((schema._cleanOptions || {}).extendAutoValueContext || {}),
    ...autoValueContext,
    ...options.extendAutoValueContext,
  };

  const cleanOptionsForThisOperation = {};
  ["autoConvert", "filter", "removeEmptyStrings", "removeNullsFromArrays", "trimStrings"].forEach(prop => {
    if (typeof options[prop] === "boolean") {
      cleanOptionsForThisOperation[prop] = options[prop];
    }
  });

  // Preliminary cleaning on both client and server. On the server and for local
  // collections, automatic values will also be set at this point.
  schema.clean(doc, {
    mutate: true, // Clean the doc/modifier in place
    isModifier: (type !== "insert"),
    // Start with some Collection2 defaults, which will usually be overwritten
    ...defaultCleanOptions,
    // The extend with the schema-level defaults (from SimpleSchema constructor options)
    ...(schema._cleanOptions || {}),
    // Finally, options for this specific operation should take precedence
    ...cleanOptionsForThisOperation,
    extendAutoValueContext, // This was extended separately above
    getAutoValues, // Force this override
  });

  // We clone before validating because in some cases we need to adjust the
  // object a bit before validating it. If we adjusted `doc` itself, our
  // changes would persist into the database.
  var docToValidate = {};
  for (var prop in doc) {
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
  // to the $set in the modifier. This is no doubt prone to errors, but there
  // probably isn't any better way right now.
  if (Meteor.isServer && isUpsert && isObject(selector)) {
    var set = docToValidate.$set || {};

    // If selector uses $and format, convert to plain object selector
    if (Array.isArray(selector.$and)) {
      const plainSelector = {};
      selector.$and.forEach(sel => {
        Object.assign(plainSelector, sel);
      });
      docToValidate.$set = plainSelector;
    } else {
      docToValidate.$set = clone(selector);
    }

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
      isModifier: (type !== "insert"),
      mutate: true, // Clean the doc/modifier in place
      removeEmptyStrings: false,
      removeNullsFromArrays: false,
      trimStrings: false,
    });
  }

  // XXX Maybe move this into SimpleSchema
  if (!validatedObjectWasInitiallyEmpty && isEmpty(docToValidate)) {
    throw new Error('After filtering out keys not in the schema, your ' +
      (type === 'update' ? 'modifier' : 'object') +
      ' is now empty');
  }

  // Validate doc
  var isValid;
  if (options.validate === false) {
    isValid = true;
  } else {
    isValid = validationContext.validate(docToValidate, {
      modifier: (type === "update" || type === "upsert"),
      upsert: isUpsert,
      extendedCustomContext: {
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert,
        userId,
        isFromTrustedCode,
        docId,
        isLocalCollection,
        ...(options.extendedCustomContext || {}),
      },
    });
  }

  if (isValid) {
    // Add the ID back
    if (cachedId) {
      doc._id = cachedId;
    }

    // Update the args to reflect the cleaned doc
    // XXX not sure this is necessary since we mutate
    if (type === "insert") {
      args[0] = doc;
    } else {
      args[1] = doc;
    }

    // If callback, set invalidKey when we get a mongo unique error
    if (Meteor.isServer && hasCallback) {
      args[last] = wrapCallbackForParsingMongoValidationErrors(validationContext, args[last]);
    }

    return args;
  } else {
    error = getErrorObject(validationContext, `in ${collection._name} ${type}`);
    if (callback) {
      // insert/update/upsert pass `false` when there's an error, so we do that
      callback(error, false);
    } else {
      throw error;
    }
  }
}

function getErrorObject(context, appendToMessage = '') {
  let message;
  const invalidKeys = (typeof context.validationErrors === 'function') ? context.validationErrors() : context.invalidKeys();
  if (invalidKeys.length) {
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
    message = "Failed validation";
  }
  message = `${message} ${appendToMessage}`.trim();
  const error = new Error(message);
  error.invalidKeys = invalidKeys;
  error.validationContext = context;
  // If on the server, we add a sanitized error, too, in case we're
  // called from a method.
  if (Meteor.isServer) {
    error.sanitizedError = new Meteor.Error(400, message, EJSON.stringify(error.invalidKeys));
  }
  return error;
}

function addUniqueError(context, errorMessage) {
  var name = errorMessage.split('c2_')[1].split(' ')[0];
  var val = errorMessage.split('dup key:')[1].split('"')[1];

  var addValidationErrorsPropName = (typeof context.addValidationErrors === 'function') ? 'addValidationErrors' : 'addInvalidKeys';
  context[addValidationErrorsPropName]([{
    name: name,
    type: 'notUnique',
    value: val
  }]);
}

function wrapCallbackForParsingMongoValidationErrors(validationContext, cb) {
  return function wrappedCallbackForParsingMongoValidationErrors(...args) {
    const error = args[0];
    if (error &&
        ((error.name === "MongoError" && error.code === 11001) || error.message.indexOf('MongoError: E11000' !== -1)) &&
        error.message.indexOf('c2_') !== -1) {
      addUniqueError(validationContext, error.message);
      args[0] = getErrorObject(validationContext);
    }
    return cb.apply(this, args);
  };
}

function wrapCallbackForParsingServerErrors(validationContext, cb) {
  var addValidationErrorsPropName = (typeof validationContext.addValidationErrors === 'function') ? 'addValidationErrors' : 'addInvalidKeys';
  return function wrappedCallbackForParsingServerErrors(...args) {
    const error = args[0];
    // Handle our own validation errors
    if (error instanceof Meteor.Error &&
        error.error === 400 &&
        error.reason === "INVALID" &&
        typeof error.details === "string") {
      var invalidKeysFromServer = EJSON.parse(error.details);
      validationContext[addValidationErrorsPropName](invalidKeysFromServer);
      args[0] = getErrorObject(validationContext);
    }
    // Handle Mongo unique index errors, which are forwarded to the client as 409 errors
    else if (error instanceof Meteor.Error &&
             error.error === 409 &&
             error.reason &&
             error.reason.indexOf('E11000') !== -1 &&
             error.reason.indexOf('c2_') !== -1) {
      addUniqueError(validationContext, error.reason);
      args[0] = getErrorObject(validationContext);
    }
    return cb.apply(this, args);
  };
}

var alreadyInsecure = {};
function keepInsecure(c) {
  // If insecure package is in use, we need to add allow rules that return
  // true. Otherwise, it would seemingly turn off insecure mode.
  if (Package && Package.insecure && !alreadyInsecure[c._name]) {
    c.allow({
      insert: function() {
        return true;
      },
      update: function() {
        return true;
      },
      remove: function () {
        return true;
      },
      fetch: [],
      transform: null
    });
    alreadyInsecure[c._name] = true;
  }
  // If insecure package is NOT in use, then adding the two deny functions
  // does not have any effect on the main app's security paradigm. The
  // user will still be required to add at least one allow function of her
  // own for each operation for this collection. And the user may still add
  // additional deny functions, but does not have to.
}

var alreadyDefined = {};
function defineDeny(c, options) {
  if (!alreadyDefined[c._name]) {

    var isLocalCollection = (c._connection === null);

    // First define deny functions to extend doc with the results of clean
    // and auto-values. This must be done with "transform: null" or we would be
    // extending a clone of doc and therefore have no effect.
    c.deny({
      insert: function(userId, doc) {
        // Referenced doc is cleaned in place
        c.simpleSchema(doc).clean(doc, {
          mutate: true,
          isModifier: false,
          // We don't do these here because they are done on the client if desired
          filter: false,
          autoConvert: false,
          removeEmptyStrings: false,
          trimStrings: false,
          extendAutoValueContext: {
            isInsert: true,
            isUpdate: false,
            isUpsert: false,
            userId: userId,
            isFromTrustedCode: false,
            docId: doc._id,
            isLocalCollection: isLocalCollection
          }
        });

        return false;
      },
      update: function(userId, doc, fields, modifier) {
        // Referenced modifier is cleaned in place
        c.simpleSchema(modifier).clean(modifier, {
          mutate: true,
          isModifier: true,
          // We don't do these here because they are done on the client if desired
          filter: false,
          autoConvert: false,
          removeEmptyStrings: false,
          trimStrings: false,
          extendAutoValueContext: {
            isInsert: false,
            isUpdate: true,
            isUpsert: false,
            userId: userId,
            isFromTrustedCode: false,
            docId: doc && doc._id,
            isLocalCollection: isLocalCollection
          }
        });

        return false;
      },
      fetch: ['_id'],
      transform: null
    });

    // Second define deny functions to validate again on the server
    // for client-initiated inserts and updates. These should be
    // called after the clean/auto-value functions since we're adding
    // them after. These must *not* have "transform: null" if options.transform is true because
    // we need to pass the doc through any transforms to be sure
    // that custom types are properly recognized for type validation.
    c.deny({
      insert: function(userId, doc) {
        // We pass the false options because we will have done them on client if desired
        doValidate(
          c,
          "insert",
          [
            doc,
            {
              trimStrings: false,
              removeEmptyStrings: false,
              filter: false,
              autoConvert: false
            },
            function(error) {
              if (error) {
                throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
              }
            }
          ],
          false, // getAutoValues
          userId,
          false // isFromTrustedCode
        );

        return false;
      },
      update: function(userId, doc, fields, modifier) {
        // NOTE: This will never be an upsert because client-side upserts
        // are not allowed once you define allow/deny functions.
        // We pass the false options because we will have done them on client if desired
        doValidate(
          c,
          "update",
          [
            {_id: doc && doc._id},
            modifier,
            {
              trimStrings: false,
              removeEmptyStrings: false,
              filter: false,
              autoConvert: false
            },
            function(error) {
              if (error) {
                throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
              }
            }
          ],
          false, // getAutoValues
          userId,
          false // isFromTrustedCode
        );

        return false;
      },
      fetch: ['_id'],
      ...(options.transform === true ? {} : {transform: null}),
    });

    // note that we've already done this collection so that we don't do it again
    // if attachSchema is called again
    alreadyDefined[c._name] = true;
  }
}

export default Collection2;
