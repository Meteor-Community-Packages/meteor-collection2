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
        self._simpleSchema = new SimpleSchema(options.schema, {
            additionalKeyPatterns: {
                autoValue: Match.Optional(Function),
                denyInsert: Match.Optional(Boolean),
                denyUpdate: Match.Optional(Boolean),
                unique: Match.Optional(Boolean)
            }
        });
    }
    delete options.schema;

    //get the virtual fields
    self._virtualFields = options.virtualFields;
    if ("virtualFields" in options) {
        delete options.virtualFields;
    }

    //populate _denyUpdateKeys, _denyInsertKeys and _autoValues
    self._denyInsertKeys = [];
    self._denyUpdateKeys = [];
    self._autoValues = {insert: {}, update: {}};
    _.each(self._simpleSchema.schema(), function (definition, fieldName) {
        if (definition.denyInsert === true) {
            self._denyInsertKeys.push(fieldName);
        }
        if (definition.denyUpdate === true) {
            self._denyUpdateKeys.push(fieldName);
        }
        if ('autoValue' in definition) {
            if (typeof definition.autoValue !== 'function')
                throw new Error('autoValue option must be a function')
            if (definition.denyUpdate !== true)
                self._autoValues.update[fieldName] = definition.autoValue;
            if (definition.denyInsert !== true)
                self._autoValues.insert[fieldName] = definition.autoValue;
        }
    });

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
        self._collection = new Meteor.Collection(name, options);
    }
    //Validate from the real collection, too.
    //This prevents doing C2._collection.insert(invalidDoc) (and update) on the client
    self._collection.deny({
        insert: function(userId, doc) {
            self._simpleSchema.validate(doc);
            _.each(self._denyInsertKeys, function(key) {
                if (key in doc)
                    return false
            });
            return !self._simpleSchema.valid();
        },
        update: function(userId, doc, fields, modifier) {
            self._simpleSchema.validate(modifier);
            _.each(self._denyUpdateKeys, function(key) {
                console.log(key, fields)
                if (key in fields)
                    return false
            });
            return !self._simpleSchema.valid();
        },
        fetch: []
    });
    //set up check for uniqueness
    self._simpleSchema.validator(function (key, val, def) {
        if (def.unique) {
            var test = {};
            test[key] = val;
            return self._collection.findOne(test) ? "notUnique" : true;
        }
    });
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

        //call and populate `autoValue` fields in the doc
        _.each(self._autoValues[type], function (func, fieldName) {
            var autoValue = func(doc, type);
            
            if (autoValue === undefined)
                return

            if (type === "insert")
                doc[fieldName] = autoValue;

            else if (type === "update") {
                var mongoModifier = false;
                
                // If autoValue is a mongoModifier like {$inc: 1}, we update the document to have
                // {$inc: {fieldName: 1}}
                _.each(['$inc', '$push', '$addToSet', '$pull', '$pop', '$slice'], function($elm) {
                    if (autoValue.hasOwnProperty($elm)){
                        if (!($elm in doc))
                            doc[$elm] = {};
                        doc[$elm][fieldName] = {}[fieldName] = autoValue[$elm];
                        mongoModifier = true;
                    }
                });
                // If autoValue isn't a mongoModifier but a simple object like a string, a number or
                // an array, we do a {$set: {fieldName: autoValue}}
                if (!mongoModifier) {
                    if (!('$set' in doc))
                        doc.$set = {};
                    doc.$set[fieldName] = autoValue;
                }
            }
        });

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
        // doc = args[0]
        // for (key in doc) {
        //     if (key in self.denyInsert)
        //         throw Error
        // }
        return this._insertOrUpdate("insert", args);
    },
    update: function(/* arguments */) {
        var args = _.toArray(arguments);
        return this._insertOrUpdate("update", args);
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