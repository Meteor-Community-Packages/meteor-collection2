/* global Meteor, _, SimpleSchema, Mongo:true, Match, Package, EJSON */

// Extend the schema options allowed by SimpleSchema
SimpleSchema.extendOptions({
  index: Match.Optional(Match.OneOf(Number, String, Boolean)),
  unique: Match.Optional(Boolean),
  sparse: Match.Optional(Boolean),
  denyInsert: Match.Optional(Boolean),
  denyUpdate: Match.Optional(Boolean)
});

// Define some extra validation error messages
SimpleSchema.messages({
  notUnique: "[label] must be unique",
  insertNotAllowed: "[label] cannot be set during an insert",
  updateNotAllowed: "[label] cannot be set during an update"
});

/*
 * Public API
 */

// backwards compatibility
if (typeof Mongo === "undefined") {
  Mongo = {};
  Mongo.Collection = Meteor.Collection;
}

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
  var self = this;
  options = options || {};

  if (!(ss instanceof SimpleSchema)) {
    ss = new SimpleSchema(ss);
  }

  self._c2 = self._c2 || {};

  // If we've already attached one schema, we combine both into a new schema unless options.replace is `true`
  if (self._c2._simpleSchema && options.replace !== true) {
    ss = new SimpleSchema([self._c2._simpleSchema, ss]);
  }

  // Track the schema in the collection
  self._c2._simpleSchema = ss;

  if (self._collection instanceof LocalCollection) {
    self._collection._c2 = self._collection._c2 || {};
    self._collection._c2._simpleSchema = ss;
  }

  function ensureIndex(c, index, indexName, unique, sparse) {
    Meteor.startup(function () {
      c._collection._ensureIndex(index, {
        background: true,
        name: indexName,
        unique: unique,
        sparse: sparse
      });
    });
  }

  function dropIndex(c, indexName) {
    Meteor.startup(function () {
      try {
        c._collection._dropIndex(indexName);
      } catch (err) {
        // no index with that name, which is what we want
      }
    });
  }

  // Loop over fields definitions and ensure collection indexes (server side only)
  if (Meteor.isServer) {
    _.each(ss.schema(), function(definition, fieldName) {
      if ('index' in definition || definition.unique === true) {
        var index = {}, indexValue;
        // If they specified `unique: true` but not `index`,
        // we assume `index: 1` to set up the unique index in mongo
        if ('index' in definition) {
          indexValue = definition.index;
          if (indexValue === true) {
            indexValue = 1;
          }
        } else {
          indexValue = 1;
        }
        var indexName = 'c2_' + fieldName;
        // In the index object, we want object array keys without the ".$" piece
        var idxFieldName = fieldName.replace(/\.\$\./g, ".");
        index[idxFieldName] = indexValue;
        var unique = !!definition.unique && (indexValue === 1 || indexValue === -1);
        var sparse = definition.sparse || false;

        // If unique and optional, force sparse to prevent errors
        if (!sparse && unique && definition.optional) {
          sparse = true;
        }

        if (indexValue === false) {
          dropIndex(self, indexName);
        } else {
          ensureIndex(self, index, indexName, unique, sparse);
        }
      }
    });
  }

  // Set up additional checks
  ss.validator(function() {
    var def = this.definition;
    var val = this.value;
    var op = this.operator;

    if (def.denyInsert && val !== void 0 && !op) {
      // This is an insert of a defined value into a field where denyInsert=true
      return "insertNotAllowed";
    }

    if (def.denyUpdate && op) {
      // This is an insert of a defined value into a field where denyUpdate=true
      if (op !== "$set" || (op === "$set" && val !== void 0)) {
        return "updateNotAllowed";
      }
    }

    return true;
  });

  defineDeny(self, options);
  keepInsecure(self);
};

_.each([Mongo.Collection, LocalCollection], function (obj) {
  obj.prototype.simpleSchema = function () {
    var self = this;
    return self._c2 ? self._c2._simpleSchema : null;
  };
});

// Wrap DB write operation methods
_.each(['insert', 'update'], function(methodName) {
    var _super = Mongo.Collection.prototype[methodName];
    Mongo.Collection.prototype[methodName] = function() {
        var self = this,
            args = _.toArray(arguments);
        if (self._c2) {

            var userId = null;
            try { // https://github.com/aldeed/meteor-collection2/issues/175
                userId = Meteor.userId();
            } catch (err) {}

            args = doValidate.call(
              self,
              methodName,
              args,
              true, // getAutoValues
              userId,
              Meteor.isServer // isFromTrustedCode
            );
            if (!args) {
                // doValidate already called the callback or threw the error
                if (methodName === "insert") {
                    // insert should always return an ID to match core behavior
                    return self._makeNewID();
                } else {
                    return;
                }
            }
        }
        return _super.apply(self, args);
    };
});

/*
 * Private
 */

