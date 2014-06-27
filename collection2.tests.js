function pub(col) {
  if (Meteor.isServer) {
    Meteor.publish(null, function () {
      return col.find();
    });
  }
}

var books = new Meteor.Collection("books", {
  schema: new SimpleSchema({
    title: {
      type: String,
      label: "Title",
      max: 200,
      index: 1
    },
    author: {
      type: String,
      label: "Author"
    },
    copies: {
      type: Number,
      label: "Number of copies",
      min: 0
    },
    lastCheckedOut: {
      type: Date,
      label: "Last date this book was checked out",
      optional: true
    },
    summary: {
      type: String,
      label: "Brief summary",
      optional: true,
      max: 1000
    },
    isbn: {
      type: String,
      label: "ISBN",
      optional: true,
      index: 1,
      unique: true
    },
    field1: {
      type: String,
      optional: true
    },
    field2: {
      type: String,
      optional: true
    },
    createdAt: {
      type: Date,
      optional: true,
      denyUpdate: true
    },
    updatedAt: {
      type: Date,
      optional: true,
      denyInsert: true
    }
  })
});

// Add one unique index outside of C2
if (Meteor.isServer) {
  try {
    books._dropIndex({field1: 1, field2: 1});
  } catch (err) {

  }
  books._ensureIndex({field1: 1, field2: 1}, {unique: true, sparse: true});
} 

var autoValues = new Meteor.Collection("autoValues", {
  schema: {
    name: {
      type: String
    },
    dateDefault: {
      type: Date,
      optional: true,
      autoValue: function() {
        if (!this.isSet) {
          return new Date("2013-01-01");
        }
      }
    },
    dateForce: {
      type: Date,
      optional: true,
      autoValue: function() {
        return new Date("2013-01-01");
      }
    },
    updateCount: {
      type: Number,
      autoValue: function() {
        if (this.isInsert) {
          return 0;
        } else {
          return {$inc: 1};
        }
      }
    },
    content: {
      type: String,
      optional: true
    },
    firstWord: {
      type: String,
      optional: true,
      autoValue: function() {
        var content = this.field("content");
        if (content.isSet) {
          return content.value.split(' ')[0];
        } else {
          this.unset();
        }
      }
    },
    updatesHistory: {
      type: [Object],
      optional: true,
      autoValue: function() {
        var content = this.field("content");
        if (content.isSet) {
          if (this.isInsert) {
            return [{
                date: new Date,
                content: content.value
              }];
          } else {
            return {
              $push: {
                date: new Date,
                content: content.value
              }
            };
          }
        }
      }
    },
    'updatesHistory.$.date': {
      type: Date,
      optional: true
    },
    'updatesHistory.$.content': {
      type: String,
      optional: true
    }
  }
});

var noSchemaCollection = new Meteor.Collection('noSchema', {
  transform: function(doc) {
    doc.userFoo = "userBar";
    return doc;
  }
});

Document = function(data) {
  _.extend(this, data);
};

Document.prototype = {
  constructor: Document,
  toString: function() {
    return this.toJSONValue.toString();
  },
  clone: function() {
    return new Document(this);
  },
  equals: function(other) {
    if (!(other instanceof Document))
      return false;
    return EJSON.stringify(this) === EJSON.stringify(other);
  },
  typeName: function() {
    return "Document";
  },
  toJSONValue: function() {
    return _.extend({}, this);
  }
};

BlackBox = new Meteor.Collection('black', {
  schema: {
    name: {
      type: String
    },
    data: {
      type: Document,
      blackbox: true
    }
  },
  transform: function(doc) {
    doc.data = new Document(doc.data);
    return doc;
  }
});

defaultValues = new Meteor.Collection("dv");

// Ensure that attaching the schema after constructing works, too
defaultValues.attachSchema(new SimpleSchema({
  bool1: {
    type: Boolean,
    defaultValue: false
  }
}));

