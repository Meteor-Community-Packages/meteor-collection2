Tinytest.add('Collection2 - test environment', function(test) {
  test.isTrue(typeof Meteor.Collection2 !== 'undefined', 'test environment not initialized Meteor.Collection2');
  test.isTrue(typeof SchemaRegEx !== 'undefined', 'test environment not initialized SchemaRegEx');
  test.isTrue(typeof SimpleSchema !== 'undefined', 'test environment not initialized SimpleSchema');
});

// Test required field "copies"
Tinytest.addAsync('Collection2 - test insert required', function (test, onComplete) {
  Books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
    // The insert will fail, error will be set,
    test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
    // and result will be undefined because "copies" is required.
    test.isUndefined(result, 'result should be undefined because "copies" is required');
    // The list of errors is available by calling Books.namedContext("default").invalidKeys()
    var invalidKeys = Books.namedContext("default").invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

    var key = invalidKeys[0] || {};

    test.equal(key.name, 'copies', 'We expected the key "copies"');
    test.equal(key.type, 'required', 'We expected the type to be required');
    onComplete();
  });

  if (Meteor.isClient) 
    Meteor.call('denyAll');
});

// The client should not be allowed to insert data
Tinytest.addAsync('Collection2 - test insert deny', function (test, onComplete) {
  Books.insert({title: "Ulysses", author: "James Joyce", copies: 1 }, function(error, result) {

    if (Meteor.isClient) {
      // Client
      test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

      test.isUndefined(result, 'result should be undefined');

      test.equal(error.error, 403, 'We should get Access denied');

      // Open for next call allow all
      Meteor.call('allowAll');
    } else {
      // Server
      test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
      console.log(error);
      test.isTrue(!!result, 'result should be defined');

      var invalidKeys = Books.namedContext("default").invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get one invalidKey back');
    }
    onComplete();
  });  
});

// When allow is opened then client should be allowd to insert data
Tinytest.addAsync('Collection2 - test insert success', function (test, onComplete) {
  Books.insert({title: "Ulysses", author: "James Joyce", copies: 1 }, function(error, result) {

    test.isFalse(!!error, 'We expected the insert not to trigger an error since field "copies" are set to 1');
    test.isTrue(!!result, 'result should be defined');

    var invalidKeys = Books.namedContext("default").invalidKeys();
    test.equal(invalidKeys.length, 0, 'We should get one invalidKey back');
    if (Meteor.isClient) Meteor.call('allowAll');
    onComplete();
  });  
});

Tinytest.addAsync("Collection2 - denyInsert and denyUpdate", function(test, onComplete) {
  Posts.insert({title: 'Hello', content: 'World'}, function(err, postId) {
    var randomId = Posts.findOne({_id: postId}).randomId;
    
    Posts.update({_id: postId}, {$set: {randomId: 'hacked'}}, function(err, res) {
      test.equal(Posts.findOne({_id: postId}).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
      onComplete();
    });
  });
});

Tinytest.addAsync("Collection2 - denyInsert and denyUpdate on embedded collection", function(test, onComplete) {
  Posts.insert({title: 'Hello', content: 'World'}, function(err, postId) {
    var randomId = Posts.findOne({_id: postId}).randomId;
    
    Posts._collection.update({_id: postId}, {$set: {randomId: 'hacked'}}, function(err, res) {
      if (Meteor.isClient)
        test.equal(Posts.findOne({_id: postId}).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
      else
        test.equal(Posts.findOne({_id: postId}).randomId, 'hacked', 'expect randomId to be hacked on the server');

      onComplete();
    });
  });

});

Tinytest.addAsync("Collection2 - autoValues", function (test, onComplete) {
  Posts.insert({title: 'Hello', content: 'World'}, function(err, postId) {
    var post = Posts.findOne({_id: postId});

    test.isUndefined(post.updatedAt, 'expect the updatedAt to be undefined after insert');
    test.equal(post.firstWord, 'World', 'expect the firstWord to be correctly set after insert');
    
    Posts.update({_id: postId}, {$set: {content: 'Edited world'}}, function (err, res) {
      var post = Posts.findOne({_id: postId});
      test.equal(post.updatedAt.toTimeString(), (new Date).toTimeString(), 'expect the updatedAt field to be updated with the current date');
      test.equal(post.firstWord, 'Edited', 'expect the firstWord to be edited after insert');
      test.equal(post.nbUpdates, 1);
      onComplete();
    });
  });
});

Tinytest.addAsync("Collection2 - defaultValues", function (test, onComplete) {
  onComplete()
});