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
    //store a generic validation context
    self._validationContext = "default";

    //get the virtual fields
    self._virtualFields = options.virtualFields;
    if ("virtualFields" in options) {
        delete options.virtualFields;
    }

    //create or update the collection
    if (typeof name === "object" && (name instanceof Meteor.Collection || name instanceof Meteor.SmartCollection)) {
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
            doc = self._simpleSchema.clean(doc);
            self._validationContexts[self._validationContext].validate(doc);
            return !self._validationContexts[self._validationContext].isValid();
        },
        update: function(userId, doc, fields, modifier) {
            modifier = self._simpleSchema.clean(modifier);
            self._validationContexts[self._validationContext].validate(modifier, {modifier: true});
            return !self._validationContexts[self._validationContext].isValid();
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
            context = self._validationContext,
            doc, callback, error;

    if (!args.length) {
        throw new Error(type + " requires an argument");
    }

    if (type === "insert") {
        doc = args[0];
    } else if (type === "update") {
        doc = args[1];
    } else {
        throw new Error("invalid type argument");
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

Meteor.Collection2.prototype.currentContext = function(name) {
    var self = this;
    if (name) {
        //set current context, creating it first if necessary
        self._validationContexts[name] = self._validationContexts[name] || self._simpleSchema.newContext();
        self._validationContext = name;
    } else {
        //get current context
        return self._validationContext;
    }
};

Meteor.Collection2.prototype.namedContext = function(name) {
    var self = this;
    self._validationContexts[name] = self._validationContexts[name] || self._simpleSchema.newContext();
    return self._validationContexts[name];
};

Meteor.Collection2.prototype.ensureContext = function(name) {
    var self = this;
    self._validationContexts[name] = self._validationContexts[name] || self._simpleSchema.newContext();
};

Meteor.Collection2.prototype.validate = function(doc, isModifier) {
    var self = this, schema = self._simpleSchema;
    
    //clean doc
    doc = schema.clean(doc);
    //validate doc
    self._validationContexts[self._validationContext].validate(doc, {modifier: isModifier});

    return self._validationContexts[self._validationContext].isValid();
};

Meteor.Collection2.prototype.validateOne = function(doc, keyName, isModifier) {
    var self = this, schema = self._simpleSchema;
    
    //clean doc
    doc = schema.clean(doc);
    //validate doc
    self._validationContexts[self._validationContext].validateOne(doc, keyName, {modifier: isModifier});

    return !self._validationContexts[self._validationContext].keyIsInvalid(keyName);
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