contextCheck = new Meteor.Collection("contextCheck", {
  schema: new SimpleSchema({
    foo: {
      type: String,
      optional: true
    },
    'context.userId': {
      type: String,
      optional: true,
      autoValue: function () {
        return this.userId;
      }
    },
    'context.isFromTrustedCode': {
      type: Boolean,
      optional: true,
      autoValue: function () {
        return this.isFromTrustedCode;
      }
    },
    'context.isInsert': {
      type: Boolean,
      optional: true,
      autoValue: function () {
        return this.isInsert;
      }
    },
    'context.isUpdate': {
      type: Boolean,
      optional: true,
      autoValue: function () {
        return this.isUpdate;
      }
    }
  })
});

if (Meteor.isServer) {
  Meteor.publish("books", function() {
    return books.find();
  });

  Meteor.publish("autovalues", function() {
    return autoValues.find();
  });

  Meteor.publish("defvalues", function() {
    return defaultValues.find();
  });

  Meteor.publish("noschema", function() {
    return noSchemaCollection.find();
  });

  Meteor.publish("black", function() {
    return BlackBox.find();
  });

  Meteor.publish("contextCheck", function () {
    return contextCheck.find();
  });

  defaultValues.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    },
    remove: function() {
      return true;
    }
  });

  books.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    },
    remove: function() {
      return true;
    }
  });

  var shouldDeny = false;
  books.deny({
    insert: function() {
      return shouldDeny;
    },
    update: function() {
      return shouldDeny;
    },
    remove: function() {
      return shouldDeny;
    }
  });

  autoValues.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    },
    remove: function() {
      return true;
    }
  });

  // Rig test helper method for setting denyAll
  Meteor.methods({
    denyAll: function() {
      shouldDeny = true;
    },
    allowAll: function() {
      shouldDeny = false;
    },
    removeAll: function () {
      books.remove({});
      autoValues.remove({});
      defaultValues.remove({});
      noSchemaCollection.remove({});
      BlackBox.remove({});
      contextCheck.remove({});
    }
  });

  noSchemaCollection.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    }
  });

  BlackBox.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    }
  });

  contextCheck.allow({
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    }
  });

} else {
  var booksSubscription = Meteor.subscribe("books");
  Meteor.subscribe("autovalues");
  Meteor.subscribe("defvalues");
  Meteor.subscribe("noschema");
  Meteor.subscribe("black");
  Meteor.subscribe("contextCheck");
}

function equals(a, b) {
  return !!(EJSON.stringify(a) === EJSON.stringify(b));
}

Tinytest.add('Collection2 - Test Environment', function(test) {
  test.isTrue(typeof SimpleSchema !== 'undefined', 'test environment not initialized SimpleSchema');
});

if (Meteor.isServer) {
  Tinytest.add('Collection2 - Ensure Index', function(test) {
    // We need to have an access to the getIndexes method of the embedded
    // collection in order to test this feature.
    // var indexes = books._collection._getIndexes();
  });
}

Tinytest.addAsync('Collection2 - Reset', function (test, next) {
  Meteor.call("removeAll", next);
});

// Test required field "copies"
Tinytest.addAsync('Collection2 - Insert Required', function(test, next) {
  var numDone = 0;
  function maybeNext() {
    numDone++;
    if (numDone === 2) {
      next();
    }
  }

  var id = books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
    //The insert will fail, error will be set,
    test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
    //and result will be false because "copies" is required.
    test.isFalse(result, 'result should be false because "copies" is required');
    //The list of errors is available by calling books.simpleSchema().namedContext().invalidKeys()
    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

    var key = invalidKeys[0] || {};

    test.equal(key.name, 'copies', 'We expected the key "copies"');
    test.equal(key.type, 'required', 'We expected the type to be required');
    maybeNext();
  });

  test.equal(typeof id, 'string', 'We expected an ID to be returned');
  maybeNext();
});

// When unique: true, inserts should fail if another document already has the same value
var uniqueBookId, isbn;
Tinytest.addAsync('Collection2 - Unique - Prep', function(test, next) {
  isbn = Random.id();
  // Insert isbn
  uniqueBookId = books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    // Insert isbn+"A"
    books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn+"A"}, function(error, result) {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
      test.isTrue(!!result, 'result should be defined');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
      next();
    });
  });
});

