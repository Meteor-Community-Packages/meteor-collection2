Collection2
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
  //The list of errors is available by calling Books.namedContext("default").invalidKeys()
});
```

Or do an update:

```js
Books.update(book._id, {$unset: {copies: 1}}, function(error, result) {
  //The update will fail, error will be set,
  //and result will be undefined because "copies" is required.
  //
  //The list of errors is available by calling Books.namedContext("default").invalidKeys()
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

In the examples above, note that we retrieved the "default" validation context
to access the SimpleSchema reactive validation methods. Contexts let you keep
multiple separate lists of invalid keys for a single collection2.
In practice you might be able to get away with always using the "default" context.
It depends on what you're doing. If you're using the context's reactive methods
to update UI elements, you might find the need to use multiple contexts. For example,
you might want one context for inserts and one for updates, or you might want
a different context for each form on a page.

To use a specific named validation context, use the `validationContext` option
when calling `insert` or `update`:

```js
Books.insert({title: "Ulysses", author: "James Joyce"}, { validationContext: "insertForm" }, function(error, result) {
  //The list of errors is available by calling Books.namedContext("insertForm").invalidKeys()
});

Books.update(book._id, {$unset: {copies: 1}}, { validationContext: "updateForm" }, function(error, result) {
  //The list of errors is available by calling Books.namedContext("updateForm").invalidKeys()
});
```

## Validating Without Inserting or Updating

It's also possible to validate a document without performing the actual insert or update:

```js
Books.validate({title: "Ulysses", author: "James Joyce"}, {modifier: false});
```

Set the modifier option to true if the document is a mongo modifier object.

You can also validate just one key in the document:

```js
Books.validateOne({title: "Ulysses", author: "James Joyce"}, "title", {modifier: false});
```

And this is how you specify a certain validation context:

```js
Books.validate({title: "Ulysses", author: "James Joyce"}, {modifier: false, validationContext: "insertForm"});
Books.validateOne({title: "Ulysses", author: "James Joyce"}, "title", {modifier: false, validationContext: "insertForm"});
```

## Unique

In addition to all the other schema validation options documented in the 
[simple-schema](https://github.com/aldeed/meteor-simple-schema) package, the
collection2 package adds one more: `unique`. Set this to true in your schema
to ensure that non-unique values will never be set for the key. You may want
to ensure a unique mongo index on the server as well.

The error message for this is very generic. It's best to define your own using
`MyCollection2.simpleSchema().messages()`. The error type string is "notUnique".

## Why Use It?

In addition to getting all of the benefits provided by the [simple-schema](https://github.com/aldeed/meteor-simple-schema) package,
Collection2 sets up automatic property filtering, type conversion, and,
most importantly, validation, on both the client and the server, whenever you do
a normal `insert()` or `update()`. Once you've defined the schema, you no longer
have to worry about invalid data. Collection2 makes sure that nothing can get
into your database if it doesn't match the schema.

### SmartCollections

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

### AutoForms

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

In reality, Collection2 is simply calling SimpleSchema methods to do these things. The following
is the gist of the entire package:

```js
//clean up doc
doc = schema.clean(doc);
//validate doc
context.validate(doc);

if (context.isValid()) {
    //perform insert or update
} else {
    //pass error to callback or throw it
}
```

This same check happens on both the client and the server for client-initiated actions.
Validation even happens if you insert or update the wrapped Meteor.Collection
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

This adds the virtual field to documents retrieved with `find()`, etc., which means you could now do `{{fullName}}` in your HTML as if fullName were actually stored in the MongoDB collection.

## Contributing

Anyone is welcome to contribute. Fork, make and test your changes (`meteor test-packages ./`),
and then submit a pull request.

### Major Contributors

@mquandalle