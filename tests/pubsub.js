function pub(cols) {
  _.each(cols, function (col) {
    Meteor.publish(null, function () {
      return col.find();
    });
  });
}

if (Meteor.isServer) {
  Meteor.publish("books", function() {
    return books.find();
  });

  pub([autoValues, defaultValues, noSchemaCollection, BlackBox, contextCheck,
    RES, products]);
} else {
  booksSubscription = Meteor.subscribe("books");
}