Tinytest.addAsync('Collection2 - Unique - Insert Duplicate', function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
    test.isTrue(!!error, 'We expected the insert to trigger an error since isbn being inserted is already used');
    test.isFalse(result, 'result should be false');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'isbn', 'We expected the key "isbn"');
    test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
    next();
  });
});

Tinytest.addAsync('Collection2 - Unique - Insert Duplicate Non-C2 Index', function(test, next) {
  if (Meteor.isServer) {
    var val = "foo";
  } else {
    var val = "bar";
  }
  // Good insert
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, field1: val, field2: val}, function(error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since the fields are unique');
    test.isTrue(!!result, 'result should be the new ID');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    var key = invalidKeys[0] || {};

    // Bad insert
    books.insert({title: "Ulysses", author: "James Joyce", copies: 1, field1: val, field2: val}, function(error, result) {
      test.isTrue(!!error, 'We expected the insert to trigger an error since the fields are not unique');
      test.isFalse(result, 'result should be false');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back because this is a non-C2 unique index');
      var key = invalidKeys[0] || {};
      
      next();
    });
  });
});

Tinytest.addAsync('Collection2 - Unique - Validation Alone', function(test, next) {
  //test validation without actual updating
  var context = books.simpleSchema().namedContext();

  //we don't know whether this would result in a non-unique value or not because
  //we don't know which documents we'd be changing; therefore, no notUnique error
  context.validate({$set: {isbn: isbn}}, {modifier: true});
  var invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  context.validateOne({$set: {isbn: isbn}}, "isbn", {modifier: true});
  invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
  next();
});

Tinytest.addAsync('Collection2 - Unique - Update Self', function(test, next) {
  // When unique: true, updates should not fail when the document being updated has the same value
  books.update(uniqueBookId, {$set: {isbn: isbn}}, function(error) {
    test.isFalse(!!error, 'We expected the update not to trigger an error since isbn is used only by the doc being updated');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys, [], 'We should get no invalidKeys back');
    next();
  });
});

Tinytest.addAsync('Collection2 - Unique - Update Another', function(test, next) {
  // When unique: true, updates should fail if another document already has the same value
  books.update(uniqueBookId, {$set: {isbn: isbn + "A"}}, function(error) {
    test.isTrue(!!error, 'We expected the update to trigger an error since isbn we want to change to is already used by a different document');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'isbn', 'We expected the key "isbn"');
    test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
    next();
  });
});

var testCollection = new Meteor.Collection("testCollection");
Tinytest.add('Collection2 - Unique - Object Array', function(test) {
  // We need to handle arrays of objects specially because the
  // index key must be "a.b" if, for example, the schema key is "a.$.b".
  // Here we make sure that works.
  var testSchema = new SimpleSchema({
    'a.$.b': {
      type: String,
      unique: true
    }
  });
  
  try {
    testCollection.attachSchema(testSchema);
  } catch (e) {
    // If we error, that means collection2 tried to set up the index incorrectly,
    // using the wrong index key
  }

  test.instanceOf(testCollection.simpleSchema(), SimpleSchema);
});

Tinytest.addAsync("Collection2 - denyInsert", function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, updatedAt: new Date}, function(error, result) {
    test.isTrue(!!error, 'We expected the insert to trigger an error since updatedAt has denyInsert set to true');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'updatedAt', 'We expected the key "updatedAt"');
    test.equal(key.type, 'insertNotAllowed', 'We expected the type to be "insertNotAllowed"');

    next();
  });
});

Tinytest.addAsync("Collection2 - denyUpdate", function(test, next) {
  // Test denyInsert valid case here so that we can use the inserted doc for the
  // update tests.
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, createdAt: new Date}, function(error, newId) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since createdAt denies updates but not inserts');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    books.update({_id: newId}, {$set: {createdAt: new Date}}, function(error, result) {
      test.isTrue(!!error, 'We expected the insert to trigger an error since createdAt has denyUpdate set to true');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
      var key = invalidKeys[0] || {};

      test.equal(key.name, 'createdAt', 'We expected the key "createdAt"');
      test.equal(key.type, 'updateNotAllowed', 'We expected the type to be "updateNotAllowed"');

      //now test valid case
      books.update({_id: newId}, {$set: {updatedAt: new Date}}, function(error, result) {
        test.isFalse(!!error, 'We expected the update not to trigger an error since updatedAt denies inserts but not updates');

        var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
        test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
        next();
      });
    });
  });
});

