booksSchema = new SimpleSchema({
  title: {
    type: String,
    label: "Title",
    max: 200,
    index: 1
  },
  author: {
    type: String,
    label: "Author"
  },
  copies: {
    type: Number,
    label: "Number of copies",
    min: 0
  },
  lastCheckedOut: {
    type: Date,
    label: "Last date this book was checked out",
    optional: true
  },
  summary: {
    type: String,
    label: "Brief summary",
    optional: true,
    max: 1000
  },
  isbn: {
    type: String,
    label: "ISBN",
    optional: true,
    index: 1,
    unique: true
  },
  field1: {
    type: String,
    optional: true
  },
  field2: {
    type: String,
    optional: true
  },
  createdAt: {
    type: Date,
    optional: true,
    denyUpdate: true
  },
  updatedAt: {
    type: Date,
    optional: true,
    denyInsert: true
  }
});

avSchema = new SimpleSchema({
  name: {
    type: String
  },
  dateDefault: {
    type: Date,
    optional: true,
    autoValue: function() {
      if (!this.isSet) {
        return new Date("2013-01-01");
      }
    }
  },
  dateForce: {
    type: Date,
    optional: true,
    autoValue: function() {
      return new Date("2013-01-01");
    }
  },
  updateCount: {
    type: Number,
    autoValue: function() {
      if (this.isInsert) {
        return 0;
      } else {
        return {$inc: 1};
      }
    }
  },
  content: {
    type: String,
    optional: true
  },
  firstWord: {
    type: String,
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        return content.value.split(' ')[0];
      } else {
        this.unset();
      }
    }
  },
  updatesHistory: {
    type: [Object],
    optional: true,
    autoValue: function() {
      var content = this.field("content");
      if (content.isSet) {
        if (this.isInsert) {
          return [{
              date: new Date(),
              content: content.value
            }];
        } else {
          return {
            $push: {
              date: new Date(),
              content: content.value
            }
          };
        }
      }
    }
  },
  'updatesHistory.$.date': {
    type: Date,
    optional: true
  },
  'updatesHistory.$.content': {
    type: String,
    optional: true
  }
});

defaultValuesSchema = new SimpleSchema({
  bool1: {
    type: Boolean,
    defaultValue: false
  }
});

contextCheckSchema = new SimpleSchema({
  foo: {
    type: String,
    optional: true
  },
  'context.userId': {
    type: String,
    optional: true,
    autoValue: function () {
      return this.userId;
    }
  },
  'context.isFromTrustedCode': {
    type: Boolean,
    optional: true,
    autoValue: function () {
      return this.isFromTrustedCode;
    }
  },
  'context.isInsert': {
    type: Boolean,
    optional: true,
    autoValue: function () {
      return this.isInsert;
    }
  },
  'context.isUpdate': {
    type: Boolean,
    optional: true,
    autoValue: function () {
      return this.isUpdate;
    }
  },
  'context.docId': {
    type: String,
    optional: true,
    autoValue: function () {
      return this.docId;
    }
  }
});

RESSchema = new SimpleSchema({
  foo: { type: String },
  bar: { type: String, optional: true }
});

partOne = new SimpleSchema({
  one: { type: String }
});

partTwo = new SimpleSchema({
  two: { type: String }
});

partThree = new SimpleSchema({
  two: { type: Number }
});

Product = new SimpleSchema({
  _id: {
    type: String,
    optional: true
  },
  title: {
    type: String,
    defaultValue: ""
  },
  type: {
    label: "Type",
    type: String,
    defaultValue: "simple"
  },
  description: {
    type: String,
    defaultValue: "This is a simple product."
  }
});

ProductVariant = new SimpleSchema({
  _id: {
    type: String,
    optional: true
  },
  title: {
    type: String,
    defaultValue: ""
  },
  optionTitle: {
    label: "Option",
    type: String,
    optional: true
  },
  type: {
    label: "Type",
    type: String,
    defaultValue: "variant"
  },
  price: {
    label: "Price",
    type: Number,
    decimal: true,
    min: 0,
    optional: true,
    defaultValue: 5
  },
  createdAt: {
    type: Date,
    denyUpdate: true
  }
});
