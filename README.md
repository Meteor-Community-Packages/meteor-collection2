Collection2 [![Build Status](https://travis-ci.org/aldeed/meteor-collection2.png?branch=master)](https://travis-ci.org/aldeed/meteor-collection2)
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating. Also adds support for virtual fields.

## Installation

Install using Meteorite. When in a Meteorite-managed app directory, enter:

```
$ mrt add collection2
```

## Basic Usage

When defining your models, use `new Meteor.Collection2()` instead of `new Meteor.Collection()`. It works the same, but you can specify `schema` and `virtualFields` properties in the options.

## Example

Define the schema for your collection when creating it:

```js
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
```

Do an insert:

```js
Books.insert({title: "Ulysses", author: "James Joyce"}, function(error, result) {
  //The insert will fail, error will be set,
  //and result will be undefined because "copies" is required.
  //
  //The list of errors is available by calling Books.simpleSchema().namedContext().invalidKeys()
});
```

Or do an update:

```js
Books.update(book._id, {$unset: {copies: 1}}, function(error, result) {
  //The update will fail, error will be set,
  //and result will be undefined because "copies" is required.
  //
  //The list of errors is available by calling Books.simpleSchema().namedContext().invalidKeys()
});
```

## Schema Format

The schema object format is actually dictated by the [simple-schema](https://github.com/aldeed/meteor-simple-schema) package,
which is installed when you install `collection2`. See that documentation. If
you need to get the actual SimpleSchema for any reason, such as to access any
of the methods on it, you can do so by calling `MyCollection2.simpleSchema()`.
You can alternatively specify an already-created SimpleSchema object for `schema`
in the constructor options.

For example:

```js
check(doc, MyCollection2.simpleSchema());
```

## Validation Contexts

In the examples above, note that we called `namedContext()` with no arguments
to access the SimpleSchema reactive validation methods. Contexts let you keep
multiple separate lists of invalid keys for a single collection2.
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

## Additional SimpleSchema Options

In addition to all the other schema validation options documented in the 
[simple-schema](https://github.com/aldeed/meteor-simple-schema) package, the
collection2 package adds `unique`, `denyInsert`, `denyUpdate`, and `autoValue`.

### unique

Set `unique: true` in your schema to ensure that non-unique values will never
be set for the key. You may want to ensure a unique mongo index on the server
as well.

Note: This check is currently not 100% foolproof for updates. It is possible
for a malicious user to bypass the check. This is not a fixable issue given
the current core Meteor APIs, but you can guard against misuse by 
ensuring a unique mongo index on the server.

The error message for this is very generic. It's best to define your own using
`MyCollection2.simpleSchema().messages()`. The error type string is "notUnique".

### denyInsert and denyUpdate

If you set `denyUpdate: true`, any collection update that modifies the field
will fail. For instance:

```js
Posts = new Meteor.Collection2('posts', {
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
});

var postId = Posts.insert({title: 'Hello', content: 'World', createdAt: new Date});
```

The `denyInsert` option works the same way, but for inserts. If you set
`denyInsert` to true, you will need to set `optional: true` as well. 

### autoValue

The `autoValue` option allows you to specify a function that is called on every
insert or update to determine what the value for the field should be. This is
a powerful feature that allows you to set up either forced values or default
values.

An `autoValue` function is passed the document or modifier as its only argument,
but you will generally not need it. Instead, the function context provides a
variety of properties and methods to help you determine what you should return.

If an `autoValue` function returns `undefined`, the field's value will be
whatever the document or modifier says it should be. Any other return value will
be used as the field's value. You may also return special pseudo-modifier objects
for update operations. Examples are `{$inc: 1}` and `{$push: new Date}`.

The following properties and methods are available in `this` for an `autoValue`
function:

* isInsert: True if it's an insert operation
* isUpdate: True if it's an update operation
* isSet: True if the field is already set in the document or modifier.
* value: If isSet = true, this contains the field's current (requested) value
in the document or modifier.
* operator: If isSet = true and isUpdate = true, this contains the name of the 
update operator in the modifier in which this field is being changed. For example,
if the modifier were `{$set: {name: "Alice"}}`, in the autoValue function for
the `name` field, `this.isSet` would be true, `this.value` would be "Alice",
and `this.operator` would be "$set".
* field(): Use this method to get information about other fields. Pass a field
name (schema key) as the only argument. The return object will have isSet, value,
and operator properties for that field.

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
          return new Date();
        }
      },
      denyUpdate: true
  },
  // Force value to be current date (on server) upon update
  // and don't allow it to be set upon insert.
  updatedAt: {
    type: Date,
    autoValue: function() {
      if (this.isUpdate) {
        return new Date();
      }
    }
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
        return null; // Prevent user from supplying her own value
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

## Why Use Collection2?

In addition to getting all of the benefits provided by the [simple-schema](https://github.com/aldeed/meteor-simple-schema) package,
Collection2 sets up automatic validation, on both the client and the server, whenever you do
a normal `insert()` or `update()`. Once you've defined the schema, you no longer
have to worry about invalid data. Collection2 makes sure that nothing can get
into your database if it doesn't match the schema.

## Offline Collections

If you want to use an Offline Collection, provided by the
[offline-data](https://github.com/awwx/meteor-offline-data) package,
you can. Create the `Offline.Collection` instance and then pass it as the
first argument of the Collection2 constructor function on the client.

*client.js:*

```js
BooksOffline = new Offline.Collection("books");
Books = new Meteor.Collection2(BooksOffline, {
    schema: {
        //keys
    }
});
```

*server.js:*

```js
Books = new Meteor.Collection2("books", {
    schema: {
        //keys
    }
});
```

Then use `Books` instead of `BooksOffline` throughout your code, and you will gain the
benefits of both Offline.Collection and Collection2.

## SmartCollections

If you want to use a SmartCollection, provided by the
[smart-collections](https://github.com/arunoda/meteor-smart-collections) package,
you can.

One way is to create the SmartCollection object, and then pass it as the first argument
of the Collection2 constructor function.

```js
BooksSC = new Meteor.SmartCollection("books");
Books = new Meteor.Collection2(BooksSC, {
    schema: {
        //keys
    }
});
```

Then use `Books` instead of `BooksSC` throughout your code, and you will gain the
benefits of both SmartCollection and Collection2.

Another way is to use the `smart: true` option:

```js
Books = new Meteor.Collection2("books", {
    smart: true,
    schema: {
        //keys
    }
});
```

If you have not added the `smart-collections` package to your app, the `smart: true`
option will not do anything.

## AutoForms

Another great reason to use Collection2 is so that you can use the [autoform](https://github.com/aldeed/meteor-autoform) package.
AutoForm makes use of Collection2 to help you quickly develop forms that do complex inserts
and updates with automatic client and server validation. Refer to the [autoform](https://github.com/aldeed/meteor-autoform)
documentation for more information.

## What Happens When The Document Is Invalid?

The callback you specify as the last argument of your `insert()` or `update()` call
will have the first argument (`error`) set to a generic error. But generally speaking,
you would probably use the reactive methods provided by the SimpleSchema validation context to display
the specific error messages to the user somewhere. The [autoform](https://github.com/aldeed/meteor-autoform) package provides
some handlebars helpers for this purpose.

## More Details

For the curious, this is exactly what Collection2 does before every insert or update:

1. Removes properties from your document or mongo modifier object if they are not explicitly listed in the schema.
2. Automatically converts some properties to match what the schema expects, if possible.
3. Validates your document or mongo modifier object.
4. Performs the insert or update like normal, only if it was valid.

Collection2 is simply calling SimpleSchema methods to do these things.

This check happens on both the client and the server for client-initiated actions.
Validation even happens if a malicious user inserts or updates the wrapped Meteor.Collection
directly from the client, bypassing the Meteor.Collection2, so your data is secure.

If you need to do something wonky, there is one way to insert or update without
validation. You can call insert or update on the underlying Meteor.Collection
from trusted server code (`MyCollection2._collection.insert(obj)`).

## Virtual Fields

You can also implement easy virtual fields. Here's an example of that:

```js
Persons = new Meteor.Collection2("persons", {
    schema: {
        firstName: {
            type: String,
            label: "First name",
            max: 30
        },
        lastName: {
            type: String,
            label: "Last name",
            max: 30
        }
    },
    virtualFields: {
        fullName: function(person) {
            return person.firstName + " " + person.lastName;
        }
    }
});
```

This adds the virtual field to documents retrieved with `find()`, etc., which means you could
now do `{{fullName}}` in your HTML as if fullName were actually stored in the MongoDB collection.
However, you cannot query on a virtual field.

## Contributing

Anyone is welcome to contribute. Fork, make and test your changes (`mrt test-packages ./`),
and then submit a pull request.

### Major Contributors

@mquandalle