if (Meteor.isServer) {
  //no validation when calling underlying _collection on the server
  Tinytest.addAsync("Collection2 - _collection on the server", function(test, next) {
    books._collection.insert({title: "Ulysses", author: "James Joyce", copies: 1, updatedAt: new Date}, function(error, result) {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since we are on the server');
      next();
    });
  });
}

Tinytest.addAsync("Collection2 - Black Box", function(test, next) {

  var now = new Date;

  var boxData = {
    name: "Test",
    data: new Document({
      one: 1,
      two: "some string",
      three: {
        four: now
      }
    })
  };

  BlackBox.insert(boxData, function(error, newId) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since all required fields are present');
    test.isTrue(!!newId, 'We expected to get an ID back');

    var doc = BlackBox.findOne({_id: newId});
    test.isTrue(!!doc, 'There should be a document inserted');
    doc && test.isTrue(doc.data instanceof Document, "we lost the custom type");
    doc && test.equal(doc.name, "Test");
    doc && test.equal(doc.data.one, 1);
    doc && test.equal(doc.data.two, "some string");
    doc && test.equal(doc.data.three.four, now);

    // remove the EJSON prototype and try again; should still work
    Document.prototype = {};

    boxData = {
      name: "Test",
      data: new Document({
        one: 1,
        two: "some string",
        three: {
          four: now
        }
      })
    };

    BlackBox.insert(boxData, function(error, newId2) {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since all required fields are present');
      test.isTrue(!!newId, 'We expected to get an ID back');

      var doc = BlackBox.findOne({_id: newId2});
      test.isTrue(!!doc, 'There should be a document inserted');
      doc && test.isTrue(doc.data instanceof Document, "we lost the custom type");
      doc && test.equal(doc.name, "Test");
      doc && test.equal(doc.data.one, 1);
      doc && test.equal(doc.data.two, "some string");
      doc && test.equal(doc.data.three.four, now);

      next();
    });
  });

});

Tinytest.addAsync("Collection2 - AutoValue Insert", function(test, next) {
  autoValues.insert({name: "Test", firstWord: "Illegal to manually set value"}, function(err, res) {
    test.isFalse(!!err, 'We expected the insert not to trigger an error since all required fields are present');
    var p = autoValues.findOne({_id: res});
    var d = new Date("2013-01-01");

    test.equal(p.dateDefault.getTime(), d.getTime(), 'expected the dateDefault to be correctly set after insert');
    test.equal(p.dateForce.getTime(), d.getTime(), 'expected the dateForce to be correctly set after insert');
    test.isUndefined(p.firstWord, 'expected firstWord to be undefined');
    test.isUndefined(p.updatesHistory, 'expected updatesHistory to be undefined');

    // Now test with dateDefault set and verify it is not overwritten
    var myDate = new Date("2013-02-01");
    autoValues.insert({name: "Test", dateDefault: myDate}, function(err, res) {
      var p = autoValues.findOne({_id: res});
      var d = new Date("2013-01-01");

      test.instanceOf(p.dateDefault, Date);
      if (p.dateDefault instanceof Date) {
        test.equal(p.dateDefault.getTime(), myDate.getTime(), 'expected the dateDefault to be correctly set after insert');
      }

      test.instanceOf(p.dateForce, Date);
      if (p.dateForce instanceof Date) {
        test.equal(p.dateForce.getTime(), d.getTime(), 'expected the dateForce to be correctly set after insert');
      }

      test.isUndefined(p.firstWord, 'expected firstWord to be undefined');
      test.isUndefined(p.updatesHistory, 'expected updatesHistory to be undefined');

      autoValues.insert({name: "Test", content: 'Hello world!'}, function(err, res) {
        var p = autoValues.findOne({_id: res});
        test.equal(p.firstWord, 'Hello', 'expected firstWord to be "Hello"');
        test.length(p.updatesHistory, 1);
        test.equal(p.updatesHistory[0].content, 'Hello world!', 'expected updatesHistory.content to be "Hello world!"');
        next();
      });
    });
  });
});

