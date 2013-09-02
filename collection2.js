Meteor.Collection2 = function(name, options) {
    var self = this, userTransform, existingCollection;

    if (!(self instanceof Meteor.Collection2)) {
        throw new Error('use "new" to construct a Meteor.Collection2');
    }

    options = options || {};

    if (!("schema" in options)) {
        throw new Error('Meteor.Collection2 options must define a schema');
    }

    //set up simpleSchema
    if (options.schema instanceof SimpleSchema) {
        self._simpleSchema = options.schema;
    } else {
        self._simpleSchema = new SimpleSchema(options.schema);
    }
    delete options.schema;

    //store a generic validation context
    self._validationContexts = {
        default: self._simpleSchema.newContext()
    };

    //get the virtual fields
    self._virtualFields = options.virtualFields;
    if ("virtualFields" in options) {
        delete options.virtualFields;
    }

    //create or update the collection
    if (name instanceof Meteor.Collection || ("SmartCollection" in Meteor && name instanceof Meteor.SmartCollection)) {
        existingCollection = name;
        //set up virtual fields
        if (self._virtualFields) {
            userTransform = existingCollection._transform;
            options.transform = function(doc) {
                //add all virtual fields to document whenever it's passed to a callback
                _.each(self._virtualFields, function(func, fieldName, list) {
                    doc[fieldName] = func(doc);
                });
                //support user-supplied transformation function as well
                return userTransform ? userTransform(doc) : doc;
            };
            existingCollection._transform = Deps._makeNonreactive(options.transform);
        }
        //update the collection
        self._name = existingCollection._name;
        self._collection = existingCollection;
    } else {
        //set up virtual fields
        if (self._virtualFields) {
            userTransform = options.transform;
            options.transform = function(doc) {
                //add all virtual fields to document whenever it's passed to a callback
                _.each(self._virtualFields, function(func, fieldName, list) {
                    doc[fieldName] = func(doc);
                });
                //support user-supplied transformation function as well
                return userTransform ? userTransform(doc) : doc;
            };
        }
        //create the collection
        self._name = name;
        if ("smart" in options && options.smart === true) {
            delete options.smart;
            self._collection = new Meteor.SmartCollection(name, options);
        } else {
            self._collection = new Meteor.Collection(name, options);
        }
    }
    //Validate from the real collection, too.
    //This prevents doing C2._collection.insert(invalidDoc) (and update) on the client
    self._collection.deny({
        insert: function(userId, doc) {
            //get a throwaway context here to avoid mixing up contexts
            var context = self._simpleSchema.newContext();
            context.validate(doc);
            return !context.isValid();
        },
        update: function(userId, doc, fields, modifier) {
            //get a throwaway context here to avoid mixing up contexts
            var context = self._simpleSchema.newContext();
            context.validate(modifier, {modifier: true});
            return !context.isValid();
        },
        fetch: []
    });
    //set up check for uniqueness
    self._simpleSchema.validator(function(key, val, def) {
        if (def.unique) {
            var test = {};
            test[key] = val;
            return self._collection.findOne(test) ? "notUnique" : true;
        }
    });
};

Meteor.Collection2.prototype._insertOrUpdate = function(type, args) {
    var self = this,
            collection = self._collection,
            schema = self._simpleSchema,
            context, doc, callback, error, options;

    if (!args.length) {
        throw new Error(type + " requires an argument");
    }

    if (type === "insert") {
        doc = args[0];
        options = args[1];
    } else if (type === "update") {
        doc = args[1];
        options = args[2];
    } else {
        throw new Error("invalid type argument");
    }
    
    //determine which validation context to use
    if (options === void 0 || options instanceof Function || !_.isObject(options) || typeof options.validationContext !== "string") {
        context = "default";
    } else {
        context = options.validationContext;
        ensureContext(self, context);
    }
    
    //remove the options from insert now that we're done with them
    if (type === "insert" && args[1] !== void 0 && !(args[1] instanceof Function)) {
        args.splice(1, 1);
    }
    
    //figure out callback situation
    if (args.length && args[args.length - 1] instanceof Function) {
        callback = args[args.length - 1];
    }
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

    //clean up doc
    doc = schema.clean(doc);
    //validate doc
    self._validationContexts[context].validate(doc, {modifier: (type === "update")});

    if (self._validationContexts[context].isValid()) {
        if (type === "insert") {
            args[0] = doc; //update to reflect cleaned doc
            return collection.insert.apply(collection, args);
        } else {
            args[1] = doc; //update to reflect cleaned doc
            return collection.update.apply(collection, args);
        }
    } else {
        error = new Error("failed validation");
        if (callback) {
            callback(error);
            return null;
        }
        throw error;
    }
};

Meteor.Collection2.prototype.insert = function(/* arguments */) {
    var args = _.toArray(arguments);
    return this._insertOrUpdate("insert", args);
};

Meteor.Collection2.prototype.update = function(/* arguments */) {
    var args = _.toArray(arguments);
    return this._insertOrUpdate("update", args);
};

Meteor.Collection2.prototype.simpleSchema = function() {
    return this._simpleSchema;
};

Meteor.Collection2.prototype.namedContext = function(name) {
    var self = this;
    ensureContext(self, name);
    return self._validationContexts[name];
};

Meteor.Collection2.prototype.validate = function(doc, options) {
    var self = this, schema = self._simpleSchema;
    
    //figure out the validation context name and make sure it exists
    var context = _.isObject(options) && typeof options.validationContext === "string" ? options.validationContext : "default";
    ensureContext(self, context);
    
    //clean doc
    doc = schema.clean(doc);
    //validate doc
    self._validationContexts[context].validate(doc, options);

    return self._validationContexts[context].isValid();
};

Meteor.Collection2.prototype.validateOne = function(doc, keyName, options) {
    var self = this, schema = self._simpleSchema;
    
    //figure out the validation context name and make sure it exists
    var context = _.isObject(options) && typeof options.validationContext === "string" ? options.validationContext : "default";
    ensureContext(self, context);
    
    //clean doc
    doc = schema.clean(doc);
    //validate doc
    self._validationContexts[context].validateOne(doc, keyName, options);

    return !self._validationContexts[context].keyIsInvalid(keyName);
};

//Pass-through Methods

Meteor.Collection2.prototype.remove = function(/* arguments */) {
    var self = this, collection = self._collection;
    return collection.remove.apply(collection, arguments);
};

Meteor.Collection2.prototype.allow = function(/* arguments */) {
    var self = this, collection = self._collection;
    return collection.allow.apply(collection, arguments);
};

Meteor.Collection2.prototype.deny = function(/* arguments */) {
    var self = this, collection = self._collection;
    return collection.deny.apply(collection, arguments);
};

Meteor.Collection2.prototype.find = function(/* arguments */) {
    var self = this, collection = self._collection;
    return collection.find.apply(collection, arguments);
};

Meteor.Collection2.prototype.findOne = function(/* arguments */) {
    var self = this, collection = self._collection;
    return collection.findOne.apply(collection, arguments);
};

//Private Methods

var ensureContext = function(c2, name) {
    c2._validationContexts[name] = c2._validationContexts[name] || c2._simpleSchema.newContext();
};