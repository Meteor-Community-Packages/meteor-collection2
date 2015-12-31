if (Meteor.isServer) {
  Tinytest.add('Collection2 - Ensure Index', function () {
    // We need to have an access to the getIndexes method of the embedded
    // collection in order to test this feature.
    // var indexes = books._collection._getIndexes();
  });
}

// When unique: true, inserts should fail if another document already has the same value
var uniqueBookId, isbn;
Tinytest.addAsync('Collection2 - Unique - Prep', function (test, next) {
  isbn = Random.id();
  // Insert isbn
  uniqueBookId = books.insert({
    title: "Ulysses",
    author: "James Joyce",
    copies: 1,
    isbn: isbn
  }, function (error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    // Insert isbn+"A"
    books.insert({
      title: "Ulysses",
      author: "James Joyce",
      copies: 1,
      isbn: isbn + "A"
    }, function (error, result) {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since isbn is unique');
      test.isTrue(!!result, 'result should be defined');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
      next();
    });
  });
});

Tinytest.addAsync('Collection2 - Unique - Insert Duplicate', function (test, next) {
  books.insert({
    title: "Ulysses",
    author: "James Joyce",
    copies: 1,
    isbn: isbn
  }, function (error, result) {
    test.isTrue(!!error, 'We expected the insert to trigger an error since isbn being inserted is already used');
    test.equal(error.invalidKeys.length, 1, 'We should get one invalidKey back attached to the Error object');
    test.isFalse(result, 'result should be false');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'isbn', 'We expected the key "isbn"');
    test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
    next();
  });
});

Tinytest.addAsync('Collection2 - Unique - Insert Duplicate Non-C2 Index', function (test, next) {
  var val = Meteor.isServer ? 'foo' : 'bar';

  // Good insert
  books.insert({
    title: "Ulysses",
    author: "James Joyce",
    copies: 1,
    field1: val,
    field2: val
  }, function (error, result) {
    test.isFalse(!!error, 'We expected the insert not to trigger an error since the fields are unique');
    test.isTrue(!!result, 'result should be the new ID');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

    // Bad insert
    books.insert({
      title: "Ulysses",
      author: "James Joyce",
      copies: 1,
      field1: val,
      field2: val
    }, function (error, result) {
      test.isTrue(!!error, 'We expected the insert to trigger an error since the fields are not unique');
      test.isFalse(result, 'result should be false');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back because this is a non-C2 unique index');

      next();
    });
  });
});

Tinytest.addAsync('Collection2 - Unique - Validation Alone', function (test, next) {
  //test validation without actual updating
  var context = books.simpleSchema().namedContext();

  //we don't know whether this would result in a non-unique value or not because
  //we don't know which documents we'd be changing; therefore, no notUnique error
  context.validate({
    $set: {
      isbn: isbn
    }
  }, {
    modifier: true
  });
  var invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

  context.validateOne({
    $set: {
      isbn: isbn
    }
  }, "isbn", {
    modifier: true
  });
  invalidKeys = context.invalidKeys();
  test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
  next();
});

Tinytest.addAsync('Collection2 - Unique - Update Self', function (test, next) {
  // When unique: true, updates should not fail when the document being updated has the same value
  books.update(uniqueBookId, {
    $set: {
      isbn: isbn
    }
  }, function (error) {
    test.isFalse(!!error,
      'We expected the update not to trigger an error since isbn is used only by the doc being updated');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys, [], 'We should get no invalidKeys back');
    next();
  });
});

Tinytest.addAsync('Collection2 - Unique - Update Another', function (test, next) {
  // When unique: true, updates should fail if another document already has the same value
  books.update(uniqueBookId, {
    $set: {
      isbn: isbn + "A"
    }
  }, function (error) {
    test.isTrue(!!error,
      'We expected the update to trigger an error since isbn we want to change to is ' +
      'already used by a different document');
    test.equal(error.invalidKeys.length, 1, 'We should get one invalidKey back attached to the Error object');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'isbn', 'We expected the key "isbn"');
    test.equal(key.type, 'notUnique', 'We expected the type to be "notUnique"');
    next();
  });
});

var testCollection = new Mongo.Collection("testCollection");
Tinytest.add('Collection2 - Unique - Object Array', function (test) {
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