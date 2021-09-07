/* global Package */

Package.describe({
  name: "aldeed:collection2",
  summary: "Automatic validation of Meteor Mongo insert and update operations on the client and server",
  version: "3.5.0",
  documentation: "../../README.md",
  git: "https://github.com/aldeed/meteor-collection2.git"
});

Npm.depends({
  'lodash.isempty': '4.4.0',
  'lodash.isequal': '4.5.0',
  'lodash.isobject': '3.0.2',
});

Package.onUse(function(api) {
  api.versionsFrom(['1.12.1', '2.3']);
  api.use('mongo');
  api.imply('mongo');
  api.use('minimongo');
  api.use('ejson');
  api.use('raix:eventemitter@1.0.0');
  api.use('ecmascript');
  api.use('tmeasday:check-npm-versions@1.0.2');

  // Allow us to detect 'insecure'.
  api.use('insecure@1.0.7', {weak: true});

  api.mainModule('collection2.js');

  api.export('Collection2');
});