function doValidate(type, args, getAutoValues, userId, isFromTrustedCode) {
  var self = this, doc, callback, error, options, isUpsert, selector, last, hasCallback;

  var schema = self.simpleSchema();
  var isLocalCollection = (self._connection === null);

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
  if (doc._id && !schema.allowsKey("_id")) {
    cachedId = doc._id;
    delete doc._id;
  }

  function doClean(docToClean, getAutoValues, filter, autoConvert, removeEmptyStrings, trimStrings) {
    // Clean the doc/modifier in place
    schema.clean(docToClean, {
      filter: filter,
      autoConvert: autoConvert,
      getAutoValues: getAutoValues,
      isModifier: (type !== "insert"),
      removeEmptyStrings: removeEmptyStrings,
      trimStrings: trimStrings,
      extendAutoValueContext: _.extend({
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert: isUpsert,
        userId: userId,
        isFromTrustedCode: isFromTrustedCode,
        docId: docId,
        isLocalCollection: isLocalCollection
      }, options.extendAutoValueContext || {})
    });
  }

  // Preliminary cleaning on both client and server. On the server and for local
  // collections, automatic values will also be set at this point.
  doClean(
    doc,
    getAutoValues,
    options.filter !== false,
    options.autoConvert !== false,
    options.removeEmptyStrings !== false,
    options.trimStrings !== false
  );

  // We clone before validating because in some cases we need to adjust the
  // object a bit before validating it. If we adjusted `doc` itself, our
  // changes would persist into the database.
  var docToValidate = {};
  for (var prop in doc) {
    // We omit prototype properties when cloning because they will not be valid
    // and mongo omits them when saving to the database anyway.
    if (doc.hasOwnProperty(prop)) {
      docToValidate[prop] = doc[prop];
    }
  }

  // On the server, upserts are possible; SimpleSchema handles upserts pretty
  // well by default, but it will not know about the fields in the selector,
  // which are also stored in the database if an insert is performed. So we
  // will allow these fields to be considered for validation by adding them
  // to the $set in the modifier. This is no doubt prone to errors, but there
  // probably isn't any better way right now.
  if (Meteor.isServer && isUpsert && _.isObject(selector)) {
    var set = docToValidate.$set || {};
    docToValidate.$set = _.clone(selector);
    _.extend(docToValidate.$set, set);

    var addToSet = docToValidate.$addToSet;
    if (addToSet) {
      var addToSetArrays = {};
      for (var index in addToSet) {
        addToSetArrays[index] = [addToSet[index]];
      }
      _.extend(docToValidate.$set, addToSetArrays);
    }
  }

  // Set automatic values for validation on the client.
  // On the server, we already updated doc with auto values, but on the client,
  // we will add them to docToValidate for validation purposes only.
  // This is because we want all actual values generated on the server.
  if (Meteor.isClient && !isLocalCollection) {
    doClean(docToValidate, true, false, false, false, false);
  }

  // Validate doc
  var isValid;
  if (options.validate === false) {
    isValid = true;
  } else {
    isValid = validationContext.validate(docToValidate, {
      modifier: (type === "update" || type === "upsert"),
      upsert: isUpsert,
      extendedCustomContext: _.extend({
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert: isUpsert,
        userId: userId,
        isFromTrustedCode: isFromTrustedCode,
        docId: docId,
        isLocalCollection: isLocalCollection
      }, options.extendedCustomContext || {})
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
    error = getErrorObject(validationContext);
    if (callback) {
      // insert/update/upsert pass `false` when there's an error, so we do that
      callback(error, false);
    } else {
      throw error;
    }
  }
}

function getErrorObject(context) {
  var message, invalidKeys = context.invalidKeys();
  if (invalidKeys.length) {
    message = context.keyErrorMessage(invalidKeys[0].name);
  } else {
    message = "Failed validation";
  }
  var error = new Error(message);
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
  context.addInvalidKeys([{
    name: name,
    type: 'notUnique',
    value: val
  }]);
}

function wrapCallbackForParsingMongoValidationErrors(validationContext, cb) {
  return function wrappedCallbackForParsingMongoValidationErrors(error) {
    var args = _.toArray(arguments);
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
  return function wrappedCallbackForParsingServerErrors(error) {
    var args = _.toArray(arguments);
    // Handle our own validation errors
    if (error instanceof Meteor.Error &&
        error.error === 400 &&
        error.reason === "INVALID" &&
        typeof error.details === "string") {
      var invalidKeysFromServer = EJSON.parse(error.details);
      validationContext.addInvalidKeys(invalidKeysFromServer);
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

var alreadyInsecured = {};
function keepInsecure(c) {
  // If insecure package is in use, we need to add allow rules that return
  // true. Otherwise, it would seemingly turn off insecure mode.
  if (Package && Package.insecure && !alreadyInsecured[c._name]) {
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
    alreadyInsecured[c._name] = true;
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
    // and autovalues. This must be done with "transform: null" or we would be
    // extending a clone of doc and therefore have no effect.
    c.deny({
      insert: function(userId, doc) {
        var ss = c.simpleSchema();
        // If _id has already been added, remove it temporarily if it's
        // not explicitly defined in the schema.
        var id;
        if (Meteor.isServer && doc._id && !ss.allowsKey("_id")) {
          id = doc._id;
          delete doc._id;
        }

        // Referenced doc is cleaned in place
        ss.clean(doc, {
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
            docId: id,
            isLocalCollection: isLocalCollection
          }
        });

        // Add the ID back
        if (id) {
          doc._id = id;
        }

        return false;
      },
      update: function(userId, doc, fields, modifier) {
        var ss = c.simpleSchema();
        // Referenced modifier is cleaned in place
        ss.clean(modifier, {
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
    // called after the clean/autovalue functions since we're adding
    // them after. These must *not* have "transform: null" if options.transform is true because
    // we need to pass the doc through any transforms to be sure
    // that custom types are properly recognized for type validation.
    c.deny(_.extend({
      insert: function(userId, doc) {
        // We pass the false options because we will have done them on client if desired
        doValidate.call(
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
        doValidate.call(
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
      fetch: ['_id']
    }, options.transform === true ? {} : {transform: null}));

    // note that we've already done this collection so that we don't do it again
    // if attachSchema is called again
    alreadyDefined[c._name] = true;
  }
}
