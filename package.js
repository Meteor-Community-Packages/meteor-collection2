Package.describe({
    summary: "Wraps Meteor.Collection to provide support for automatic validation of insert and update operations on the client and server, plus simple virtual field support."
});

Package.on_use(function(api) {
    if (typeof api.imply !== "undefined") {
        api.imply('simple-schema', ['client', 'server']);
    } else {
        //backwards compatibility with pre-0.6.5 meteor
        api.use('simple-schema', ['client', 'server']);
    }
    api.use('underscore', ['client', 'server']);
    api.use('deps', 'client');
    api.add_files(['collection2.js'], ['client', 'server']);
});