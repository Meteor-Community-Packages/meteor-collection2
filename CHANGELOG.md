Collection2
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating.

## Change Log

### 0.4.2

* Fix index error
* Add `removeEmptyStrings` option to insert/update methods. Pass `false` to disable the default behavior of removing empty string values for that insert or update operation.

### 0.4.1

Indexing fixes

### 0.4.0

* Validation errors that are caught on the server are now reactively added back on the client.
* Custom `unique` checking is removed; we now rely entirely on the unique MongoDB index to cause errors, which we use to add `notUnique` validation errors. Because of the previous point about server validation errors being sent back to the client, this should be a transparent change.
* The deprecated `Meteor.Collection2` constructor and `virtualFields` option no longer work.

### 0.3.11

A couple small changes to make sure return values and callback arguments match exactly what the original
insert/update/upsert methods would do.

### 0.3.10

* Add `attachSchema` method for attaching a schema to collections created by another package, such as Meteor.users.
* Ensure "notUnique" errors are added to invalidKeys, even when thrown on the server by MongoDB.

### 0.3.9

* Fixed some issues with `this` object in autoValue functions. `userId` and `isUpdate` were sometimes not set correctly.
* Added `isFromTrustedCode` to `this` object in autoValue and custom validation functions.

### 0.3.8

`autoValue` support moved to SimpleSchema. Collection2 continues to extend
with additional options so the net effect should be no noticeable changes.

### 0.3.7

Another tweak to ensure no allow/deny security confusion

### 0.3.6

Ensure that we don't turn off the `insecure` package

### 0.3.5

* Fix an issue where cleaning and autoValues were not done correctly when used
with a transform or virtual fields.
* `this.userId` is now available in your autoValue functions

### 0.3.4

* Define default error messages for Collection2-specific error types.
* Include the first validation error message with the generic "failed
validation" error message.
* Fixes for blackbox and custom object support

### 0.3.3

Fix update argument mix ups, for real.

### 0.3.2

* Restore ability to do unvalidated inserts and updates on the server. This
can be done with the new `validate: false` option, or by calling
myCollection._collection.insert (or update) as before. On the client, the
`validate: false` option will skip client-side validation but not server-side
validation.
* Arguments are no longer sometimes adjusted improperly when doing an update
or upsert.

### 0.3.1

Fix virtualFields support, broken by 0.3.0

### 0.3.0

* Collection2 is now enhancing the core collection object `Meteor.Collection`
instead of creating a new `Meteor.Collection2` constructor. `Meteor.Collection2`
is still available for now but is deprecated.
* There is a new `index` option for the field definition, in order to ensure an
index in the real MongoDB database. Refer to the README.
* `SmartCollection` is no longer directly supported as that package is
deprecating.
* `Offline.Collection` no longer supports schemas. This may be a temporary
change. Since it is more difficult to implement this now, we have to decide
whether this is worth doing. It might be better to re-implement from the
`offline-data` package side.

### 0.2.17

* `this.value` and `this.field().value` now return the correct value when the
value is an array. (Previously they returned just the first item of the array.)

### 0.2.16

* Add `this.isUpsert` boolean for use within an autoValue function
* Add `this.unset()` method for use within an autoValue function. Allows you
to unset any provided values when you're returning `undefined`.
* Fix autoValues for upserts. Previously, any autoValues were being added to the
selector in addition to the modifier. This is now fixed.

### 0.2.15

* Add support for `denyInsert` and `denyUpdate` options
* Add support for `autoValue` option

### 0.2.14

Deprecate some methods that are now handled by the simple-schema package, and
update docs to make the code simpler in preparation for possible future enhancements.

### 0.2.13

Allow an `Offline.Collection` to be passed to the constructor.

### 0.2.12

Don't throw notUnique error for null or undefined optional fields

### 0.2.11

* Add `check` dependency
* Add `upsert` support
* Use `transform: null` for the deny/allow callbacks

### 0.2.10

Fix `unique: true` checking for validate() and validateOne()

### 0.2.9

Fix `unique: true` checking for updates

### 0.2.8

Backwards compatibility fix

### 0.2.7

No changes

### 0.2.6

Backwards compatibility fix

### 0.2.5

Don't require allow functions when insecure package is in use

### 0.2.4

Fix IE<10 errors

### 0.2.3

Remove smart-collections weak dependency until weak dependencies work properly

### 0.2.2

Minor improvements to SmartCollection integration

### 0.2.1

Remove extra auto-added keys from doc in the insert deny function. Ensures that valid objects are recognized as valid on the server.

### 0.2.0

*(Backwards-compatibility break!)*

* Updated to use multiple validation contexts; changed API a bit
* You can now pass `smart: true` option to use a SmartCollection without pre-creating it

### 0.1.7

* Add `unique: true` support
* Allow an existing SimpleSchema to be passed in to the constructor

### 0.1.6

Fixed security/data integrity issue. Upgrade as soon as possible to ensure your app is secure.