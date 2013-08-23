Posts = new Meteor.Collection2('posts', {
    schema: {
        title: {
            type: String
        },
        content: {
            type: String
        },
        createdAt: {
            type: Date,
            autoValue: function() {
                return new Date();
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
        }
        firstWord: {
            type: String,
            autoValue: function(doc, operation) {
                if (operation === 'insert' && 'content' in doc)
                    return doc.content.split(' ')[0]
                else if ('$set' in doc && 'content' in doc.$set) {
                    return doc.$set.content.split(' ')[0]
            }
        }
    }
});

//Allow all db operations for clients
var alwaysTrueFunction = function() { return true };
if (Meteor.isServer)
    Posts.allow({insert: alwaysTrueFunction, update: alwaysTrueFunction, remove: alwaysTrueFunction});

Tinytest.add("Collection2 - autovalues", function (test) {
    var postId = Posts.insert({title: 'Hello', content: 'World'});
    var post = Posts.findOne(postId);
    var createdAt = new Date;
    test.equal(post.createdAt.toTimeString(), createdAt.toTimeString(), 'expect the createdAt field to be set with the current date');
    test.isUndefined(post.updatedAt, 'expect the updatedAt to be undefined after insert');

    Posts.update(postId, {$set: {content: 'World edited'}});
    var post = Posts.findOne(postId);
    test.equal(post.createdAt.toTimeString(), createdAt.toTimeString(), 'expect the createdAt field to be unchanged after update');
    test.equal(post.updatedAt.toTimeString(), (new Date).toTimeString(), 'expect the updatedAt field to be updated with the current date');
    test.equal(post.nbUpdates, 1);
});

Tinytest.add("Collection2 - denyInsert and denyUpdate", function(test) {

});