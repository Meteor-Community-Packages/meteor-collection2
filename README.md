Collection2 [![Build Status](https://travis-ci.org/aldeed/meteor-collection2.png?branch=master)](https://travis-ci.org/aldeed/meteor-collection2)
=========================

A smart package for Meteor that extends Meteor.Collection to provide support
for specifying a schema and then validating against that schema
when inserting and updating.

This package requires and automatically installs the 
[simple-schema](https://github.com/aldeed/meteor-simple-schema) package,
which provides the `SimpleSchema` object type for defining and validating
against schemas.

## Installation

Install using Meteorite. When in a Meteorite-managed app directory, enter:

```
$ mrt add collection2
```

## Why Use Collection2?

* While adding allow/deny rules ensures that only authorized users can edit a
document from the client, adding a schema ensures that only acceptable properties
and values can be set within that document from the client. Thus, client side
inserts and updates can be allowed without compromising security or data integrity.
* Schema validation for all inserts and updates is reactive, allowing you to
easily display customizable validation error messages to the user without any
event handling.
* Schema validation for all inserts and updates is automatic on both the client
and the server, providing both speed and security.
* The [autoform](https://github.com/aldeed/meteor-autoform) package can
take your collection's schema and automatically create HTML5 forms based on it.
AutoForm provides automatic database operations, method calls, validation, and
user interface reactivity. You have to write very little markup and no event
handling. Refer to the [autoform](https://github.com/aldeed/meteor-autoform)
documentation for more information.

## Attaching a Schema to a Collection

Let's say we have a normal "books" collection, defined in *common.js*:

```js
Books = new Meteor.Collection("books");
```

Let's create a `SimpleSchema` schema for this collection. We'll do this in *common.js*, too:

```js
var Schemas = {};

Schemas.Book = new SimpleSchema({
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
});
```

Once we have the `SimpleSchema` instance, all we need to do is attach it to our collection using the `attachSchema` method. Again, we will do this in *common.js*:

```js
Books.attachSchema(Schemas.Book);
```

Now that our collection has a schema, we can do a validated insert on either the client or the server:

```js
Books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
  //The insert will fail, error will be set,
  //and result will be undefined or false because "copies" is required.
  //
  //The list of errors is available by calling Books.simpleSchema().namedContext().invalidKeys()
});
```

Or we can do a validated update:

```js
Books.update(book._id, {$unset: {copies: 1}}, function(error, result) {
  //The update will fail, error will be set,
  //and result will be undefined or false because "copies" is required.
  //
  //The list of errors is available by calling Books.simpleSchema().namedContext().invalidKeys()
});
```

### Attach a Schema to Meteor.users

Obviously, when you attach a schema, you must know what the schema should be. For `Meteor.users`,
here is an example schema, which you might have to adjust for your own needs:

```js
Schema = {};

Schema.UserCountry = new SimpleSchema({
    name: {
        type: String
    },
    code: {
        type: String,
        regEx: /^[A-Z]{2}$/
    }
});

Schema.UserProfile = new SimpleSchema({
    firstName: {
        type: String,
        regEx: /^[a-zA-Z-]{2,25}$/,
        optional: true
    },
    lastName: {
        type: String,
        regEx: /^[a-zA-Z]{2,25}$/,
        optional: true
    },
    birthday: {
        type: Date,
        optional: true
    },
    gender: {
        type: String,
        allowedValues: ['Male', 'Female'],
        optional: true
    },
    organization : {
        type: String,
        regEx: /^[a-z0-9A-z .]{3,30}$/,
        optional: true
    },
    website: {
        type: String,
        regEx: SimpleSchema.RegEx.Url,
        optional: true
    },
    bio: {
        type: String,
        optional: true
    },
    country: {
        type: Schema.UserCountry,
        optional: true
    }
});

Schema.User = new SimpleSchema({
    _id: {
        type: String,
        regEx: SimpleSchema.RegEx.Id
    },
    username: {
        type: String,
        regEx: /^[a-z0-9A-Z_]{3,15}$/
    },
    emails: {
        type: [Object]
    },
    "emails.$.address": {
        type: String,
        regEx: SimpleSchema.RegEx.Email
    },
    "emails.$.verified": {
        type: Boolean
    },
    createdAt: {
        type: Date
    },
    profile: {
        type: Schema.UserProfile,
        optional: true
    },
    services: {
        type: Object,
        optional: true,
        blackbox: true
    }
});

Meteor.users.attachSchema(Schema.User);
```

This schema has not been thoroughly vetted to ensure
that it accounts for all possible properties the accounts packages might try to set. Furthermore,
any other packages you add might also try to set additional properties. If you see warnings in the
console about keys being removed, that's a good indication that you should add those keys to the
schema.

Note also that this schema uses the `blackbox: true` option for simplicity. You might choose instead
to figure out a more specific schema.

(If you figure out a more accurate `Meteor.users` schema, documentation pull requests are welcome.)

## Schema Format

Refer to the
[simple-schema](https://github.com/aldeed/meteor-simple-schema) package
documentation for a list of all the available schema rules and validation
methods.

Use the `MyCollection.simpleSchema()` method to access the attached `SimpleSchema`
instance for a Meteor.Collection instance. For example:

```js
check(doc, MyCollection.simpleSchema());
```

## Validation Contexts

In the examples above, note that we called `namedContext()` with no arguments
to access the SimpleSchema reactive validation methods. Contexts let you keep
multiple separate lists of invalid keys for a single collection.
In practice you might be able to get away with always using the default context.
It depends on what you're doing. If you're using the context's reactive methods
to update UI elements, you might find the need to use multiple contexts. For example,
you might want one context for inserts and one for updates, or you might want
a different context for each form on a page.

To use a specific named validation context, use the `validationContext` option
when calling `insert` or `update`:

```js
Books.insert({title: "Ulysses", author: "James Joyce"}, { validationContext: "insertForm" }, function(error, result) {
  //The list of errors is available by calling Books.simpleSchema().namedContext("insertForm").invalidKeys()
});

Books.update(book._id, {$unset: {copies: 1}}, { validationContext: "updateForm" }, function(error, result) {
  //The list of errors is available by calling Books.simpleSchema().namedContext("updateForm").invalidKeys()
});
```

## Validating Without Inserting or Updating

It's also possible to validate a document without performing the actual insert or update:

```js
Books.simpleSchema().namedContext().validate({title: "Ulysses", author: "James Joyce"}, {modifier: false});
```

Set the modifier option to true if the document is a mongo modifier object.

You can also validate just one key in the document:

```js
Books.simpleSchema().namedContext().validateOne({title: "Ulysses", author: "James Joyce"}, "title", {modifier: false});
```

Or you can specify a certain validation context when calling either method:

```js
Books.simpleSchema().namedContext("insertForm").validate({title: "Ulysses", author: "James Joyce"}, {modifier: false});
Books.simpleSchema().namedContext("insertForm").validateOne({title: "Ulysses", author: "James Joyce"}, "title", {modifier: false});
```

Refer to the [simple-schema](https://github.com/aldeed/meteor-simple-schema) package documentation for more information about these methods.

## Inserting or Updating Without Validating

To skip validation, use the `validate: false` option when calling `insert` or
`update`. On the client (untrusted code), this will skip only client-side
validation. On the server (trusted code), it will skip all validation.

## Additional SimpleSchema Options

In addition to all the other schema validation options documented in the 
[simple-schema](https://github.com/aldeed/meteor-simple-schema) package, the
collection2 package adds additional options explained in this section.

### denyInsert and denyUpdate

If you set `denyUpdate: true`, any collection update that modifies the field
will fail. For instance:

```js
Posts = new Meteor.Collection('posts', {
  schema: new SimpleSchema({
    title: {
      type: String
    },
    content: {
      type: String
    },
    createdAt: {
      type: Date,
      denyUpdate: true
    }
  })
});

var postId = Posts.insert({title: 'Hello', content: 'World', createdAt: new Date});
```

The `denyInsert` option works the same way, but for inserts. If you set
`denyInsert` to true, you will need to set `optional: true` as well. 

### autoValue

The `autoValue` option is provided by the SimpleSchema package and is documented
there. Collection2 adds the following properties to `this` for any `autoValue`
function that is called as part of a C2 database operation:

* isInsert: True if it's an insert operation
* isUpdate: True if it's an update operation
* isUpsert: True if it's an upsert operation (either `upsert()` or `upsert: true`)
* userId: The ID of the currently logged in user. (Always `null` for server-initiated actions.)
* isFromTrustedCode: True if the insert, update, or upsert was initiated from trusted (server) code

Note that autoValue functions are run on the client only for validation purposes,
but the actual value saved will always be generated on the server, regardless of
whether the insert/update is initiated from the client or from the server.

There are many possible use cases for `autoValue`. It's probably easiest to
explain by way of several examples:

```js
{
  // Force value to be current date (on server) upon insert
  // and prevent updates thereafter.
  createdAt: {
    type: Date,
      autoValue: function() {
        if (this.isInsert) {
          return new Date;
        } else if (this.isUpsert) {
          return {$setOnInsert: new Date};
        } else {
          this.unset();
        }
      }
  },
  // Force value to be current date (on server) upon update
  // and don't allow it to be set upon insert.
  updatedAt: {
    type: Date,
    autoValue: function() {
      if (this.isUpdate) {
        return new Date();
      }
    },
    denyInsert: true,
    optional: true
  },
  // Whenever the "content" field is updated, automatically set
  // the first word of the content into firstWord field.
  firstWord: {
    type: String,
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        return content.value.split(' ')[0];
      } else {
        this.unset(); // Prevent user from supplying her own value
      }
    }
  },
  // Whenever the "content" field is updated, automatically
  // update a history array.
  updatesHistory: {
    type: [Object],
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        if (this.isInsert) {
          return [{
              date: new Date,
              content: content.value
            }];
        } else {
          return {
            $push: {
              date: new Date,
              content: content.value
            }
          };
        }
      } else {
        this.unset();
      }
    }
  },
  'updatesHistory.$.date': {
    type: Date,
    optional: true
  },
  'updatesHistory.$.content': {
    type: String,
    optional: true
  },
  // Automatically set HTML content based on markdown content
  // whenever the markdown content is set.
  htmlContent: {
    type: String,
    optional: true,
    autoValue: function(doc) {
      var markdownContent = this.field("markdownContent");
      if (Meteor.isServer && markdownContent.isSet) {
        return MarkdownToHTML(markdownContent.value);
      }
    }
  }
}
```

### index and unique

Use the `index` option to ensure a MongoDB index for a specific field:

```js
{
  title: {
    type: String,
    index: 1
  }
}
```

Set to `1` or `true` for an ascending index. Set to `-1` for a descending index.
Or you may set this to another type of specific MongoDB index, such as `"2d"`.
Indexes works on embedded sub-documents as well.

If you have created an index for a field by mistake and you want to remove it,
set `index` to `false`:

```js
{
  "address.street": {
    type: String,
    index: false
  }
}
```

If a field has the `unique` option set to `true`, the MongoDB index will be a
unique index as well. Then on the server, Collection2 will rely on MongoDB
to check uniqueness of your field, which is more efficient than our
custom checking.

```js
{
  "pseudo": {
    type: String,
    index: true,
    unique: true
  }
}
```

For the `unique` option to work, `index` must be `true`, `1`, or `-1`. The error message for uniqueness is very generic. It's best to define your own using
`MyCollection.simpleSchema().messages()`. The error type string is "notUnique".

Indexes are built in the background so indexing does *not* block other database
queries.

### custom

The `custom` option is provided by the SimpleSchema package and is documented
there. Collection2 adds the following properties to `this` for any `custom`
function that is called as part of a C2 database operation:

* isInsert: True if it's an insert operation
* isUpdate: True if it's an update operation
* isUpsert: True if it's an upsert operation (either `upsert()` or `upsert: true`)
* userId: The ID of the currently logged in user. (Always `null` for server-initiated actions.)
* isFromTrustedCode: True if the insert, update, or upsert was initiated from trusted (server) code

## What Happens When The Document Is Invalid?

The callback you specify as the last argument of your `insert()` or `update()` call
will have the first argument (`error`) set to a generic error. But generally speaking,
you would probably use the reactive methods provided by the SimpleSchema
validation context to display the specific error messages to the user somewhere.
The [autoform](https://github.com/aldeed/meteor-autoform) package provides
some UI components and helpers for this purpose.

## More Details

For the curious, this is exactly what Collection2 does before every insert or update:

1. Removes properties from your document or mongo modifier object if they are
not explicitly listed in the schema.
2. Automatically converts some properties to match what the schema expects, if possible.
3. Adds automatic (forced or default) values based on your schema.
4. Validates your document or mongo modifier object.
5. Performs the insert or update like normal, only if it was valid.

Collection2 is simply calling SimpleSchema methods to do these things.

This check happens on both the client and the server for client-initiated
actions, giving you the speed of client-side validation along with the security
of server-side validation.

## Problems?

You might find yourself in a situation where it seems as though validation is not working correctly. While it's possible that you've found a bug, it's more likely that you're running into one of the following tricky, confusing situations.

### SubObjects and Arrays of Objects

One critical thing to know about Collection2 and SimpleSchema is that they don't validate the *saved document* but rather the *proposed insert doc* or the *update modifier*. In the case of updates, this means there is some information unknown to SimpleSchema, such as whether the array object you're attempting to modify already exists or not. If it doesn't exist, MongoDB would create it, so SimpleSchema will validate conservatively. It will assume that any properties not set by the modifier will not exist after the update. This means that the modifier will be deemed invalid if any required keys in the same object are not explicitly set in the update modifier.

For example, say we add the following keys to our "books" schema:

```js
{
    borrowedBy: {
        type: [Object]
    },
    "borrowedBy.$.name": {
        type: String
    },
    "borrowedBy.$.email": {
        type: String,
        regEx: SimpleSchema.RegEx.Email
    },
}
```

Every object in the `borrowedBy` array must have a `name` and `email` property.

Now we discover that the name is incorrect in item 1, although the email address is correct. So we will just set the name to the correct value:

```js
Books.update(id, {$set: {"borrowedBy.1.name": "Frank"}});
```

However, this will not pass validation. Why? Because we don't know whether item 1 in the `borrowedBy` array already exists, so we don't know whether it will have the required `email` property after the update finishes.

There are three ways to make this work:

* `$set` the entire object
* `$set` all required keys in the object
* Perform the update on the server, and pass the `validate: false` option to skip validation.

When this situation occurs on the client with an `autoForm`, it generally does not cause any problems because AutoForm is smart enough to `$set` the entire object; it's aware of this potential issue. However, this means that you need to ensure that all required properties are represented by an `input` on the form. In our example, if you want an `autoForm` that only shows a field for changing the borrowedBy `name` and not the `email`, you should include both fields but make the `email` field hidden. Alternatively, you can submit the `autoForm` to a server method and then do a server update without validation.

Although these examples focused on an array of objects, sub-objects are treated basically the same way.

## Contributing

Anyone is welcome to contribute. Fork, make and test your changes (`mrt test-packages ./`),
and then submit a pull request.

### Major Contributors

@mquandalle

(Add yourself if you should be listed here.)

[![Support via Gittip](https://rawgithub.com/twolfson/gittip-badge/0.2.0/dist/gittip.png)](https://www.gittip.com/aldeed/)
