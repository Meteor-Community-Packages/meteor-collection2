/* books */

books = new Mongo.Collection("books");
books.attachSchema(booksSchema);

// Add one unique index outside of C2
if (Meteor.isServer) {
  try {
    books._dropIndex({field1: 1, field2: 1});
  } catch (err) {

  }
  books._ensureIndex({field1: 1, field2: 1}, {unique: true, sparse: true});
}

/* autoValues */

autoValues = new Mongo.Collection("autoValues");
autoValues.attachSchema(avSchema);

/* noSchemaCollection */

noSchemaCollection = new Mongo.Collection('noSchema', {
  transform: function(doc) {
    doc.userFoo = "userBar";
    return doc;
  }
});

/* BlackBox */

Document = function(data) {
  _.extend(this, data);
};

Document.prototype = {
  constructor: Document,
  toString: function() {
    return this.toJSONValue.toString();
  },
  clone: function() {
    return new Document(this);
  },
  equals: function(other) {
    if (!(other instanceof Document))
      return false;
    return EJSON.stringify(this) === EJSON.stringify(other);
  },
  typeName: function() {
    return "Document";
  },
  toJSONValue: function() {
    return _.extend({}, this);
  }
};

BlackBox = new Mongo.Collection('black', {
  transform: function(doc) {
    doc.data = new Document(doc.data);
    return doc;
  }
});

BlackBox.attachSchema(new SimpleSchema({
  name: {
    type: String
  },
  data: {
    type: Document,
    blackbox: true
  }  
}), {transform: true});

/* defaultValues */

defaultValues = new Mongo.Collection("dv");
defaultValues.attachSchema(defaultValuesSchema);

/* contextCheck */

contextCheck = new Mongo.Collection("contextCheck");
contextCheck.attachSchema(contextCheckSchema);

/* RES */

RES = new Mongo.Collection("RES");
RES.attachSchema(RESSchema);

/* Products */

products = new Mongo.Collection("TestProducts");
products.attachSchema(Product, { selector: { type: 'simple' } });
products.attachSchema(ProductVariant, { selector: { type: 'variant' } });