Tinytest.addAsync("Collection2 - AutoValue Update", function(test, next) {
  autoValues.insert({name: "Update Test"}, function(err, testId) {
    autoValues.update({_id: testId}, {$set: {content: "Test Content"}}, function(err, res) {
      var p = autoValues.findOne({_id: testId});
      test.equal(p.firstWord, 'Test', 'expected firstWord to be "Test"');
      test.length(p.updatesHistory, 1);
      test.equal(p.updatesHistory[0].content, 'Test Content', 'expected updatesHistory.content to be "Test Content"');
      test.equal(p.updateCount, 1, 'expected updateCount to be 1');
      next();
    });
  });
});

Tinytest.addAsync("Collection2 - AutoValue Context", function(test, next) {
  contextCheck.insert({}, function (error, testId) {
    test.isFalse(!!error, 'insert failed: ' + (error && error.message))
    var ctx = contextCheck.findOne({_id: testId});
    test.isTrue(ctx.context.isInsert, 'expected isInsert to be true');
    test.isFalse(ctx.context.isUpdate, 'expected isUpdate to be false');
    test.isNull(ctx.context.userId, 'expected userId to be null');
    if (Meteor.isClient) {
      test.isFalse(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be false');
    } else {
      test.isTrue(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be true');
    }

    contextCheck.update({_id: testId}, {$set: {foo: "bar"}}, function (error, result) {
      ctx = contextCheck.findOne({_id: testId});
      test.equal(ctx.foo, 'bar', "update failed");
      test.isTrue(ctx.context.isUpdate, 'expected isUpdate to be true');
      test.isFalse(ctx.context.isInsert, 'expected isInsert to be false');
      test.isNull(ctx.context.userId, 'expected userId to be null');
      if (Meteor.isClient) {
        test.isFalse(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be false');
      } else {
        test.isTrue(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be true');
      }
      next();
    });
  });
});

Tinytest.addAsync("Collection2 - DefaultValue Update", function(test, next) {
  // Base case
  defaultValues.insert({}, function(err, testId) {
    var p = defaultValues.findOne({_id: testId});
    test.equal(p.bool1, false);

    // Ensure that default values do not mess with inserts and updates of the field
    defaultValues.insert({bool1: true}, function(err, testId) {
      var p = defaultValues.findOne({_id: testId});
      test.equal(p.bool1, true);
      defaultValues.update({_id: testId}, {$set: {bool1: true}}, function(err, res) {
        p = defaultValues.findOne({_id: testId});
        test.equal(p.bool1, true);
        next();
      });
    });
  });  
});

Tinytest.addAsync('Collection2 - Upsert', function(test, next) {
  //test validation without actual updating

  //invalid
  books.simpleSchema().namedContext().validate({$set: {title: "Ulysses", author: "James Joyce"}}, {modifier: true, upsert: true});
  var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
  test.equal(invalidKeys.length, 1, 'We should get one invalidKeys back because copies is missing');

  books.simpleSchema().namedContext().validateOne({$set: {title: "Ulysses", author: "James Joyce"}}, "copies", {modifier: true, upsert: true});
  invalidKeys = books.simpleSchema().namedContext().invalidKeys();
  test.equal(invalidKeys.length, 1, 'We should get one invalidKeys back because copies is missing');

  //valid
  books.simpleSchema().namedContext().validate({$set: {title: "Ulysses", author: "James Joyce", copies: 1}}, {modifier: true, upsert: true});
  invalidKeys = books.simpleSchema().namedContext().invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  books.simpleSchema().namedContext().validateOne({$set: {title: "Ulysses", author: "James Joyce"}}, "author", {modifier: true, upsert: true});
  invalidKeys = books.simpleSchema().namedContext().invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  //test update calls
  books.upsert({title: "Ulysses", author: "James Joyce"}, {$set: {copies: 1}}, function(error, result) {

    //upserts are server only when this package is used
    if (Meteor.isServer) {
      test.isFalse(!!error, 'We expected the upsert not to trigger an error since the selector values should be used');
      test.equal(result.numberAffected, 1, 'Upsert should update one record');

      invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    } else {
      test.isTrue(!!error, 'We expected the upsert to trigger an error because upserts are not allowed from the client');
    }

    books.update({title: "Ulysses", author: "James Joyce"}, {$set: {copies: 1}}, {upsert: true}, function(error, result) {

      //upserts are server only when this package is used
      if (Meteor.isServer) {
        test.isFalse(!!error, 'We expected the update/upsert not to trigger an error since the selector values should be used');
        test.equal(result, 1, 'Update/upsert should update one record');

        invalidKeys = books.simpleSchema().namedContext().invalidKeys();
        test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
      } else {
        test.isTrue(!!error, 'We expected the upsert to trigger an error because upserts are not allowed from the client');
      }

      next();
    });
  });
});

// Ensure that there are no errors when using a schemaless collection
Tinytest.addAsync("Collection2 - No Schema", function(test, next) {
  noSchemaCollection.insert({a: 1, b: 2}, function(error, newId) {
    test.isFalse(!!error, 'There should be no error since there is no schema');
    test.isTrue(!!newId, 'result should be the inserted ID');

    var doc = noSchemaCollection.findOne({_id: newId});
    test.instanceOf(doc, Object);
    test.equal(doc.userFoo, "userBar", "User-supplied transforms are lost");

    noSchemaCollection.update({_id: newId}, {$set: {a: 3, b: 4}}, function(error, result) {
      test.isFalse(!!error, 'There should be no error since there is no schema');
      //result is undefined for some reason, but it's happening for apps without
      //C2 as well, so must be a Meteor bug
      //test.isTrue(typeof result === "number", 'result should be the number of records updated');
      next();
    });
  });
});

// By default, empty strings are removed, but we can override
var RES = new Meteor.Collection("RES");
RES.attachSchema(new SimpleSchema({
  foo: { type: String },
  bar: { type: String, optional: true }
}));
pub(RES);
RES.allow({
  insert: function (userId, doc) {
    return true;
  },
  update: function (userId, doc) {
    return true;
  }
});

Tinytest.addAsync("Collection2 - removeEmptyStrings", function(test, next) {
  // Remove empty strings (default)
  RES.insert({foo: "foo", bar: ""}, function(error, newId1) {
    test.isFalse(!!error, 'There should be no error');
    test.isTrue(!!newId1, 'result should be the inserted ID');

    var doc = RES.findOne({_id: newId1});
    test.instanceOf(doc, Object);
    test.isUndefined(doc.bar);

    // Don't remove empty strings
    RES.insert({foo: "foo", bar: ""}, {removeEmptyStrings: false}, function(error, newId2) {
      test.isFalse(!!error, 'There should be no error');
      test.isTrue(!!newId2, 'result should be the inserted ID');

      var doc = RES.findOne({_id: newId2});
      test.instanceOf(doc, Object);
      test.equal(doc.bar, "");
    
      // Don't remove empty strings for an update either
      RES.update({_id: newId1}, {$set: {bar: ""}}, {removeEmptyStrings: false}, function(error, result) {
        test.isFalse(!!error, 'There should be no error');
        test.equal(result, 1, 'should have updated 1 record');

        var doc = RES.findOne({_id: newId1});
        test.instanceOf(doc, Object);
        test.equal(doc.bar, "");
        next();
      });
    });
  });
});

Tinytest.addAsync('Collection2 - Validate False', function(test, next) {
  var title;
  if (Meteor.isClient) {
    title = "Validate False Client";
  } else {
    title = "Validate False Server";
  }

  books.insert({title: title, author: "James Joyce"}, {validate: false, validationContext: "validateFalse"}, function(error, result) {
    var invalidKeys = books.simpleSchema().namedContext("validateFalse").invalidKeys();

    if (Meteor.isClient) {
      // When validate: false on the client, we should still get a validation error and invalidKeys back from the server
      test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
      test.isFalse(!!result, 'result should be falsy because "copies" is required');
      test.equal(invalidKeys.length, 1, 'There should be 1 invalidKey since validation happened on the server and errors were sent back');

      var insertedBook = books.findOne({title: title});
      test.isFalse(!!insertedBook, 'Book should not have been inserted because validation failed on server');
    } else {
      // When validate: false on the server, validation should be skipped
      test.isFalse(!!error, 'We expected no error because we skipped validation');
      test.isTrue(!!result, 'result should be set because we skipped validation');
      test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

      var insertedBook = books.findOne({title: title});
      test.isTrue(!!insertedBook, 'Book should have been inserted because we skipped validation on server');
    }

    // do a good one to set up update test
    books.insert({title: title + " 2", author: "James Joyce", copies: 1}, {validate: false, validationContext: "validateFalse2"}, function(error, newId) {
      var invalidKeys = books.simpleSchema().namedContext("validateFalse2").invalidKeys();

      test.isFalse(!!error, "We expected no error because it's valid");
      test.isTrue(!!newId, "result should be set because it's valid");
      test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

      var insertedBook = books.findOne({title: title + " 2"});
      test.isTrue(!!insertedBook, 'Book should have been inserted because it was valid');

      books.update({_id: newId}, {$set: {copies: "Yes Please"}}, {validate: false, validationContext: "validateFalse3"}, function(error, result) {
        var invalidKeys = books.simpleSchema().namedContext("validateFalse3").invalidKeys();

        if (Meteor.isClient) {
          // When validate: false on the client, we should still get a validation error and invalidKeys from the server
          test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
          test.isFalse(!!result, 'result should be falsy because "copies" is required');
          test.equal(invalidKeys.length, 1, 'There should be 1 invalidKey since validation happened on the server and invalidKeys were sent back');

          var updatedBook = books.findOne({_id: newId});
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, 1, 'copies should still be 1 because our new value failed validation on the server');
        } else {
          // When validate: false on the server, validation should be skipped
          test.isFalse(!!error, 'We expected no error because we skipped validation');
          test.isTrue(!!result, 'result should be set because we skipped validation');
          test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

          var updatedBook = books.findOne({_id: newId});
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, "Yes Please", 'copies should be changed despite being invalid because we skipped validation on the server');
        }

        // now try a good one
        books.update({_id: newId}, {$set: {copies: 3}}, {validate: false, validationContext: "validateFalse4"}, function(error, result) {
          var invalidKeys = books.simpleSchema().namedContext("validateFalse4").invalidKeys();
          test.isFalse(!!error, "We expected no error because it's valid");
          //result is undefined for some reason, but it's happening for apps without
          //C2 as well, so must be a Meteor bug
          //test.isTrue(!!result, "result should be set because it's valid");
          test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

          var updatedBook = books.findOne({_id: newId});
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, 3, 'copies should be changed because we used a valid value');

          next();
        });
      });
    });
  });
});

// Test denyAll
if (Meteor.isClient) {
  Tinytest.addAsync('Collection2 - Insert Deny Failure', function(test, next) {
    Meteor.call("denyAll", function() {
      books.insert({title: "Ulysses", author: "James Joyce", copies: 1}, function(error, result) {
        test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

        test.isFalse(result, 'result should be false');

        test.equal((error || {}).error, 403, 'We should get Access denied');

        // Clear denyAll settings so that tests work correctly if client
        // page is reloaded
        Meteor.call("allowAll", function() {
          next();
        });
      });
    });
  });
}

//Test API:
//test.isFalse(v, msg)
//test.isTrue(v, msg)
//test.equal(actual, expected, message, not)
//test.length(obj, len)
//test.include(s, v)
//test.isNaN(v, msg)
//test.isUndefined(v, msg)
//test.isNotNull
//test.isNull
//test.throws(func)
//test.instanceOf(obj, klass)
//test.notEqual(actual, expected, message)
//test.runId()
//test.exception(exception)
//test.expect_fail()
//test.ok(doc)
//test.fail(doc)
//test.equal(a, b, msg)
