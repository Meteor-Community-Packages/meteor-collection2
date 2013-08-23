Collection2
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating.

## Change Log

### vNext

* Add `autoValue` support
* Add `denyInsert` and `denyUpdate` options

### 0.1.7

* Add `unique: true` support
* Allow an existing SimpleSchema to be passed in to the constructor

### 0.1.6

Fixed security/data integrity issue. Upgrade as soon as possible to ensure your app is secure.