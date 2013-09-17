Package.describe({
    summary: 'Wraps Meteor.Collection to provide support for automatic validation of insert and update operations on the client and server, plus simple virtual field support.'
});

Package.on_use(function(api) {
    api.use('simple-schema', ['client', 'server']);
    if (typeof api.imply !== "undefined") {
        api.imply('simple-schema', ['client', 'server']);
    }
    api.use('underscore', ['client', 'server']);
    api.use('deps', ['client', 'server']);
    api.add_files(['collection2.js'], ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('collection2');
  api.use(['test-helpers', 'tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'deps']);

  api.add_files('tests/globals.js', ['client', 'server']);
  api.add_files('tests/server.js', 'server');
  api.add_files('tests/client.js', 'client');
  api.add_files('tests/both.js', ['client', 'server']);
});