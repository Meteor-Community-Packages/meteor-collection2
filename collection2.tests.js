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
        }
    }
});

if (Meteor.isServer) {
  // Empty the test db
  books.remove({});

  // Rig test helper methods for setting denyAll / allowAll
  Meteor.methods({
    allowAll: function() {
      console.log('allowAll');
      books.allow({
        insert: function() { return true; },
        update: function() { return true; },
        remove: function() { return true; },
      });
    },
    denyAll: function() {
      console.log('denyAll');
      books.allow({
        insert: function() { return false; },
        update: function() { return false; },
        remove: function() { return false; },
      });
    },
  });
}


function equals(a, b) {
  return !!(EJSON.stringify(a) === EJSON.stringify(b));
}

Tinytest.add('Collection2 - server - test environment', function(test) {
  test.isTrue(typeof Meteor.Collection2 !== 'undefined', 'test environment not initialized Meteor.Collection2');
  test.isTrue(typeof SchemaRegEx !== 'undefined', 'test environment not initialized SchemaRegEx');
  test.isTrue(typeof SimpleSchema !== 'undefined', 'test environment not initialized SimpleSchema');
});

// Test required field "copies"
Tinytest.addAsync('Collection2 - server - test insert required', function (test, onComplete) {
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
    onComplete();
  });
  if (Meteor.isClient) Meteor.call('denyAll');
});

// The client should not be allowed to insert data
Tinytest.addAsync('Collection2 - server - test insert deny', function (test, onComplete) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1 }, function(error, result) {

    if (Meteor.isClient) {
      // Client
      test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

      test.isFalse(!!result, 'result should be undefined');

      test.equal(error.error, 403, 'We should get Access denied');

      // Open for next call allow all
      Meteor.call('allowAll');
    } else {
      // Server
      test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
      console.log(error);
      test.isTrue(!!result, 'result should be defined');

      var invalidKeys = books.namedContext("default").invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get one invalidKey back');
    }
    onComplete();
  });  
});

// When allow is opened then client should be allowd to insert data
Tinytest.addAsync('Collection2 - server - test insert success', function (test, onComplete) {
  books.insert({title: "Ulysses", author: "James Joyce", copies: 1 }, function(error, result) {

    test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.namedContext("default").invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get one invalidKey back');
    if (Meteor.isClient) Meteor.call('allowAll');
    onComplete();
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