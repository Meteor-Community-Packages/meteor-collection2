// Extend the schema options allowed by SimpleSchema
SimpleSchema.extendOptions({
  index: Match.Optional(Match.OneOf(Number, String, Boolean)),
  unique: Match.Optional(Boolean),
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
 * @param {SimpleSchema|Object} ss - SimpleSchema instance or a schema definition object from which to create a new SimpleSchema instance
 * @param {Object} [options]
 * @param {Boolean} [options.transform=false] Set to `true` if your document must be passed through the collection's transform to properly validate.
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

  // If we've already attached one schema, we combine both into a new schema unless options.replace =true
  if (self._c2._simpleSchema  && !options.replace) {
    ss = new SimpleSchema([self._c2._simpleSchema, ss]);
  }

  options = _.omit(options, "replace")

  // Track the schema in the collection
  self._c2._simpleSchema = ss;

  // Loop over fields definitions and ensure collection indexes (server side only)
  _.each(ss.schema(), function(definition, fieldName) {
    if (Meteor.isServer && ('index' in definition || definition.unique === true)) {
      
      function setUpIndex() {
        var index = {}, indexValue;
        // If they specified `unique: true` but not `index`, we assume `index: 1` to set up the unique index in mongo
        if ('index' in definition) {
          indexValue = definition['index'];
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
        var sparse = !!definition.optional && unique;
        if (indexValue !== false) {
          self._collection._ensureIndex(index, {
            background: true,
            name: indexName,
            unique: unique,
            sparse: sparse
          });
        } else {
          try {
            self._collection._dropIndex(indexName);
          } catch (err) {
            console.warn("Collection2: Tried to drop mongo index " + indexName + ", but there is no index with that name");
          }
        }
      }
      
      Meteor.startup(setUpIndex);
    }
  });

  // Set up additional checks
  ss.validator(function() {
    var test, totalUsing, totalWillUse, sel;
    var def = this.definition;
    var val = this.value;
    var op = this.operator;
    var key = this.key;

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



Mongo.Collection.prototype.simpleSchema = function c2SS() {
  var self = this;
  return self._c2 ? self._c2._simpleSchema : null;
};

// Wrap DB write operation methods
_.each(['insert', 'update', 'upsert'], function(methodName) {
  var _super = Mongo.Collection.prototype[methodName];
  Mongo.Collection.prototype[methodName] = function () {
    var self = this, args = _.toArray(arguments);
    if (self._c2) {
      args = doValidate.call(self, methodName, args, false,
        (Meteor.isClient && Meteor.userId && Meteor.userId()) || null, Meteor.isServer);
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

function doValidate(type, args, skipAutoValue, userId, isFromTrustedCode) {
  var self = this, schema = self._c2._simpleSchema,
      doc, callback, error, options, isUpsert, selector;

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

  } else if (type === "update" || type === "upsert") {
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

  // If update was called with upsert:true or upsert was called, flag as an upsert
  isUpsert = (type === "upsert" || (type === "update" && options.upsert === true));

  // Add a default callback function if we're on the client and no callback was given
  if (Meteor.isClient && !callback) {
    // Client can't block, so it can't report errors by exception,
    // only by callback. If they forget the callback, give them a
    // default one that logs the error, so they aren't totally
    // baffled if their writes don't work because their database is
    // down.
    callback = function(err) {
      if (err)
        Meteor._debug(type + " failed: " + (err.reason || err.stack));
    };
  }

  // If client validation is fine or is skipped but then something
  // is found to be invalid on the server, we get that error back
  // as a special Meteor.Error that we need to parse.
  if (Meteor.isClient) {
    var last = args.length - 1;
    if (typeof args[last] === 'function') {
      callback = args[last] = wrapCallbackForParsingServerErrors(self, options.validationContext, callback);
    }
  }

  // If _id has already been added, remove it temporarily if it's
  // not explicitly defined in the schema.
  var id;
  if (Meteor.isServer && doc._id && !schema.allowsKey("_id")) {
    id = doc._id;
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
      extendAutoValueContext: {
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert: isUpsert,
        userId: userId,
        isFromTrustedCode: isFromTrustedCode,
        docId: ((type === "update" || type === "upsert") && selector && selector._id) ? selector._id : void 0
      }
    });
  }
  
  // Preliminary cleaning on both client and server. On the server, automatic
  // values will also be set at this point.
  doClean(doc, (Meteor.isServer && !skipAutoValue), options.filter !== false, options.autoConvert !== false, options.removeEmptyStrings !== false, options.trimStrings !== false);

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
  }

  // Set automatic values for validation on the client.
  // On the server, we already updated doc with auto values, but on the client,
  // we will add them to docToValidate for validation purposes only.
  // This is because we want all actual values generated on the server.
  if (Meteor.isClient) {
    doClean(docToValidate, true, false, false, false, false);
  }

  // Validate doc
  var ctx = schema.namedContext(options.validationContext);
  var isValid;
  if (options.validate === false) {
    isValid = true;
  } else {
    isValid = ctx.validate(docToValidate, {
      modifier: (type === "update" || type === "upsert"),
      upsert: isUpsert,
      extendedCustomContext: {
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert: isUpsert,
        userId: userId,
        isFromTrustedCode: isFromTrustedCode,
        docId: ((type === "update" || type === "upsert") && selector && selector._id) ? selector._id : void 0
      }
    });
  }

  if (isValid) {
    // Add the ID back
    if (id) {
      doc._id = id;
    }
    // Update the args to reflect the cleaned doc
    if (type === "insert") {
      args[0] = doc;
    } else {
      args[1] = doc;
    }

    // If callback, set invalidKey when we get a mongo unique error
    if (Meteor.isServer) {
      var last = args.length - 1;
      if (typeof args[last] === 'function') {
        args[last] = wrapCallbackForParsingMongoValidationErrors(self, doc, options.validationContext, args[last]);
      }
    }
    return args;
  } else {
    error = getErrorObject(ctx);
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
  // If on the server, we add a sanitized error, too, in case we're
  // called from a method.
  if (Meteor.isServer) {
    error.sanitizedError = new Meteor.Error(400, message);
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

function wrapCallbackForParsingMongoValidationErrors(col, doc, vCtx, cb) {
  return function wrappedCallbackForParsingMongoValidationErrors(error) {
    if (error && ((error.name === "MongoError" && error.code === 11001) || error.message.indexOf('MongoError: E11000' !== -1)) && error.message.indexOf('c2_') !== -1) {
      var context = col.simpleSchema().namedContext(vCtx);
      addUniqueError(context, error.message);
      arguments[0] = getErrorObject(context);
    }
    return cb.apply(this, arguments);
  };
}

function wrapCallbackForParsingServerErrors(col, vCtx, cb) {
  return function wrappedCallbackForParsingServerErrors(error) {
    // Handle our own validation errors
    var context = col.simpleSchema().namedContext(vCtx);
    if (error instanceof Meteor.Error && error.error === 400 && error.reason === "INVALID" && typeof error.details === "string") {
      var invalidKeysFromServer = EJSON.parse(error.details);
      context.addInvalidKeys(invalidKeysFromServer);
      arguments[0] = getErrorObject(context);
    }
    // Handle Mongo unique index errors, which are forwarded to the client as 409 errors
    else if (error instanceof Meteor.Error && error.error === 409 && error.reason && error.reason.indexOf('E11000') !== -1 && error.reason.indexOf('c2_') !== -1) {
      addUniqueError(context, error.reason);
      arguments[0] = getErrorObject(context);
    }
    return cb.apply(this, arguments);
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
            isFromTrustedCode: false
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
            docId: doc && doc._id
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
        doValidate.call(c, "insert", [doc, {trimStrings: false, removeEmptyStrings: false, filter: false, autoConvert: false}, function(error) {
            if (error) {
              throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
            }
          }], true, userId, false);

        return false;
      },
      update: function(userId, doc, fields, modifier) {
        // NOTE: This will never be an upsert because client-side upserts
        // are not allowed once you define allow/deny functions.
        // We pass the false options because we will have done them on client if desired
        doValidate.call(c, "update", [{_id: doc && doc._id}, modifier, {trimStrings: false, removeEmptyStrings: false, filter: false, autoConvert: false}, function(error) {
            if (error) {
              throw new Meteor.Error(400, 'INVALID', EJSON.stringify(error.invalidKeys));
            }
          }], true, userId, false);

        return false;
      },
      fetch: ['_id']
    }, options.transform === true ? {} : {transform: null}));

    // note that we've already done this collection so that we don't do it again
    // if attachSchema is called again
    alreadyDefined[c._name] = true;
  }
}
