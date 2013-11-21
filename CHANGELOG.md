Collection2
=========================

A smart package for Meteor that extends Meteor.Collection to provide support for specifying a schema and then validating against that schema when inserting and updating.

## Change Log

### 0.2.12

* Don't throw notUnique error for null or undefined optional fields

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