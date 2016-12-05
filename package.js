/* global Package */

Package.describe({
  name: "aldeed:collection2",
  summary: "Automatic validation of insert and update operations on the client and server.",
  version: "2.10.0",
  git: "https://github.com/aldeed/meteor-collection2.git"
});

Package.onUse(function(api) {
  // Automatically include all packages for now
  api.use([
    'aldeed:collection2-core@1.2.0',
    'aldeed:schema-index@1.1.0',
    'aldeed:schema-deny@1.1.0',
  ]);

  api.imply([
    'aldeed:collection2-core',
    'aldeed:schema-index',
    'aldeed:schema-deny',
  ]);
});
