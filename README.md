Collection2
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating. Also adds support for virtual fields.

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
  //The list of errors is available by calling Books.simpleSchema().invalidKeys()
});
```

Or do an update:

```js
Books.update(book._id, {$unset: {copies: 1}}, function(error, result) {
  //The update will fail, error will be set,
  //and result will be undefined because "copies" is required.
  //
  //The list of errors is available by calling Books.simpleSchema().invalidKeys()
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
check(doc, MyCollection2.simpleSchema().match());
```

## Why Use It?

In addition to getting all of the benefits provided by the [simple-schema](https://github.com/aldeed/meteor-simple-schema) package,
Collection2 sets up automatic property filtering, type conversion, and,
most importantly, validation, on both the client and the server, whenever you do
a normal `insert()` or `update()`. Once you've defined the schema, you no longer
have to worry about invalid data. Collection2 makes sure that nothing can get
into your database if it doesn't match the schema.

Collection2 (more specifically, SimpleSchema) probably can't support every insert or update object you throw at it,
but it can support the most common scenarios. Normal objects as well as $set and $unset
objects are supported. It understands basic dot notation in your $set and $unset keys.
See the SimpleSchema documentation for more details.

### SmartCollections

If you want to use a SmartCollection, provided by the
[smart-collections](https://github.com/arunoda/meteor-smart-collections) package,
you can. Create the SmartCollection object, and then pass it as the first argument
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

### AutoForms

Another great reason to use Collection2 is so that you can use the [autoform](https://github.com/aldeed/meteor-autoform) package.
AutoForm makes use of Collection2 to help you quickly develop forms that do complex inserts
and updates with automatic client and server validation. Refer to the [autoform](https://github.com/aldeed/meteor-autoform)
documentation for more information.

## What Happens When The Document Is Invalid?

The callback you specify as the last argument of your `insert()` or `update()` call
will have the first argument (`error`) set to a generic error. Generally speaking,
you would probably use the reactive methods provided by SimpleSchema to display
the specific error messages to the user somewhere. The autoform package provides
some handlebars helpers for this purpose.

## More Details

For the curious, this is exactly what Collection2 does before every insert or update:

1. Removes properties from your document or $set object if they are not explicitly listed in the schema.
2. Automatically converts some properties to match what the schema expects, if possible.
3. Validates your document or $set or $unset objects.
4. Performs the insert or update like normal, only if it was valid.

In reality, Collection2 is simply calling SimpleSchema methods to do these things. The following
is the gist of the entire package:

```js
//clean up doc
doc = schema.filter(doc);
doc = schema.autoTypeConvert(doc);
//validate doc
schema.validate(doc);

if (schema.valid()) {
    //perform insert or update
} else {
    //pass error to callback or throw it
}
```

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
