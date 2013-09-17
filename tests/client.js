Tinytest.add("Collection2 - denyInsert and denyUpdate", function(test) {
  var postId = Posts.insert({title: 'Hello', content: 'World'});
  var randomId = Posts.findOne(postId).randomId;

  Posts.update(postId, {$set: {randomId: 'hacked'}});
  test.equal(Posts.findOne(postId).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
});

Tinytest.add("Collection2 - denyInsert and denyUpdate on embedded collection", function(test) {
  var postId = Posts.insert({title: 'Hello', content: 'World'});
  var randomId = Posts.findOne(postId).randomId;

  Posts._collection.update(postId, {$set: {randomId: 'hacked'}});
    if (Meteor.isClient)
      test.equal(Posts.findOne({_id: postId}).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
    else
      test.equal(Posts.findOne({_id: postId}).randomId, 'hacked', 'expect randomId to be hacked on the server');
});

Tinytest.add("Collection2 - autovalues", function (test) {
  var postId = Posts.insert({title: 'Hello', content: 'World'});
  var post = Posts.findOne(postId);
  var randomId = post.randomId;
  test.isUndefined(post.updatedAt, 'expect the updatedAt to be undefined after insert');
  test.equal(post.firstWord, 'World', 'expect the firstWord to be correctly set after insert');

  Posts.update(postId, {$set: {content: 'Edited world'}});
  var post = Posts.findOne(postId);
  test.equal(post.updatedAt.toTimeString(), (new Date).toTimeString(), 'expect the updatedAt field to be updated with the current date');
  test.equal(post.firstWord, 'Edited', 'expect the firstWord to be edited after insert');
  test.equal(post.nbUpdates, 1);
});

Tinytest.add("Collection2 - defaultValues", function (test) {
});