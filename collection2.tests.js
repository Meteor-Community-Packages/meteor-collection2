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
        },
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
        },
      });
    },
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
    //The list of errors is available by calling books.namedContext("default").invalidKeys()
    var invalidKeys = books.namedContext("default").invalidKeys();
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

      var invalidKeys = books.namedContext("default").invalidKeys();
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

    var invalidKeys = books.namedContext("default").invalidKeys();
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
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.namedContext("default").invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

    books.insert({title: "Ulysses", author: "James Joyce", copies: 1, isbn: isbn}, function(error, result) {

      test.isTrue(!!error, 'We expected the insert to trigger an error since isbn being inserted is already used');
      test.isFalse(!!result, 'result should not be defined');

      var invalidKeys = books.namedContext("default").invalidKeys();
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

  //test validation without actual updating

  //we don't know whether this would result in a non-unique value or not because
  //we don't know which documents we'd be changing; therefore, no notUnique error
  books.validate({$set: {isbn: isbn1}}, {modifier: true});
  var invalidKeys = books.namedContext("default").invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  books.validateOne({$set: {isbn: isbn1}}, "isbn", {modifier: true});
  invalidKeys = books.namedContext("default").invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  //test update calls
  books.update(selector, {$set: {isbn: isbn1}}, function(error) {

    test.isFalse(!!error, 'We expected the update not to trigger an error since isbn is used only by the doc being updated');

    var invalidKeys = books.namedContext("default").invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

    books.update(selector, {$set: {isbn: isbn2}}, function(error) {
      test.isTrue(!!error, 'We expected the update to trigger an error since isbn we want to change to is already used by a different document');

      var invalidKeys = books.namedContext("default").invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
      var key = invalidKeys[0] || {};

      test.equal(key.name, 'isbn', 'We expected the key "isbn"');
      test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
      next();
    });
  });
});

//Test API:
//test.isFalse(v, msg)
//test.isTrue(v, msg)
//test.equalactual, expected, message, not
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