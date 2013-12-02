books = new Meteor.Collection2("books", {
  schema: {
    title: {
      type: String,
      label: "Title",
      max: 200
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
  }
});

if (Meteor.isServer) {
  // Empty the test db
  books.remove({});
  Meteor.publish("books", function() {
    return books.find();
  });

  // Rig test helper methods for setting denyAll / allowAll
  Meteor.methods({
    allowAll: function() {
      console.log('allowAll');
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
    },
    denyAll: function() {
      console.log('denyAll');
      books.allow({
        insert: function() {
          return false;
        },
        update: function() {
          return false;
        },
        remove: function() {
          return false;
        }
      });
    }
  });
} else {
  Meteor.subscribe("books");
}

function equals(a, b) {
  return !!(EJSON.stringify(a) === EJSON.stringify(b));
}

Tinytest.add('Collection2 - Test Environment', function(test) {
  test.isTrue(typeof Meteor.Collection2 !== 'undefined', 'test environment not initialized Meteor.Collection2');
  test.isTrue(typeof SchemaRegEx !== 'undefined', 'test environment not initialized SchemaRegEx');
  test.isTrue(typeof SimpleSchema !== 'undefined', 'test environment not initialized SimpleSchema');
});

// Test required field "copies"
Tinytest.addAsync('Collection2 - Insert Required', function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
    //The insert will fail, error will be set,
    test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
    //and result will be undefined because "copies" is required.
    //
    test.isUndefined(result, 'result should be undefined because "copies" is required');
    //The list of errors is available by calling books.simpleSchema().namedContext().invalidKeys()
    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

    var key = invalidKeys[0] || {};

    test.equal(key.name, 'copies', 'We expected the key "copies"');
    test.equal(key.type, 'required', 'We expected the type to be required');
    if (Meteor.isClient) {
      Meteor.call('denyAll', function() {
        next();
      });
    } else {
      next();
    }
  });
});

// The client should not be allowed to insert data
Tinytest.addAsync('Collection2 - Insert Deny', function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1}, function(error, result) {
    if (Meteor.isClient) {
      // Client
      test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

      test.isFalse(!!result, 'result should be undefined');

      test.equal(error.error, 403, 'We should get Access denied');

      // Open for next call allow all
      Meteor.call('allowAll', function() {
        next();
      });
    } else {
      // Server
      test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
      test.isTrue(!!result, 'result should be defined');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get one invalidKey back');
      next();
    }
  });
});

// When allow is opened then client should be allowd to insert data
Tinytest.addAsync('Collection2 - Insert Success', function(test, next) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1}, function(error, result) {

    test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    if (Meteor.isClient) {
      Meteor.call('allowAll', function() {
        next();
      });
    } else {
      next();
    }
  });
});

// When unique: true, inserts should fail if another document already has the same value
Tinytest.addAsync('Collection2 - Insert Unique', function(test, next) {
  var isbn; //use different on client and server otherwise insertion in one place will cause it to be not unique in the other
  if (Meteor.isClient) {
    isbn = "978-1840226355";
  } else {
    isbn = "1840226358";
  }

  var context = books.simpleSchema().namedContext();

  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = context.invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

    books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {

      test.isTrue(!!error, 'We expected the insert to trigger an error since isbn being inserted is already used');
      test.isFalse(!!result, 'result should not be defined');

      var invalidKeys = context.invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
      var key = invalidKeys[0] || {};

      test.equal(key.name, 'isbn', 'We expected the key "isbn"');
      test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
      next();
    });
  });
});

