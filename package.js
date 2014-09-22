Package.describe({
  name: "aldeed:collection2",
  summary: "Automatic validation of insert and update operations on the client and server.",
  version: "2.1.0",
  git: "https://github.com/aldeed/meteor-collection2.git"
});

Package.on_use(function(api) {

  if (api.versionsFrom) {
    api.use(['aldeed:simple-schema@1.0.3']);
    api.imply(['aldeed:simple-schema']);

    api.use('underscore@1.0.0');
    api.use('deps@1.0.0');
    api.use('check@1.0.0');
    api.use('mongo-livedata@1.0.0');
    api.use('ejson@1.0.0');

    // Allow us to detect 'insecure'.
    api.use('insecure@1.0.0', {weak: true});
  } else {
    api.use(['simple-schema']);
    api.imply(['simple-schema']);
    api.use(['underscore', 'deps', 'check', 'mongo-livedata', 'ejson']);

    // Allow us to detect 'insecure'.
    api.use('insecure', {weak: true});
  }
  
  api.add_files(['collection2.js']);
});

Package.on_test(function(api) {

  if (api.versionsFrom) {
    api.use('aldeed:collection2');
    api.use('tinytest@1.0.0');
    api.use('test-helpers@1.0.0');
    api.use('underscore@1.0.0');
    api.use('ejson@1.0.0');
    api.use('ordered-dict@1.0.0');
    api.use('random@1.0.0');
    api.use('deps@1.0.0');
  } else {
    api.use(['collection2', 'tinytest', 'test-helpers', 'underscore', 'ejson', 'ordered-dict', 'random', 'deps']);
  }

  api.add_files([
    'tests/schemas.js',
    'tests/collections.js',
    'tests/pubsub.js',
    'tests/security.js',
    'tests/tests.js'
  ]);
});