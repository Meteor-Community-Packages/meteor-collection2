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
            rows: 8,
            max: 1000
        }
    }
});
```

## Schema Format

The schema object format is actually dictated by the `simple-schema` package, which is installed when you install `collection2`.

## Easy Forms

The autoform package makes use of collection2 to help you quickly develop forms that do simple inserts and updates.