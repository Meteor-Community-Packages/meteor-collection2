Posts = new Meteor.Collection2('posts', {
    schema: {
        title: {
            type: String
        },
        content: {
            type: String
        },
        randomId: {
            type: String,
            autoValue: function() {
                // From http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
                var text = "";
                var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

                for( var i=0; i < 5; i++ )
                    text += possible.charAt(Math.floor(Math.random() * possible.length));

                return text;
            },
            denyUpdate: true
        },
        updatedAt: {
            type: Date,
            autoValue: function() {
                return new Date();
            },
            denyInsert: true,
            optional: true
        },
        nbUpdates: {
            type: Number,
            autoValue: function(doc, operation) {
                if (operation === 'insert')
                    return 0
                else
                    return {$inc: 1}
            }
        },
        firstWord: {
            type: String,
            autoValue: function(doc, operation) {
                if (operation === 'insert' && 'content' in doc)
                    return doc.content.split(' ')[0]
                else if ('$set' in doc && 'content' in doc.$set)
                    return doc.$set.content.split(' ')[0]
            }
        }
    }
});

//Allow all db operations for clients
var alwaysTrueFunction = function() { return true };
if (Meteor.isServer)
    Posts.allow({insert: alwaysTrueFunction, update: alwaysTrueFunction, remove: alwaysTrueFunction});

Tinytest.add("Collection2 - denyInsert and denyUpdate", function(test) {
    var postId = Posts.insert({title: 'Hello', content: 'World'});
    var randomId = Posts.findOne(postId).randomId;

    Posts.update(postId, {$set: {randomId: 'hacked'}});
    test.equal(Posts.findOne(postId).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
    
    if (Meteor.isClient)  {
        Posts._collection.update(postId, {$set: {randomId: 'hacked'}});
        test.equal(Posts.findOne(postId).randomId, randomId, 'expect randomId to be unchanged after trying to update it');
    }
});

Tinytest.add("Collection2 - autovalues", function (test) {
    var postId = Posts.insert({title: 'Hello', content: 'World'});
    var post = Posts.findOne(postId);
    var randomId = post.randomId;
    test.isUndefined(post.updatedAt, 'expect the updatedAt to be undefined after insert');
    test.equal(post.firstWord, 'World', 'expect the firstWord to be correctly set after insert');

    Posts.update(postId, {$set: {content: 'Edited world'}});
    var post = Posts.findOne(postId);
    test.equal(post.randomId, randomId, 'expect the randomId field to be unchanged after update');
    test.equal(post.updatedAt.toTimeString(), (new Date).toTimeString(), 'expect the updatedAt field to be updated with the current date');
    test.equal(post.firstWord, 'Edited', 'expect the firstWord to be edited after insert');
    test.equal(post.nbUpdates, 1);
});