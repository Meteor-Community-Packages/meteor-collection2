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

//Allow all db operation for the clients
var alwaysTrueFunction = function() { return true };
if (Meteor.isServer)
    Posts.allow({insert: alwaysTrueFunction, update: alwaysTrueFunction, remove: alwaysTrueFunction});