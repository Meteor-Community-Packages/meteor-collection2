Collection2
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating. Also adds support for virtual fields.

## Basic Usage

When defining your models, use `new Meteor.Collection2()` instead of `new Meteor.Collection()`. It works the same, but you can specify `schema` and `virtualFields` properties in the options.

## Example
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
        summary: {
            type: String,
            label: "Brief summary",
            optional: true,
            max: 1000
        }
    }
});
```

## Schema Format

The schema object format is actually dictated by the `simple-schema` package,
which is installed when you install `collection2`. See that documentation. If
you need to get the actual SimpleSchema for any reason, such as to access any
of the methods on it or pass it to `check()`, you can do so by calling
`MyCollection2.simpleSchema()`.

For example:

```js
check(doc, MyCollection2.simpleSchema());
```

## Why Use It?

In addition to getting all of the benefits provided by the `simple-schema` package,
you Collection2 sets up automatic property filtering, type conversion, and,
most importantly, validation, on both the client and the server, whenever you do
a normal `insert()` or `update()`. Once you've defined the schema, you no longer
have to worry about invalid data. Collection2 makes sure that nothing can get
into your database if it doesn't match the schema.

Collection2 (more specifically, SimpleSchema) probably can't support every insert or update object you throw at it,
but it can support the most common scenarios. Normal objects as well as $set and $unset
objects are supported. It understands basic dot notation in your $set and $unset keys.
See the SimpleSchema documentation for more details.

### AutoForms

Another great reason to use Collection2 is so that you can use the autoform package.
AutoForm makes use of Collection2 to help you quickly develop forms that do complex inserts
and updates with automatic client and server validation. Refer to the AutoForm
documentation for more information.

## What Happens When The Document Is Invalid?

The callback you specify as the last argument of your `insert()` or `update()` call
will have the first argument (`error`) set to a generic error. Generally speaking,
you would probably use the reactive methods provided by SimpleSchema to display
the specific error messages to the user somewhere. The autoform package provides
some handlebars helpers for this purpose.

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