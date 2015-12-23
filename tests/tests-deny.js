Tinytest.addAsync("Collection2 - denyInsert", function (test, next) {
  books.insert({
    title: "Ulysses",
    author: "James Joyce",
    copies: 1,
    updatedAt: new Date()
  }, function (error) {
    test.isTrue(!!error, 'We expected the insert to trigger an error since updatedAt has denyInsert set to true');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
    var key = invalidKeys[0] || {};

    test.equal(key.name, 'updatedAt', 'We expected the key "updatedAt"');
    test.equal(key.type, 'insertNotAllowed', 'We expected the type to be "insertNotAllowed"');

    next();
  });
});

Tinytest.addAsync("Collection2 - denyUpdate", function (test, next) {
  // Test denyInsert valid case here so that we can use the inserted doc for the
  // update tests.
  books.insert({
    title: "Ulysses",
    author: "James Joyce",
    copies: 1,
    createdAt: new Date()
  }, function (error, newId) {
    test.isFalse(!!error,
      'We expected the insert not to trigger an error since createdAt denies updates but not inserts');

    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
    books.update({
      _id: newId
    }, {
      $set: {
        createdAt: new Date()
      }
    }, function (error) {
      test.isTrue(!!error, 'We expected the update to trigger an error since createdAt has denyUpdate set to true');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');
      var key = invalidKeys[0] || {};

      test.equal(key.name, 'createdAt', 'We expected the key "createdAt"');
      test.equal(key.type, 'updateNotAllowed', 'We expected the type to be "updateNotAllowed"');

      //now test valid case
      books.update({
        _id: newId
      }, {
        $set: {
          updatedAt: new Date()
        }
      }, function (error) {
        test.isFalse(!!error,
          'We expected the update not to trigger an error since updatedAt denies inserts but not updates');

        var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
        test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');
        next();
      });
    });
  });
});
