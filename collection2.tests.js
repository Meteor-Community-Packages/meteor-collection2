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
      unique: true,
      index: false
    },
    // XXX This field is not tested
    indexedIsbn: {
      type: String,
      label: "ISBN",
      optional: true,
      index: 1,
      unique: true
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

var autoValues = new Meteor.Collection("autoValues", {
  schema: new SimpleSchema({
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
  })
});

if (Meteor.isServer) {
  Meteor.publish("books", function() {
    return books.find();
  });

  Meteor.publish("autovalues", function() {
    return autoValues.find();
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
    }
  });

  Meteor.startup(function() {
    books.remove({});
    autoValues.remove({});
  });
} else {
  Meteor.subscribe("books");
  Meteor.subscribe("autovalues");
}

function equals(a, b) {
  return !!(EJSON.stringify(a) === EJSON.stringify(b));
}

Tinytest.add('Collection2 - Test Environment', function(test) {
  test.isTrue(typeof SchemaRegEx !== 'undefined', 'test environment not initialized SchemaRegEx');
  test.isTrue(typeof SimpleSchema !== 'undefined', 'test environment not initialized SimpleSchema');
});

if (Meteor.isServer) {
  Tinytest.add('Collection2 - Ensure Index', function(test) {
    // We need to have an access to the getIndexes method of the embedded
    // collection in order to test this feature.
    // var indexes = books._collection._getIndexes();
  });
}

// Test required field "copies"
Tinytest.addAsync('Collection2 - Insert Required', function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
    //The insert will fail, error will be set,
    test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
    //and result will be falsy because "copies" is required.
    test.isFalse(!!result, 'result should be falsy because "copies" is required');
    //The list of errors is available by calling books.simpleSchema().namedContext().invalidKeys()
    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

    var key = invalidKeys[0] || {};

    test.equal(key.name, 'copies', 'We expected the key "copies"');
    test.equal(key.type, 'required', 'We expected the type to be required');
    next();
  });
});

// When unique: true, inserts should fail if another document already has the same value
Tinytest.addAsync('Collection2 - Unique', function(test, next) {
  var isbn = Meteor.uuid();

  var bookId = books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
  });

  // Ensure that the next test doesn't begin until the previous document is
  // fully inserted.
  var called = false;
  books.find({isbn: isbn}).observe({
    added: function() {
      if (!called) {
        called = true;
        books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
          test.isTrue(!!error, 'We expected the insert to trigger an error since isbn being inserted is already used');
          test.isFalse(!!result, 'result should not be defined');

          var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
          test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
          var key = invalidKeys[0] || {};

          test.equal(key.name, 'isbn', 'We expected the key "isbn"');
          test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');

          //one last insertion to set up the update tests
          books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn + "A"}, function(error, result) {
            var context = books.simpleSchema().namedContext();

            //test validation without actual updating

            //we don't know whether this would result in a non-unique value or not because
            //we don't know which documents we'd be changing; therefore, no notUnique error
            context.validate({$set: {isbn: isbn}}, {modifier: true});
            var invalidKeys = context.invalidKeys();
            test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

            context.validateOne({$set: {isbn: isbn}}, "isbn", {modifier: true});
            invalidKeys = context.invalidKeys();
            test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
            
            // When unique: true, updates should fail if another document already has the same value but
            // not when the document being updated has the same value
            books.update(bookId, {$set: {isbn: isbn}}, function(error) {
              test.isFalse(!!error, 'We expected the update not to trigger an error since isbn is used only by the doc being updated');

              var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
              test.equal(invalidKeys, [], 'We should get no invalidKeys back');

              books.update(bookId, {$set: {isbn: isbn + "A"}}, function(error) {
                test.isTrue(!!error, 'We expected the update to trigger an error since isbn we want to change to is already used by a different document');

                var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
                test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
                var key = invalidKeys[0] || {};

                test.equal(key.name, 'isbn', 'We expected the key "isbn"');
                test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
                next();
              });
            });
          });
        });
      }
    }
  });
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

// Test denyAll
if (Meteor.isClient) {
  Tinytest.addAsync('Collection2 - Insert Deny Failure', function(test, next) {
    Meteor.call("denyAll", function() {
      books.insert({title: "Ulysses", author: "James Joyce", copies: 1}, function(error, result) {
        test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

        test.isFalse(!!result, 'result should be undefined');

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
