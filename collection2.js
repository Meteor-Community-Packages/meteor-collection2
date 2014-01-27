// Extend the schema options allowed by SimpleSchema
SimpleSchema.extendOptions({
  index: Match.Optional(Match.OneOf(Number, String, Boolean)),
  unique: Match.Optional(Boolean),
  autoValue: Match.Optional(Function),
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
Meteor.Collection = function(name, options) {
  var self = this, ss;
  options = options || {};

  if (options.schema) {
    ss = options.schema;
    delete options.schema;
  }

  // Set up virtual fields by adding or augmenting the transform
  // before calling the constructor
  if (options.virtualFields) {
    options.transform = (function(userTransform, virtualFields) {
      return function(doc) {
        //add all virtual fields to document whenever it's passed to a callback
        _.each(virtualFields, function(func, fieldName) {
          doc[fieldName] = func(doc);
        });
        //support user-supplied transformation function as well
        return userTransform ? userTransform(doc) : doc;
      }
    })(options.transform, options.virtualFields);
    delete options.virtualFields;
  }

  // Call original Meteor.Collection constructor
  constructor.call(self, name, options);

  if (ss) {
    if (!(ss instanceof SimpleSchema)) {
      ss = new SimpleSchema(ss);
    }

    self._c2 = {};
    self._c2._simpleSchema = ss;

    // Loop over fields definitions and:
    // * Populate a list of autoValue functions
    // * Ensure collection indexes (server side only)
    self._c2._autoValues = {};
    _.each(ss.schema(), function(definition, fieldName) {
      if ('autoValue' in definition) {
        self._c2._autoValues[fieldName] = definition.autoValue;
      }

      if (Meteor.isServer && 'index' in definition) {
        Meteor.startup(function() {
          index = {};
          var indexValue = definition['index'];
          var indexName = 'c2_' + fieldName;
          if (indexValue === true)
            indexValue = 1;
          index[fieldName] = indexValue;
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
              console.warn(indexName + " index does not exist.");
            }
          }
        });
      }
    });

    // Set up additional checks
    ss.validator(function(key, val, def, op) {
      var test, totalUsing, totalWillUse, sel;

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

      // If a developer wants to ensure that a field is `unique` we do a custom
      // query to verify that another field with the same value does not exist.
      if (def.unique) {
        // If the value is not set we skip this test for performance reasons. The
        // authorization is exclusively determined by the `optional` parameter.
        if (val === void 0 || val === null)
          return true;

        // On the server if the field also have an index we rely on MongoDB to do
        // this verification -- which is a more efficient strategy.
        if (Meteor.isServer && [1, -1, true].indexOf(def.index) !== -1)
          return true;

        test = {};
        test[key] = val;
        if (op && op !== "$inc") { //updating
          sel = _.clone(self._c2._selector);
          if (!sel) {
            return true; //we can't determine whether we have a notUnique error
          } else if (typeof sel === "string") {
            sel = {_id: sel};
          }

          // Find count of docs where this key is already set to this value
          totalUsing = self.find(test).count();

          // Find count of docs that will be updated, where key
          // is not already equal to val
          // TODO this will overwrite if key is in selector already;
          // need more advanced checking
          sel[key] = {};
          sel[key]["$ne"] = val;
          totalWillUse = self.find(sel).count();

          // If more than one would have the val after update, it's not unique
          return totalUsing + totalWillUse > 1 ? "notUnique" : true;
        } else {
          return self.findOne(test) ? "notUnique" : true;
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
        
        var newDoc = ss.clean(doc);
        newDoc = getAutoValues.call(self, newDoc, "insert", userId);
        // Update doc to reflect cleaning, autoValues, etc.
        _.extend(doc, newDoc);
        // In case the call to getAutoValues removed anything, remove
        // it from doc, too (TODO: should be recursive? better yet, clean
        // and getAutoValues should modify directly by reference)
        _.each(doc, function(val, key) {
          if (!(key in newDoc)) {
            delete doc[key];
          }
        });
        
        // Add the ID back
        if (id) {
          doc._id = id;
        }
        
        return false;
      },
      update: function(userId, doc, fields, modifier) {
        var newDoc = ss.clean(modifier);
        newDoc = getAutoValues.call(self, newDoc, "update", userId);
        // Update doc to reflect cleaning, autoValues, etc.
        _.extend(modifier, newDoc);
        // In case the call to getAutoValues removed anything, remove
        // it from doc, too (TODO: should be recursive? better yet, clean
        // and getAutoValues should modify directly by reference)
        _.each(modifier, function(val, key) {
          if (!(key in newDoc)) {
            delete doc[key];
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
        var ret = false;
        doValidate.call(self, "insert", [doc, {}, function(error) {
            if (error) {
              ret = true;
            }
          }], true);

        return ret;
      },
      update: function(userId, doc, fields, modifier) {
        // NOTE: This will never be an upsert because client-side upserts
        // are not allowed once you define allow/deny functions
        var ret = false;

        doValidate.call(self, "update", [null, modifier, {}, function(error) {
            if (error) {
              ret = true;
            }
          }], true);

        return ret;
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
  }
};

// Make sure prototype and normal properties are kept
Meteor.Collection.prototype = constructor.prototype;

for (var prop in constructor) {
  if (constructor.hasOwnProperty(prop)) {
    Meteor.Collection[prop] = constructor[prop];
  }
}

Meteor.Collection.prototype.simpleSchema = function() {
  var self = this;
  return self._c2 ? self._c2._simpleSchema : null;
};

var origInsert = Meteor.Collection.prototype.insert;
Meteor.Collection.prototype.insert = function() {
  var self = this, args = _.toArray(arguments);
  if (self._c2) {
    args = doValidate.call(self, "insert", args);
    if (!args) {
      //doValidate already called the callback or threw the error
      return;
    }
  }
  return origInsert.apply(self, args);
};

var origUpdate = Meteor.Collection.prototype.update;
Meteor.Collection.prototype.update = function() {
  var self = this, args = _.toArray(arguments);
  if (self._c2) {
    args = doValidate.call(self, "update", args);
    if (!args) {
      //doValidate already called the callback or threw the error
      return;
    }
  }
  return origUpdate.apply(self, args);
};

var origUpsert = Meteor.Collection.prototype.upsert;
Meteor.Collection.prototype.upsert = function() {
  var self = this, args = _.toArray(arguments);
  if (self._c2) {
    args = doValidate.call(self, "upsert", args);
    if (!args) {
      //doValidate already called the callback or threw the error
      return;
    }
  }
  return origUpsert.apply(self, args);
};

/*
 * Private
 */

var doValidate = function(type, args, skipAutoValue) {
  var self = this,
          schema = self._c2._simpleSchema,
          doc, callback, error, options, isUpsert;

  if (!args.length) {
    throw new Error(type + " requires an argument");
  }

  // Gather arguments and cache the selector
  self._c2._selector = null; //reset
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
    self._c2._selector = args[0];
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

  if (options.validate === false) {
    return args;
  }

  // If update was called with upsert:true or upsert was called, flag as an upsert
  isUpsert = (type === "upsert" || (type === "update" && options.upsert === true));

  // Remove the options from insert now that we're done with them;
  // the real insert does not have an options argument
  if (type === "insert" && args[1] !== void 0 && !(typeof args[1] === "function")) {
    args.splice(1, 1);
  }

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

  // If _id has already been added, remove it temporarily if it's
  // not explicitly defined in the schema.
  var id;
  if (Meteor.isServer && doc._id && !schema.allowsKey("_id")) {
    id = doc._id;
    delete doc._id;
  }

  // Clean the doc (removes any virtual fields added by the deny transform, too)
  doc = schema.clean(doc);

  // Set automatic values
  // On the server, we actually update the doc, but on the client,
  // we will add them to docToValidate for validation purposes only.
  // This is because we want all actual values generated on the server.
  if (Meteor.isServer && !skipAutoValue) {
    doc = getAutoValues.call(self, doc, (isUpsert ? "upsert" : type), null);
  }

  // On the server, upserts are possible; SimpleSchema handles upserts pretty
  // well by default, but it will not know about the fields in the selector,
  // which are also stored in the database if an insert is performed. So we
  // will allow these fields to be considered for validation by adding them
  // to the $set in the modifier. This is no doubt prone to errors, but there
  // probably isn't any better way right now.
  var docToValidate = _.clone(doc);
  if (Meteor.isServer && isUpsert && _.isObject(self._c2._selector)) {
    var set = docToValidate.$set || {};
    docToValidate.$set = _.clone(self._c2._selector);
    _.extend(docToValidate.$set, set);
  }

  // Set automatic values for validation on the client
  if (Meteor.isClient) {
    docToValidate = getAutoValues.call(self, docToValidate, (isUpsert ? "upsert" : type), (Meteor.userId && Meteor.userId()) || null);
  }

  // Validate doc
  var ctx = schema.namedContext(options.validationContext);
  var isValid = ctx.validate(docToValidate, {
    modifier: (type === "update" || type === "upsert"),
    upsert: isUpsert
  });

  // Clear the cached selector since it is only used during validation
  self._c2._selector = null;

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
    return args;
  } else {
    var invalidKeys = ctx.invalidKeys();
    var message = "failed validation";
    if (invalidKeys.length) {
      var badKey = invalidKeys[0].name;
      message += ": " + badKey + ": " + ctx.keyErrorMessage(badKey);
    }
    error = new Error(message);
    if (callback) {
      callback(error);
    } else {
      throw error;
    }
  }
};

// Updates doc with automatic values from autoValue functions
var getAutoValues = function(doc, type, userId) {
  var self = this;
  var mDoc = new MongoObject(doc, self.simpleSchema()._blackboxKeys);
  _.each(self._c2._autoValues, function(func, fieldName) {
    var keyInfo = mDoc.getArrayInfoForKey(fieldName) || mDoc.getInfoForKey(fieldName) || {};
    var doUnset = false;
    var autoValue = func.call({
      isInsert: (type === "insert"),
      isUpdate: (type === "update"),
      isUpsert: (type === "upsert"),
      userId: userId,
      isSet: mDoc.affectsGenericKey(fieldName),
      unset: function() {
        doUnset = true;
      },
      value: keyInfo.value,
      operator: keyInfo.operator,
      field: function(fName) {
        var keyInfo = mDoc.getArrayInfoForKey(fName) || mDoc.getInfoForKey(fName) || {};
        return {
          isSet: (keyInfo.value !== void 0),
          value: keyInfo.value,
          operator: keyInfo.operator
        };
      }
    }, doc);

    if (autoValue === void 0) {
      doUnset && mDoc.removeKey(fieldName);
      return;
    }

    var fieldNameHasDollar = (fieldName.indexOf(".$") !== -1);
    var newValue = autoValue;
    var op = null;
    if (_.isObject(autoValue)) {
      for (var key in autoValue) {
        if (autoValue.hasOwnProperty(key) && key.substring(0, 1) === "$") {
          if (fieldNameHasDollar) {
            throw new Error("The return value of an autoValue function may not be an object with update operators when the field name contains a dollar sign");
          }
          op = key;
          newValue = autoValue[key];
          break;
        }
      }
    }

    // Add $set for updates and upserts if necessary
    if (op === null && type !== "insert") {
      op = "$set";
    }

    if (fieldNameHasDollar) {
      // There is no way to know which specific keys should be set to
      // the autoValue, so we will set only keys that exist
      // in the object and match this generic key.
      mDoc.setValueForGenericKey(fieldName, newValue);
    } else {
      mDoc.removeKey(fieldName);
      mDoc.addKey(fieldName, newValue, op);
    }
  });
  return mDoc.getObject();
};

// Backwards compatibility; Meteor.Collection2 is deprecated
Meteor.Collection2 = Meteor.Collection;
