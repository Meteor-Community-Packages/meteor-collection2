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

var constructor = Meteor.Collection;
Meteor.Collection = function c2CollectionConstructor(name, options) {
  var self = this, ss;
  options = options || {};

  if (options.schema) {
    ss = options.schema;
    delete options.schema;
  }

  if (options.virtualFields) {
    throw new Error('Collection2: Sorry, the virtualFields option is no longer supported.');
  }

  // Call original Meteor.Collection constructor
  constructor.call(self, name, options);

  // Attach schema
  ss && self.attachSchema(ss);
};

// Make sure prototype and normal properties are kept
Meteor.Collection.prototype = constructor.prototype;

for (var prop in constructor) {
  if (constructor.hasOwnProperty(prop)) {
    Meteor.Collection[prop] = constructor[prop];
  }
}

if (Meteor.isServer) {
  // A function passed to Meteor.startup is only run on the server if
  // the process has not yet started up. So we need a flag to tell
  // us whether to wrap in Meteor.startup or not
  var hasStartedUp = false;
  Meteor.startup(function () {
    hasStartedUp = true;
  });
}

/**
 * Meteor.Collection.prototype.attachSchema
 * @param  {SimpleSchema|Object} ss - SimpleSchema instance or a schema definition object from which to create a new SimpleSchema instance
 * @return {undefined}
 *
 * Use this method to attach a schema to a collection created by another package,
 * such as Meteor.users. It is most likely unsafe to call this method more than
 * once for a single collection, or to call this for a collection that had a
 * schema object passed to its constructor.
 */
Meteor.Collection.prototype.attachSchema = function c2AttachSchema(ss) {
  var self = this;

  if (!(ss instanceof SimpleSchema)) {
    ss = new SimpleSchema(ss);
  }

  self._c2 = {};
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
      
      if (hasStartedUp) {
        setUpIndex();
      } else {
        Meteor.startup(setUpIndex);
      }

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

  // First define deny functions to extend doc with the results of clean
  // and autovalues. This must be done with "transform: null" or we would be
  // extending a clone of doc and therefore have no effect.
  self.deny({
    insert: function(userId, doc) {
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
        // We don't remove empty string here; they are removed on client if desired
        removeEmptyStrings: false,
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

      // Referenced modifier is cleaned in place
      ss.clean(modifier, {
        isModifier: true,
        // We don't remove empty string here; they are removed on client if desired
        removeEmptyStrings: false,
        extendAutoValueContext: {
          isInsert: false,
          isUpdate: true,
          isUpsert: false,
          userId: userId,
          isFromTrustedCode: false
        }
      });

      return false;
    },
    fetch: [],
    transform: null
  });

  // Second define deny functions to validate again on the server
  // for client-initiated inserts and updates. These should be
  // called after the clean/autovalue functions since we're adding
  // them after. These must *not* have "transform: null" because
  // we need to pass the doc through any transforms to be sure
  // that custom types are properly recognized for type validation.
  self.deny({
    insert: function(userId, doc) {
      // We pass removeEmptyStrings: false because we will have removed on client if desired
      doValidate.call(self, "insert", [doc, {removeEmptyStrings: false}, function(error) {
          if (error) {
            throw new Meteor.Error(400, 'Bad Request', "INVALID: " + EJSON.stringify(error.invalidKeys));
          }
        }], true, userId, false);

      return false;
    },
    update: function(userId, doc, fields, modifier) {
      // NOTE: This will never be an upsert because client-side upserts
      // are not allowed once you define allow/deny functions.
      // We pass removeEmptyStrings: false because we will have removed on client if desired
      doValidate.call(self, "update", [null, modifier, {removeEmptyStrings: false}, function(error) {
          if (error) {
            throw new Meteor.Error(400, 'Bad Request', "INVALID: " + EJSON.stringify(error.invalidKeys));
          }
        }], true, userId, false);

      return false;
    },
    fetch: []
  });

  // If insecure package is in use, we need to add allow rules that return
  // true. Otherwise, it would seemingly turn off insecure mode.
  if (Package && Package.insecure) {
    self.allow({
      insert: function() {
        return true;
      },
      update: function() {
        return true;
      },
      fetch: [],
      transform: null
    });
  }
  // If insecure package is NOT in use, then adding the two deny functions
  // does not have any effect on the main app's security paradigm. The
  // user will still be required to add at least one allow function of her
  // own for each operation for this collection. And the user may still add
  // additional deny functions, but does not have to.
};

