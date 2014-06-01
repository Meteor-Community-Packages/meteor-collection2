Package.describe({
  name: "collection2",
  summary: "Allows you to attach a SimpleSchema to a Meteor.Collection, supporting automatic validation of insert and update operations on the client and server."
});

Package.on_use(function(api) {
  api.use(['simple-schema', 'underscore', 'deps', 'check', 'mongo-livedata', 'ejson']);

  api.imply && api.imply('simple-schema', ['client', 'server']);

  // Allow us to detect 'insecure'.
  api.use('insecure', {weak: true});

  api.add_files(['collection2.js']);
});

Package.on_test(function(api) {
  api.use(['collection2', 'tinytest', 'underscore', 'ejson', 'ordered-dict',
    'random', 'deps']);
  api.use(['test-helpers'], 'server');

  api.add_files('collection2.tests.js');
});