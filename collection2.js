Meteor.Collection2 = function(name, options) {
    var self = this, userTransform = options.transform;
    options = options || {};
    self._name = name;
    self._simpleSchema = new SimpleSchema(options.schema);
    if ("schema" in options) {
        delete options.schema;
    }
    self._virtualFields = options.virtualFields || {};
    if ("virtualFields" in options) {
        delete options.virtualFields;
    }
    options.transform = function(doc) {
        //add all virtual fields to document whenever it's passed to a callback
        _.each(self._virtualFields, function(func, fieldName, list) {
            doc[fieldName] = func(doc);
        });
        //support user-supplied transformation function as well
        return userTransform ? userTransform(doc) : doc;
    };
    self._collection = new Meteor.Collection(name, options);
};

_.extend(Meteor.Collection2.prototype, {
    find: function(/* arguments */) {
        var self = this, collection = self._collection;
        return collection.find.apply(collection, arguments);
    },
    findOne: function(/* arguments */) {
        var self = this, collection = self._collection;
        return collection.findOne.apply(collection, arguments);
    },
    _insertOrUpdate: function(type, args) {
        var self = this,
                collection = self._collection,
                schema = self._simpleSchema,
                doc, callback, error;

        if (!args.length) {
            throw new Error(type + " requires an argument");
        }

        if (type === "insert") {
            doc = args[0];
        } else if (type === "update") {
            //for updates, we handle validating $set and $unset; otherwise, just
            //pass through to the real collection
            if (args[1] && (args[1].$set || args[1].$unset)) {
                doc = args[1];
            } else {
                return collection.update.apply(collection, args);
            }
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
        doc = schema.filter(doc);
        doc = schema.autoTypeConvert(doc);
        //validate doc
        schema.validate(doc);

        if (schema.valid()) {
            if (type === "insert") {
                args[0] = doc; //update to reflect whitelist and typeconvert changes
                return collection.insert.apply(collection, args);
            } else {
                args[1] = doc; //update to reflect whitelist and typeconvert changes
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
    },
    insert: function(/* arguments */) {
        var args = _.toArray(arguments);
        this._insertOrUpdate("insert", args);
    },
    update: function(/* arguments */) {
        var args = _.toArray(arguments);
        this._insertOrUpdate("update", args);
    },
    remove: function(/* arguments */) {
        var self = this, collection = self._collection;
        return collection.remove.apply(collection, arguments);
    },
    allow: function(/* arguments */) {
        var self = this, collection = self._collection;
        return collection.allow.apply(collection, arguments);
    },
    deny: function(/* arguments */) {
        var self = this, collection = self._collection;
        return collection.deny.apply(collection, arguments);
    },
    simpleSchema: function() {
        return this._simpleSchema;
    }
});