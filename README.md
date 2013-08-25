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

## Unique

In addition to all the other schema options documented in the 
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
will have the first argument (`error`) set to a generic error. But generally speaking,
you would probably use the reactive methods provided by SimpleSchema to display
the specific error messages to the user somewhere. The [autoform](https://github.com/aldeed/meteor-autoform) package provides
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

## denyInsert and denyUpdate rules

Collection2 add `denyInsert` and `denyUpdate` to the SimpleSchema options. Those options are set to `false` by default.
If you set `denyUpdate` to true, a collection update that modify this field will failed. For instance:
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
If you use the `autoform` package, the `createdAt` field won't be present on the update form.

Similarly there is a `denyInsert` option that require the field to be define only on update. If you set `denyInsert` to true, you will need to set `optional: true` as well. 

## autoValue

```js
{
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
        }
        denyInsert: true,
        optional: true
    },

    firstWord: {
        type: String,
        autoValue: function(doc) {
            // You need to check first that there is a content attribute
            // in the document because one can update other fields without
            // setting the content field (for instance a 
            // {$set: {title: 'newTitle'}} operation)
            if ('content' in doc)
                return doc.content.split(' ')[0];
        }
    },

    updatesHistory: {
        type: [{date: Date, content: String}],
        autoValue: function(doc) {
            if ('content' in doc)
                return {
                    $push: {
                        date: new Date,
                        content: doc.content
                    }
                }
        },
        denyInsert: true
    },

    htmlContent: {
        type: String,
        autoValue: function(doc) {
            if (Meteor.isServer && 'MarkdownContent' in doc) {
                return MarkdownToHTML(doc.MarkdownContent);
            }
        }
    }
}
```