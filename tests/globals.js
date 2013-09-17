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
      forceValue: function() {
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
      forceValue: function() {
        return new Date();
      },
      denyInsert: true,
      optional: true
    },
    nbUpdates: {
      type: Number,
      forceValue: function(doc, operation) {
        if (operation === 'insert')
          return 0
        else
          return {$inc: 1}
      }
    },
    firstWord: {
      type: String,
      forceValue: function(doc, operation) {
        if (operation === 'insert' && 'content' in doc)
          return doc.content.split(' ')[0]
        else if ('$set' in doc && 'content' in doc.$set)
          return doc.$set.content.split(' ')[0]
      }
    }
  }
});

Books = new Meteor.Collection2("books", {
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
  Books.remove({});
  Posts.remove({});

  //Allow all db operations for clients
  Posts.allow({
    insert: function() { return true; },
    update: function() { return true; },
    remove: function() { return true; }
  });

  // Rig test helper methods for setting denyAll / allowAll
  Meteor.methods({
    allowAll: function() {
      console.log('allowAll');
      Books.allow({
        insert: function() { return true; },
        update: function() { return true; },
        remove: function() { return true; }
      });
    },
    denyAll: function() {
      console.log('denyAll');
      Books.allow({
        insert: function() { return false; },
        update: function() { return false; },
        remove: function() { return false; }
      });
    },
  });
}


function equals(a, b) {
  return !!(EJSON.stringify(a) === EJSON.stringify(b));
}