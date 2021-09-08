# Collection2 (aldeed:collection2 Meteor package)
[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
![GitHub](https://img.shields.io/github/license/Meteor-Community-Packages/meteor-collection2)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/Meteor-Community-Packages/meteor-collection2.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Meteor-Community-Packages/meteor-collection2/context:javascript)
![GitHub tag (latest SemVer)](https://img.shields.io/github/v/tag/Meteor-Community-Packages/meteor-collection2?label=latest&sort=semver)
[![](https://img.shields.io/badge/semver-2.0.0-success)](http://semver.org/spec/v2.0.0.html) 
![Test suite](https://github.com/Meteor-Community-Packages/meteor-collection2/workflows/Test%20suite/badge.svg)


A Meteor package that allows you to attach a schema to a Mongo.Collection. Automatically validates against that schema when inserting and updating from client or server code.

This package requires the [simpl-schema](https://github.com/aldeed/simple-schema-js) NPM package, which defines the schema syntax and provides the validation logic.

## TOC

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Installation](#installation)
- [Why Use Collection2](#why-use-collection2)
- [Attaching a Schema to a Collection](#attaching-a-schema-to-a-collection)
  - [Attaching Multiple Schemas to the Same Collection](#attaching-multiple-schemas-to-the-same-collection)
  - [attachSchema options](#attachschema-options)
    - [transform](#transform)
    - [replace](#replace)
  - [Attach a Schema to Meteor.users](#attach-a-schema-to-meteorusers)
- [Schema Format](#schema-format)
- [Schema Clean Options](#schema-clean-options)
- [Passing Options](#passing-options)
- [Validation Contexts](#validation-contexts)
- [Validating Without Inserting or Updating](#validating-without-inserting-or-updating)
- [Inserting or Updating Without Validating](#inserting-or-updating-without-validating)
- [Inserting or Updating Without Cleaning](#inserting-or-updating-without-cleaning)
  - [Skip removing properties that are not in the schema](#skip-removing-properties-that-are-not-in-the-schema)
  - [Skip conversion of values to match what schema expects](#skip-conversion-of-values-to-match-what-schema-expects)
  - [Skip removing empty strings](#skip-removing-empty-strings)
  - [Skip generating automatic values](#skip-generating-automatic-values)
  - [Pick or omit from the attached schema](#pick-or-omit-from-the-attached-schema)
- [Inserting or Updating Bypassing Collection2 Entirely](#inserting-or-updating-bypassing-collection2-entirely)
- [Additional SimpleSchema Options](#additional-simpleschema-options)
  - [index and unique](#index-and-unique)
  - [denyInsert and denyUpdate](#denyinsert-and-denyupdate)
  - [autoValue](#autovalue)
  - [custom](#custom)
- [What Happens When The Document Is Invalid?](#what-happens-when-the-document-is-invalid)
- [More Details](#more-details)
- [Community Add-On Packages](#community-add-on-packages)
  - [Automatic Migrations](#automatic-migrations)
- [Problems](#problems)
  - [SubObjects and Arrays of Objects](#subobjects-and-arrays-of-objects)
- [Disable displaying collection name in error message](#disable-displaying-collection-name-in-error-message)
- [Contributors](#contributors)
  - [Major Code Contributors](#major-code-contributors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

In your Meteor app directory, enter:

```bash
meteor add aldeed:collection2
meteor npm install --save simpl-schema
```

## Why Use Collection2

- While adding allow/deny rules ensures that only authorized users can edit a document from the client, adding a schema ensures that only acceptable properties and values can be set within that document from the client. Thus, client side inserts and updates can be allowed without compromising security or data integrity.
- Schema validation for all inserts and updates is reactive, allowing you to easily display customizable validation error messages to the user without any event handling.
- Schema validation for all inserts and updates is automatic on both the client and the server, providing both speed and security.
- The [aldeed:autoform](https://github.com/aldeed/meteor-autoform) package can take your collection's schema and automatically create HTML5 forms based on it. AutoForm provides automatic database operations, method calls, validation, and user interface reactivity. You have to write very little markup and no event handling. Refer to the [AutoForm](https://github.com/aldeed/meteor-autoform) documentation for more information.

## Attaching a Schema to a Collection

Let's say we have a normal "books" collection, defined in code that runs on both client and server (_common.js_):

```js
const Books = new Mongo.Collection('books');
```

Let's create a `SimpleSchema` schema for this collection. We'll do this in _common.js_, too:

```js
const Schemas = {};

Schemas.Book = new SimpleSchema({
  title: {
    type: String,
    label: 'Title',
    max: 200,
  },
  author: {
    type: String,
    label: 'Author',
  },
  copies: {
    type: SimpleSchema.Integer,
    label: 'Number of copies',
    min: 0,
  },
  lastCheckedOut: {
    type: Date,
    label: 'Last date this book was checked out',
    optional: true,
  },
  summary: {
    type: String,
    label: 'Brief summary',
    optional: true,
    max: 1000,
  },
});
```

Once we have the `SimpleSchema` instance, all we need to do is attach it to our collection using the `attachSchema` method. Again, we will do this in _common.js_:

```js
Books.attachSchema(Schemas.Book);
```

Now that our collection has a schema, we can do a validated insert on either the client or the server:

```js
Books.insert({ title: 'Ulysses', author: 'James Joyce' }, (error, result) => {
  //The insert will fail, error will be set,
  //and result will be undefined or false because "copies" is required.
  //
  //The list of errors is available on `error.invalidKeys` or by calling Books.simpleSchema().namedContext().validationErrors()
});
```

Or we can do a validated update:

```js
Books.update(book._id, { $unset: { copies: 1 } }, (error, result) => {
  //The update will fail, error will be set,
  //and result will be undefined or false because "copies" is required.
  //
  //The list of errors is available on `error.invalidKeys` or by calling Books.simpleSchema().namedContext().validationErrors()
});
```

### Attaching Multiple Schemas to the Same Collection

Normally, if call `attachSchema` multiple times, the schemas are merged. If you use the `replace: true` option, then it will replace the previously attached schema. However, in some cases you might actually want both schemas attached, with different documents validated against different schemas.

Here is an example:

```js
Products.attachSchema(BaseProductSchema);
Products.attachSchema(ExtendedProductSchema, {
  selector: { type: 'extended' },
});
```

This adds support for having a base (default) schema while also using multiple selector schemas.

There are four behaviors for attaching schemas:

- **Attach schema without selector.** This will extend the base schema and any attached selector schemas.
- **Attach schema with selector.** If the given selector schema exists, extends the found schema with any new fields. Or add an additional schema that matches the selector only. The new selector schema will first be extended by the base schema, if the base schema is already specified.
- **Replace schema without selector.** This replaces the base schema and removes any attached selector schemas. If you want to continue to use the original selector schemas on the collection they must be reattached.
- **Replace schema with selector.** This replaces the schema with the same selector with the new schema fields extended by the base schema, if the base schema is already specified. Othewise adds the new selector schema if it was not found.

It is possible to use schemas on collections with or without the base schema specified, and with or without selector schemas specified. The selector schemas will always inherit the base schema. Replacing the base schema effectively serves as deleting all schemas off the collection.

Here is another example:

```js
Products.attachSchema(SimpleProductSchema, { selector: { type: 'simple' } });
Products.attachSchema(VariantProductSchema, { selector: { type: 'variant' } });
```

Now both schemas are attached. When you insert a document where `type: 'simple'` in the document, it will validate against only the `SimpleProductSchema`. When you insert a document where `type: 'variant'` in the document, it will validate against only the `VariantProductSchema`.

Alternatively, you can pass a `selector` option when inserting to choose which schema to use:

```js
Products.insert(
  { title: 'This is a product' },
  { selector: { type: 'simple' } }
);
```

For an update or upsert, the matching selector can be in the query, the modifier `$set` object, or the `selector` option.

### attachSchema options

#### transform

If your validation requires that your doc be transformed using the collection's transform function prior to being validated, then you must pass the `transform: true` option to `attachSchema` when you attach the schema:

```js
Books.attachSchema(Schemas.Book, { transform: true });
```

#### replace

By default, if a collection already has a schema attached, `attachSchema` will combine the new schema with the existing. Pass the `replace: true` option to `attachSchema` to discard any existing schema.

### Attach a Schema to Meteor.users

Obviously, when you attach a schema, you must know what the schema should be. For `Meteor.users`,
here is an example schema, which you might have to adjust for your own needs:

```js
const Schema = {};

Schema.UserCountry = new SimpleSchema({
  name: {
    type: String,
  },
  code: {
    type: String,
    regEx: /^[A-Z]{2}$/,
  },
});

Schema.UserProfile = new SimpleSchema({
  firstName: {
    type: String,
    optional: true,
  },
  lastName: {
    type: String,
    optional: true,
  },
  birthday: {
    type: Date,
    optional: true,
  },
  gender: {
    type: String,
    allowedValues: ['Male', 'Female'],
    optional: true,
  },
  organization: {
    type: String,
    optional: true,
  },
  website: {
    type: String,
    regEx: SimpleSchema.RegEx.Url,
    optional: true,
  },
  bio: {
    type: String,
    optional: true,
  },
  country: {
    type: Schema.UserCountry,
    optional: true,
  },
});

Schema.User = new SimpleSchema({
  username: {
    type: String,
    // For accounts-password, either emails or username is required, but not both. It is OK to make this
    // optional here because the accounts-password package does its own validation.
    // Third-party login packages may not require either. Adjust this schema as necessary for your usage.
    optional: true,
  },
  emails: {
    type: Array,
    // For accounts-password, either emails or username is required, but not both. It is OK to make this
    // optional here because the accounts-password package does its own validation.
    // Third-party login packages may not require either. Adjust this schema as necessary for your usage.
    optional: true,
  },
  'emails.$': {
    type: Object,
  },
  'emails.$.address': {
    type: String,
    regEx: SimpleSchema.RegEx.Email,
  },
  'emails.$.verified': {
    type: Boolean,
  },
  // Use this registered_emails field if you are using splendido:meteor-accounts-emails-field / splendido:meteor-accounts-meld
  registered_emails: {
    type: Array,
    optional: true,
  },
  'registered_emails.$': {
    type: Object,
    blackbox: true,
  },
  createdAt: {
    type: Date,
  },
  profile: {
    type: Schema.UserProfile,
    optional: true,
  },
  // Make sure this services field is in your schema if you're using any of the accounts packages
  services: {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // DISCLAIMER: This only applies to the first and second version of meteor-roles package.
  // https://github.com/Meteor-Community-Packages/meteor-collection2/issues/399
  // Add `roles` to your schema if you use the meteor-roles package.
  // Option 1: Object type
  // If you specify that type as Object, you must also specify the
  // `Roles.GLOBAL_GROUP` group whenever you add a user to a role.
  // Example:
  // Roles.addUsersToRoles(userId, ["admin"], Roles.GLOBAL_GROUP);
  // You can't mix and match adding with and without a group since
  // you will fail validation in some cases.
  roles: {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // Option 2: [String] type
  // If you are sure you will never need to use role groups, then
  // you can specify [String] as the type
  roles: {
    type: Array,
    optional: true,
  },
  'roles.$': {
    type: String,
  },
  // In order to avoid an 'Exception in setInterval callback' from Meteor
  heartbeat: {
    type: Date,
    optional: true,
  },
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
[simpl-schema](https://github.com/aldeed/simple-schema-js) package
documentation for a list of all the available schema rules and validation
methods.

Use the `MyCollection.simpleSchema()` method to access the attached `SimpleSchema`
instance for a Mongo.Collection instance. For example:

```js
MyCollection.simpleSchema().validate(doc);
```

## Schema Clean Options

You can set the simpl-schema clean options globally in collection2. They are merged with any options defined on the schema level.

```js
import Collection2 from 'meteor/aldeed:collection2'

// The values shown are the default options used internally. Overwrite them if needed.
Collection2.cleanOptions = {
    filter: true,
    autoConvert: true,
    removeEmptyStrings: true,
    trimStrings: true,
    removeNullsFromArrays: true,
}

// Or you can update individual options.
Collection2.cleanOptions.filter = false;
```

## Passing Options

In Meteor, the `update` function accepts an options argument. Collection2 changes the `insert` function signature to also accept options in the same way, as an optional second argument. Whenever this documentation says to "use X option", it's referring to this options argument. For example:

```js
myCollection.insert(doc, { validate: false });
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
Books.insert(
  { title: 'Ulysses', author: 'James Joyce' },
  { validationContext: 'insertForm' },
  (error, result) => {
    //The list of errors is available by calling Books.simpleSchema().namedContext("insertForm").validationErrors()
  }
);

Books.update(
  book._id,
  { $unset: { copies: 1 } },
  { validationContext: 'updateForm' },
  (error, result) => {
    //The list of errors is available by calling Books.simpleSchema().namedContext("updateForm").validationErrors()
  }
);
```

## Validating Without Inserting or Updating

It's also possible to validate a document without performing the actual insert or update:

```js
Books.simpleSchema()
  .namedContext()
  .validate({ title: 'Ulysses', author: 'James Joyce' }, { modifier: false });
```

Set the modifier option to true if the document is a mongo modifier object.

You can also validate just one key in the document:

```js
Books.simpleSchema()
  .namedContext()
  .validate(
    { title: 'Ulysses', author: 'James Joyce' },
    { modifier: false, keys: ['title'] }
  );
```

Or you can specify a certain validation context when calling either method:

```js
Books.simpleSchema()
  .namedContext('insertForm')
  .validate({ title: 'Ulysses', author: 'James Joyce' }, { modifier: false });
Books.simpleSchema()
  .namedContext('insertForm')
  .validate(
    { title: 'Ulysses', author: 'James Joyce' },
    { modifier: false, keys: ['title'] }
  );
```

Refer to the [simpl-schema](https://github.com/aldeed/simple-schema-js) package documentation for more information about these methods.

## Inserting or Updating Without Validating

To skip validation, use the `validate: false` option when calling `insert` or
`update`. On the client (untrusted code), this will skip only client-side
validation. On the server (trusted code), it will skip all validation. The object is still cleaned and autoValues are still generated.

## Inserting or Updating Without Cleaning

### Skip removing properties that are not in the schema

To skip object property filtering, set the `filter` option to `false` when you call `insert` or `update`.

### Skip conversion of values to match what schema expects

To skip automatic value conversion, set the `autoConvert` option to `false` when you call `insert` or `update`.

### Skip removing empty strings

To skip removing empty strings, set the `removeEmptyStrings` option to `false` when you call `insert` or `update`.

### Skip generating automatic values

To skip adding automatic values, set the `getAutoValues` option to `false` when you call `insert` or `update`. This works only in server code.

### Pick or omit from the attached schema

To pick or omit fields from the schema for the operation, set the 'pick' or 'omit' option respectively to an array of schema field names. These options are mutually exclusive, so you cannot have both present in the options object at the same time.

This is the implementation of [pick and omit functionality from simple-schema](https://github.com/aldeed/simpl-schema#extracting-schemas), but on your DB calls like this:

```js
// Will insert everything except 'noop'
collection.insert(
  { foo: 'foo', noop: 'nooooo', bar: 'whiskey' },
  { omit: ['noop'] }
);
```

```js
// Pick only 'foo'
collection.update(
  { _id: 'myid' },
  { $set: { foo: 'test', bar: 'changed' } },
  { pick: ['foo'] }
);
```

## Inserting or Updating Bypassing Collection2 Entirely

Even if you skip all validation and cleaning, Collection2 will still do some object parsing that can take a long time for a large document. To bypass this, set the `bypassCollection2` option to `true` when you call `insert` or `update`. This works only in server code.

## Additional SimpleSchema Options

In addition to all the other schema validation options documented in the
[simpl-schema](https://github.com/longshotlabs/simpl-schema) package, the
collection2 package adds additional options explained in this section.

### index and unique

See https://github.com/aldeed/meteor-schema-index

### denyInsert and denyUpdate

See https://github.com/aldeed/meteor-schema-deny

### autoValue

The `autoValue` option is provided by the SimpleSchema package and is documented
there. Collection2 adds the following properties to `this` for any `autoValue`
function that is called as part of a C2 database operation:

- isInsert: True if it's an insert operation
- isUpdate: True if it's an update operation
- isUpsert: True if it's an upsert operation (either `upsert()` or `upsert: true`)
- userId: The ID of the currently logged in user. (Always `null` for server-initiated actions.)
- isFromTrustedCode: True if the insert, update, or upsert was initiated from trusted (server) code
- docId: The `_id` property of the document being inserted or updated. For an insert, this will be set only when it is provided in the insert doc, or when the operation is initiated on the client. For an update or upsert, this will be set only when the selector is or includes the `_id`, or when the operation is initiated on the client.

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
      } else if (this.isUpsert) {
        return {$setOnInsert: new Date()};
      } else {
        this.unset();  // Prevent user from supplying their own value
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
  // Whenever the "content" field is updated, automatically store
  // the first word of the content into the "firstWord" field.
  firstWord: {
    type: String,
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        return content.value.split(' ')[0];
      } else {
        this.unset();
      }
    }
  },
  // Whenever the "content" field is updated, automatically
  // update a history array.
  updatesHistory: {
    type: Array,
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        if (this.isInsert) {
          return [{
              date: new Date(),
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
  'updatesHistory.$': {
    type: Object,
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

### custom

The `custom` option is provided by the SimpleSchema package and is documented
there. Collection2 adds the following properties to `this` for any `custom`
function that is called as part of a C2 database operation:

- isInsert: True if it's an insert operation
- isUpdate: True if it's an update operation
- isUpsert: True if it's an upsert operation (either `upsert()` or `upsert: true`)
- userId: The ID of the currently logged in user. (Always `null` for server-initiated actions.)
- isFromTrustedCode: True if the insert, update, or upsert was initiated from trusted (server) code
- docId: The `_id` property of the document being inserted or updated. For an insert, this will be set only when it is provided in the insert doc, or when the operation is initiated on the client. For an update or upsert, this will be set only when the selector is or includes the `_id`, or when the operation is initiated on the client.

## What Happens When The Document Is Invalid?

The callback you specify as the last argument of your `insert()` or `update()` call will have the first argument (`error`) set to an `Error` instance. The error message for the first invalid key is set in the `error.message`, and the full `validationErrors` array is available on `error.invalidKeys`. This is true on both client and server, even if validation for a client-initiated operation does not fail until checked on the server.

If you attempt a synchronous operation in server code, the same validation error is thrown since there is no callback to pass it to. If this happens in a server method (defined with `Meteor.methods`), a more generic `Meteor.Error` is passed to your callback back on the client. This error does not have an `invalidKeys` property, but it does have the error message for the first invalid key set in `error.reason`.

Generally speaking, you would probably not use the `Error` for displaying to the user. You can instead use the reactive methods provided by the SimpleSchema validation context to display the specific error messages to the user somewhere in the UI. The [autoform](https://github.com/aldeed/meteor-autoform) package provides some UI components and helpers for this purpose.

## More Details

For the curious, this is exactly what Collection2 does before every insert or update:

1. Removes properties from your document or mongo modifier object if they are not explicitly listed in the schema. (To skip this, set the `filter` option to `false` when you call `insert` or `update`.)
1. Automatically converts some properties to match what the schema expects, if possible. (To skip this, set the `autoConvert` option to `false` when you call `insert` or `update`.)
1. Optimizes your operation so that empty string values will not be stored. (To skip this, set the `removeEmptyStrings` option to `false` when you call `insert` or `update`.)
1. Adds automatic (forced or default) values based on your schema. Values are added only on the server and will make their way back to your client when your subscription is updated. (To skip this in server code, set the `getAutoValues` option to `false` when you call `insert` or `update`.)
1. Validates your document or mongo modifier object. (To skip this, set the `validate` option to `false` when you call `insert` or `update`.)
1. Performs the insert or update like normal, only if it was valid.

Collection2 is simply calling SimpleSchema methods to do these things. The validation happens on both the client and the server for client-initiated actions, giving you the speed of client-side validation along with the security of server-side validation.

## Community Add-On Packages

### Automatic Migrations

The [davidyaha:collection2-migrations](https://atmospherejs.com/davidyaha/collection2-migrations) package can watch for schema changes between server restarts and perform some automatic data migration and cleanup.

## Problems

You might find yourself in a situation where it seems as though validation is not working correctly. First, you should enable SimpleSchema debug mode by setting `SimpleSchema.debug = true`, which may log some additional information. If you're still confused, read through the following tricky, confusing situations.

### SubObjects and Arrays of Objects

One critical thing to know about Collection2 and SimpleSchema is that they don't validate the _saved document_ but rather the _proposed insert doc_ or the _update modifier_. In the case of updates, this means there is some information unknown to SimpleSchema, such as whether the array object you're attempting to modify already exists or not. If it doesn't exist, MongoDB would create it, so SimpleSchema will validate conservatively. It will assume that any properties not set by the modifier will not exist after the update. This means that the modifier will be deemed invalid if any required keys in the same object are not explicitly set in the update modifier.

For example, say we add the following keys to our "books" schema:

```js
{
    borrowedBy: {
        type: Array
    },
    'borrowedBy.$': {
        type: Object
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
Books.update(id, { $set: { 'borrowedBy.1.name': 'Frank' } });
```

However, this will not pass validation. Why? Because we don't know whether item 1 in the `borrowedBy` array already exists, so we don't know whether it will have the required `email` property after the update finishes.

There are three ways to make this work:

- `$set` the entire object
- `$set` all required keys in the object
- Perform the update on the server, and pass the `validate: false` option to skip validation.

When this situation occurs on the client with an `autoForm`, it generally does not cause any problems because AutoForm is smart enough to `$set` the entire object; it's aware of this potential issue. However, this means that you need to ensure that all required properties are represented by an `input` on the form. In our example, if you want an `autoForm` that only shows a field for changing the borrowedBy `name` and not the `email`, you should include both fields but make the `email` field hidden. Alternatively, you can submit the `autoForm` to a server method and then do a server update without validation.

Although these examples focused on an array of objects, sub-objects are treated basically the same way.

## Disable displaying collection name in error message
Since version `3.4` an option has been added that disables displaying of collection names in error messages. This is set to `false` until version `4.0`. You can change this by setting the value in your Meteor settings like this:
```json
{
  "packages": {
    "collection2": {
      "disableCollectionNamesInValidation": true
    }
  }
}
```

## Contributors

This project exists thanks to all the people who contribute. [[Contribute]](CONTRIBUTING.md).
<a href="graphs/contributors"><img src="https://opencollective.com/meteor-collection2/contributors.svg?width=890" /></a>

### Major Code Contributors

@aldeed
@mquandalle
@newsiberian
@harryadel
@StorytellerCZ
@SimonSimCity

(Add yourself if you should be listed here.)

