/* global Package, Npm */
Package.describe({
  name: 'aldeed:collection2',
  summary:
    'Automatic validation of Meteor Mongo insert and update operations on the client and server',
  version: '4.1.1-beta.1',
  documentation: '../../README.md',
  git: 'https://github.com/aldeed/meteor-collection2.git'
});

Package.onUse(function (api) {
  api.versionsFrom(['1.12.1', '2.3', '3.0', '3.1.2']);
  api.use('mongo');
  api.imply('mongo');
  api.use('minimongo');
  api.use('ejson');
  api.use('ecmascript');
  api.use('raix:eventemitter@1.0.0 || 2.0.0');
  api.use('aldeed:simple-schema@1.13.1 || 2.0.0');
  api.use('zodern:types@1.0.13');

  api.addFiles(['./collection2.js']);

  // Allow us to detect 'insecure'.
  api.use('insecure', { weak: true });

  api.export('Collection2');
});

Package.onTest(function (api) {
  api.versionsFrom(['1.12.1', '2.3', '3.0', '3.1.2']);
  api.use([
    'meteortesting:mocha@2.1.0 || 3.2.0',
    'aldeed:collection2'
  ]);
});
