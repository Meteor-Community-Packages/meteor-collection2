if (Meteor.isServer) {

  var allTrue = {
    insert: function() {
      return true;
    },
    update: function() {
      return true;
    },
    remove: function() {
      return true;
    }
  };

  defaultValues.allow(allTrue);
  books.allow(allTrue);
  autoValues.allow(allTrue);
  noSchemaCollection.allow(allTrue);
  BlackBox.allow(allTrue);
  contextCheck.allow(allTrue);
  RES.allow(allTrue);
  products.allow(allTrue);

  var shouldDeny = false;
  books.deny({
    insert: function() {
      return shouldDeny;
    },
    update: function() {
      return shouldDeny;
    },
    remove: function() {
      return shouldDeny;
    }
  });

  // Rig test helper method for setting denyAll
  Meteor.methods({
    denyAll: function() {
      shouldDeny = true;
    },
    allowAll: function() {
      shouldDeny = false;
    },
    removeAll: function () {
      books.remove({});
      autoValues.remove({});
      defaultValues.remove({});
      noSchemaCollection.remove({});
      BlackBox.remove({});
      contextCheck.remove({});
      products.remove({});
    }
  });
}