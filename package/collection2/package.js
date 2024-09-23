/* global Package, Npm */

Package.describe({
  name: 'aldeed:collection2',
  summary:
    'Automatic validation of Meteor Mongo insert and update operations on the client and server',
  version: '4.0.3',
  documentation: '../../README.md',
  git: 'https://github.com/aldeed/meteor-collection2.git'
});

Npm.depends({
  'lodash.isempty': '4.4.0',
  'lodash.isequal': '4.5.0',
  'lodash.isobject': '3.0.2'
});

Package.onUse(function (api) {
  api.versionsFrom(['1.12.1', '2.3', '3.0']);
  api.use('mongo');
  api.imply('mongo');
  api.use('minimongo');
  api.use('ejson');
  api.use('ecmascript');
  api.use('raix:eventemitter@2.0.0');
  api.use('aldeed:simple-schema@1.13.1 || 2.0.0');

  api.addFiles(['./collection2.js']);

  // Allow us to detect 'insecure'.
  api.use('insecure', { weak: true });

  api.export('Collection2');
});

Package.onTest(function (api) {
  api.versionsFrom(['1.12.1', '2.3', '3.0']);
  api.use([
    'meteortesting:mocha@2.1.0 || 3.2.0',
    'aldeed:collection2'
  ]);
});