Meteor.Collection.prototype.simpleSchema = function c2SS() {
  var self = this;
  return self._c2 ? self._c2._simpleSchema : null;
};

// Wrap DB write operation methods
_.each(['insert', 'update', 'upsert'], function(methodName) {
  var _super = Meteor.Collection.prototype[methodName];
  Meteor.Collection.prototype[methodName] = function () {
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

  if (options.validate === false) {
    return args;
  }

  // If _id has already been added, remove it temporarily if it's
  // not explicitly defined in the schema.
  var id;
  if (Meteor.isServer && doc._id && !schema.allowsKey("_id")) {
    id = doc._id;
    delete doc._id;
  }

  function doClean(docToClean, getAutoValues, filter, autoConvert, removeEmptyStrings) {
    // Clean the doc/modifier in place (removes any virtual fields added
    // by the deny transform, too)
    schema.clean(docToClean, {
      filter: filter,
      autoConvert: autoConvert,
      getAutoValues: getAutoValues,
      isModifier: (type !== "insert"),
      removeEmptyStrings: removeEmptyStrings,
      extendAutoValueContext: {
        isInsert: (type === "insert"),
        isUpdate: (type === "update" && options.upsert !== true),
        isUpsert: isUpsert,
        userId: userId,
        isFromTrustedCode: isFromTrustedCode
      }
    });
  }
  
  // Preliminary cleaning on both client and server. On the server, automatic
  // values will also be set at this point.
  doClean(doc, (Meteor.isServer && !skipAutoValue), true, true, options.removeEmptyStrings !== false);

  // On the server, upserts are possible; SimpleSchema handles upserts pretty
  // well by default, but it will not know about the fields in the selector,
  // which are also stored in the database if an insert is performed. So we
  // will allow these fields to be considered for validation by adding them
  // to the $set in the modifier. This is no doubt prone to errors, but there
  // probably isn't any better way right now.
  var docToValidate = _.clone(doc);
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
    doClean(docToValidate, true, false, false, false);
  }

  // Validate doc
  var ctx = schema.namedContext(options.validationContext);
  var isValid = ctx.validate(docToValidate, {
    modifier: (type === "update" || type === "upsert"),
    upsert: isUpsert,
    extendedCustomContext: {
      isInsert: (type === "insert"),
      isUpdate: (type === "update" && options.upsert !== true),
      isUpsert: isUpsert,
      userId: userId,
      isFromTrustedCode: isFromTrustedCode
    }
  });

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
    var invalidKeys = ctx.invalidKeys();
    var message = "failed validation";
    if (invalidKeys.length) {
      var badKey = invalidKeys[0].name;
      message += ": " + badKey + ": " + ctx.keyErrorMessage(badKey);
    }
    error = new Error(message);
    error.invalidKeys = invalidKeys;
    if (callback) {
      // insert/update/upsert pass `false` when there's an error, so we do that
      callback(error, false);
    } else {
      throw error;
    }
  }
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
      addUniqueError(col.simpleSchema().namedContext(vCtx), error.message);
    }
    return cb.apply(this, arguments);
  };
}

function wrapCallbackForParsingServerErrors(col, vCtx, cb) {
  return function wrappedCallbackForParsingServerErrors(error) {
    // Handle our own validation errors
    var context = col.simpleSchema().namedContext(vCtx);
    if (error instanceof Meteor.Error && error.error === 400 && error.details && error.details.slice(0, 8) === "INVALID:") {
      var invalidKeysFromServer = EJSON.parse(error.details.slice(9));
      context.addInvalidKeys(invalidKeysFromServer);
    }
    // Handle Mongo unique index errors, which are forwarded to the client as 409 errors
    else if (error instanceof Meteor.Error && error.error === 409 && error.reason && error.reason.indexOf('E11000') !== -1 && error.reason.indexOf('c2_') !== -1) {
      addUniqueError(context, error.reason);
    }
    return cb.apply(this, arguments);
  };
}

// Meteor.Collection2 is deprecated
Meteor.Collection2 = function () {
  throw new Error("Collection2: Doing `new Meteor.Collection2` no longer works. Just use a normal `new Meteor.Collection` call.");
};