// When unique: true, updates should fail if another document already has the same value but
// not when the document being updated has the same value
Tinytest.addAsync('Collection2 - Update Unique', function(test, next) {
  var isbn1 = "978-1840226355";
  var isbn2 = "1840226358";

  var selector = {isbn: isbn1};
  if (Meteor.isClient) {
    //untrusted code may only update by ID
    selector = books.findOne(selector)._id;
  }

  var context = books.simpleSchema().namedContext();

  //test validation without actual updating

  //we don't know whether this would result in a non-unique value or not because
  //we don't know which documents we'd be changing; therefore, no notUnique error
  context.validate({$set: {isbn: isbn1}}, {modifier: true});
  var invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
  console.log(invalidKeys);

  context.validateOne({$set: {isbn: isbn1}}, "isbn", {modifier: true});
  invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  //test update calls
  books.update(selector, {$set: {isbn: isbn1}}, function(error) {

    test.isFalse(!!error, 'We expected the update not to trigger an error since isbn is used only by the doc being updated');

    var invalidKeys = context.invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

    books.update(selector, {$set: {isbn: isbn2}}, function(error) {
      test.isTrue(!!error, 'We expected the update to trigger an error since isbn we want to change to is already used by a different document');

      var invalidKeys = context.invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
      var key = invalidKeys[0] || {};

      test.equal(key.name, 'isbn', 'We expected the key "isbn"');
      test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
      next();
    });
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

Tinytest.addAsync("Collection2 - denyInsert on wrapped collection", function(test, next) {
  books._collection.insert({title: "Ulysses", author: "James Joyce", copies: 1, updatedAt: new Date}, function(error, result) {
    if (Meteor.isClient) {
      test.isTrue(!!error, 'We expected the insert to trigger an error since updatedAt has denyInsert set to true');
    } else {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since we are on the server');
    }
    next();
  });
});

Tinytest.addAsync("Collection2 - denyUpdate on wrapped collection", function(test, next) {
  // Test denyInsert valid case here so that we can use the inserted doc for the
  // update tests.
  books._collection.insert({title: "Ulysses", author: "James Joyce", copies: 1, createdAt: new Date}, function(error, newId) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since createdAt denies updates but not inserts');

    books._collection.update({_id: newId}, {$set: {createdAt: new Date}}, function(error, result) {
      if (Meteor.isClient) {
        test.isTrue(!!error, 'We expected the insert to trigger an error since createdAt has denyUpdate set to true');
      } else {
        test.isFalse(!!error, 'We expected the insert not to trigger an error since we are on the server');
      }
      //now test valid case
      books._collection.update({_id: newId}, {$set: {updatedAt: new Date}}, function(error, result) {
        test.isFalse(!!error, 'We expected the update not to trigger an error since updatedAt denies inserts but not updates');
        next();
      });
    });
  });
});

//Tinytest.addAsync("Collection2 - forceValue", function(test, next) {
//  Posts.insert({title: 'Hello', content: 'World'}, function(err, postId) {
//    var post = Posts.findOne({_id: postId});
//
//    test.isUndefined(post.updatedAt, 'expect the updatedAt to be undefined after insert');
//    test.equal(post.firstWord, 'World', 'expect the firstWord to be correctly set after insert');
//
//    Posts.update({_id: postId}, {$set: {content: 'Edited world'}}, function(err, res) {
//      var post = Posts.findOne({_id: postId});
//      test.equal(post.updatedAt.toTimeString(), (new Date).toTimeString(), 'expect the updatedAt field to be updated with the current date');
//      test.equal(post.firstWord, 'Edited', 'expect the firstWord to be edited after insert');
//      test.equal(post.nbUpdates, 1);
//      next();
//    });
//  });
//});
//
//Tinytest.addAsync("Collection2 - defaultValue", function(test, next) {
//  //TODO
//  next();
//});

//upserts are server only when this package is used
if (Meteor.isServer) {

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
    books.upsert({title: "Ulysses", author: "James Joyce"}, {$set: {copies: 1}}, function(error) {

      test.isFalse(!!error, 'We expected the upsert not to trigger an error since the selector values should be used');

      invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      books.upsert({title: "Ulysses", author: "James Joyce"}, {$set: {copies: 1}}, {upsert: true}, function(error) {

        test.isFalse(!!error, 'We expected the update/upsert not to trigger an error since the selector values should be used');

        invalidKeys = books.simpleSchema().namedContext().invalidKeys();
        test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

        next();
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