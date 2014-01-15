// TODO: Need to modify the cursor object to call the `runMigrations` function
// when needed. Maybe we can use `transform` function for that purpose?
var hiddenField = '__versions';
var _super = Meteor.Collection.prototype.find;

SimpleSchema.extendOptions({
  version: Match.Optional(Match.Integer),
  upgrade: Match.Optional(Function)
});

Meteor.Collection.prototype.find = function(selector, options) {
  var self = this;

  // If the user use a field specifier in "white-list" mode, we manually add the
  // hidden field. See http://docs.meteor.com/#fieldspecifiers for the format.
  if (options && _.has(options, 'fields') && Object.keys(options.fields)[0] === 1)
    options.fields[hiddenField] = 1;

  var cursor = _super.apply(self, _.toArray(arguments));
  return cursor;
}

var runMigrations = function(doc) {
  // The idea here is that it's possible that we don't have all fields of
  // the document (because the find request is restricted to certains fields).
  // In this case we may need to do one more `find` request to retreive the
  // entiere document, but for permormances reasons we don't want do this
  // if we already have all informations we need. So let the migration func
  // define the fields it needs with:
  // 
  //     this.fields('fieldA', 'fieldB');

  var self = this;
  var newValues = {};
  var neededFields = [];
  var requestAgain = false;
  do {
    if (requestAgain){
      doc = self.find(doc._id, {fields: neededField});
    }
    _.each(self._c2.versions, function(field, fieldVersion) {
      var docVersion = doc[hiddenField] && doc[hiddenField][field] || 0;
      if (docVersion < fieldVersion) {
        newValue = self._c2._simpleSchema[field].call({
          fields: function(/* arguments */){
            neededFields.push(arguments);
            _.each(arguments, function(field) {
              if (!_.has(doc, field))
                requestAgain = true;
            });
          },
          docVersion: docVersion
        }, doc, docVersion);
        if (newValue) {
          newValues[field] = newValue;
        }
      }
    });
  } while (requestAgain);

  if (! _.isEmpty(modifier)) {
    self.update(doc._id, {$set: modifier});
  }
}
