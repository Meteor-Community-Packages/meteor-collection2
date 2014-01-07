// Extend the schema options allowed by SimpleSchema
SimpleSchema.extendOptions({
  unique: Match.Optional(Boolean),
  autoValue: Match.Optional(Function),
  denyInsert: Match.Optional(Boolean),
  denyUpdate: Match.Optional(Boolean)
});

/*
 * Public API
 */

var constructor = Meteor.Collection;
Meteor.Collection = function(name, options) {
  var self = this, userTransform, ss;
  options = options || {};

  if (options.schema) {
    ss = options.schema;
    delete options.schema;
  }

  // Set up virtual fields by adding or augmenting the transform
  // before calling the constructor
  if (options.virtualFields) {
    userTransform = options.transform;
    options.transform = function(doc) {
      //add all virtual fields to document whenever it's passed to a callback
      _.each(options.virtualFields, function(func, fieldName) {
        doc[fieldName] = func(doc);
      });
      //support user-supplied transformation function as well
      return userTransform ? userTransform(doc) : doc;
    };
    delete options.virtualFields;
  }

  // Call original Meteor.Collection constructor
  constructor.call(self, name, options);

  if (ss) {
    if (!(ss instanceof SimpleSchema)) {
      throw new Error("The schema option for Meteor.Collection must be an instance of SimpleSchema");
    }

    self._c2 = {};
    self._c2._simpleSchema = ss;

    // Populate a list of autoValue functions
    self._c2._autoValues = {};
    _.each(ss.schema(), function(definition, fieldName) {
      if ('autoValue' in definition) {
        self._c2._autoValues[fieldName] = definition.autoValue;
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

      if ((val === void 0 || val === null) && def.optional) {
        return true;
      }

      if (def.unique) {
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

    // Extend server insert/update/upsert methods to validate before
    // taking action
    Meteor.isServer && _.each(methods, function(method, name) {
      var _super = self._collection[name];
      self._collection[name] = function() {
        return method.call(self, _super, _.toArray(arguments));
      };
    });
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
  return this._c2._simpleSchema;
};

if (Meteor.isClient) {

  var origInsert = Meteor.Collection.prototype.insert;
  Meteor.Collection.prototype.insert = function() {
    var self = this, args = _.toArray(arguments);
    args = doValidate.call(self, "insert", args);
    if (args) {
      return origInsert.apply(self, args);
    }
  };

  var origUpdate = Meteor.Collection.prototype.update;
  Meteor.Collection.prototype.update = function() {
    var self = this, args = _.toArray(arguments);
    args = doValidate.call(self, "update", args);
    if (args) {
      return origUpdate.apply(self, args);
    }
  };

  var origUpsert = Meteor.Collection.prototype.upsert;
  Meteor.Collection.prototype.upsert = function() {
    var self = this, args = _.toArray(arguments);
    args = doValidate.call(self, "upsert", args);
    if (args) {
      return origUpsert.apply(self, args);
    }
  };

}

/*
 * Private
 */

if (Meteor.isServer) {
  var methods = {
    insert: function(_super, args) {
      var self = this;
      args = doValidate.call(self, "insert", args);
      if (args) {
        return _super.apply(self._collection, args);
      }
    },
    update: function(_super, args) {
      var self = this;
      args = doValidate.call(self, "update", args);
      if (args) {
        return _super.apply(self._collection, args);
      }
    },
    upsert: function(_super, args) {
      if (!_super) {
        throw new Error("Meteor 0.6.6 or higher is required to do an upsert");
      }
      var self = this;
      args = doValidate.call(self, "upsert", args);
      if (args) {
        return _super.apply(self._collection, args);
      }
    }
  };
}

var doValidate = function(type, args) {
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
  
  // Clean the doc
  doc = schema.clean(doc);

  // Set automatic values
  // On the server, we actually update the doc, but on the client,
  // we will add them to docToValidate for validation purposes only.
  // This is because we want all actual values generated on the server.
  if (Meteor.isServer) {
    doc = getAutoValues.call(self, doc, (isUpsert ? "upsert" : type));
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
    docToValidate = getAutoValues.call(self, docToValidate, (isUpsert ? "upsert" : type));
  }

  // Validate doc
  var isValid = schema.namedContext(options.validationContext).validate(docToValidate, {
    modifier: (type === "update" || type === "upsert"),
    upsert: isUpsert,
    // Skip filter and autoconvert because we already called clean()
    filter: false,
    autoConvert: false
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
    error = new Error("failed validation");
    if (callback) {
      callback(error);
    } else {
      throw error;
    }
  }
};

// Updates doc with automatic values from autoValue functions
var getAutoValues = function(doc, type) {
  var self = this;
  var mDoc = new MongoObject(doc);
  _.each(self._c2._autoValues, function(func, fieldName) {
    var keyInfo = mDoc.getArrayInfoForKey(fieldName) || mDoc.getInfoForKey(fieldName) || {};
    var doUnset = false;
    var autoValue = func.call({
      isInsert: (type === "insert"),
      isUpdate: (type === "update"),
      isUpsert: (type === "upsert"),
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