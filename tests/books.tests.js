import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const booksSchema = new SimpleSchema({
  title: {
    type: String,
    label: "Title",
    max: 200,
  },
  author: {
    type: String,
    label: "Author"
  },
  copies: {
    type: SimpleSchema.Integer,
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
  },
  updatedAt: {
    type: Date,
    optional: true,
  }
});

const books = new Mongo.Collection('books');
books.attachSchema(booksSchema);

const upsertTest = new Mongo.Collection('upsertTest');
upsertTest.attachSchema(new SimpleSchema({
  _id: {type: String},
  foo: {type: Number}
}));

export default function addBooksTests() {
  describe('insert', function () {
    beforeEach(function () {
      books.find({}).forEach(book => {
        books.remove(book._id);
      });
    });

    it('required', function (done) {
      const maybeNext = _.after(2, done);

      const id = books.insert({
        title: "Ulysses",
        author: "James Joyce"
      }, (error, result) => {
        //The insert will fail, error will be set,
        expect(!!error).toBe(true);
        //and result will be false because "copies" is required.
        expect(result).toBe(false);
        //The list of errors is available by calling books.simpleSchema().namedContext().validationErrors()
        const validationErrors = books.simpleSchema().namedContext().validationErrors();
        expect(validationErrors.length).toBe(1);

        const key = validationErrors[0] || {};
        expect(key.name).toBe('copies');
        expect(key.type).toBe('required');
        maybeNext();
      });

      expect(typeof id).toBe('string');
      maybeNext();
    });

    if (Meteor.isServer) {
      it('no validation when calling underlying _collection on the server', function (done) {
        books._collection.insert({
          title: "Ulysses",
          author: "James Joyce",
          copies: 1,
          updatedAt: new Date()
        }, (error) => {
          expect(error).toBe(null);
          done();
        });
      });
    }
  });

  if (Meteor.isServer) {
    describe('upsert', function () {
      function getCallback(done) {
        return (error, result) => {
          expect(!!error).toBe(false);
          expect(result.numberAffected).toBe(1);

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(0);

          done();
        };
      }

      function getUpdateCallback(done) {
        return (error, result) => {
          if (error) console.error(error);
          expect(!!error).toBe(false);
          expect(result).toBe(1);

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(0);

          done();
        };
      }

      function getErrorCallback(done) {
        return (error, result) => {
          expect(!!error).toBe(true);
          expect(!!result).toBe(false);

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(1);

          done();
        };
      }

      it('valid', function (done) {
        books.upsert({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            title: "Ulysses",
            author: "James Joyce",
            copies: 1
          }
        }, getCallback(done));
      });

      it('upsert as update should update entity by _id - valid', function (done) {
        const id = books.insert({title: 'new', author: 'author new', copies: 2});

        books.upsert({
          _id: id
        }, {
          $set: {
            title: "Ulysses",
            author: "James Joyce",
            copies: 1
          }
        }, getCallback(done));
      });

      it('upsert as update - valid', function (done) {
        books.update({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            title: "Ulysses",
            author: "James Joyce",
            copies: 1
          }
        }, {
          upsert: true
        }, getUpdateCallback(done));
      });

      it('upsert as update with $and', function (done) {
        books.update({
          $and: [
           { title: "Ulysses" },
           { author: "James Joyce" },
          ],
        }, {
          $set: {
            title: "Ulysses",
            author: "James Joyce",
            copies: 1
          }
        }, {
          upsert: true
        }, getUpdateCallback(done));
      });

      it('upsert - invalid', function (done) {
        books.upsert({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            copies: -1
          }
        }, getErrorCallback(done));
      });

      it('upsert as update - invalid', function (done) {
        books.update({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            copies: -1
          }
        }, {
          upsert: true
        }, getErrorCallback(done));
      });

      it('upsert - valid with selector', function (done) {
        books.upsert({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            copies: 1
          }
        }, getCallback(done));
      });

      it('upsert as update - valid with selector', function (done) {
        books.update({
          title: "Ulysses",
          author: "James Joyce"
        }, {
          $set: {
            copies: 1
          }
        }, {
          upsert: true
        }, getUpdateCallback(done));
      });
    });
  }

  it('validate false', function (done) {
    let title;
    if (Meteor.isClient) {
      title = "Validate False Client";
    } else {
      title = "Validate False Server";
    }

    books.insert({
      title: title,
      author: "James Joyce"
    }, {
      validate: false,
      validationContext: "validateFalse"
    }, (error, result) => {
      let insertedBook;
      const validationErrors = books.simpleSchema().namedContext("validateFalse").validationErrors();

      if (Meteor.isClient) {
        // When validate: false on the client, we should still get a validation error and validationErrors back from the server
        expect(!!error).toBe(true);
        // There should be an `invalidKeys` property on the error, too
        expect(error.invalidKeys.length).toBe(1);
        expect(!!result).toBe(false);
        expect(validationErrors.length).toBe(1);

        insertedBook = books.findOne({ title: title });
        expect(!!insertedBook).toBe(false);
      } else {
        // When validate: false on the server, validation should be skipped
        expect(!!error).toBe(false);
        expect(!!result).toBe(true);
        expect(validationErrors.length).toBe(0);

        insertedBook = books.findOne({ title: title });
        expect(!!insertedBook).toBe(true);
      }

      // do a good one to set up update test
      books.insert({
        title: title + " 2",
        author: "James Joyce",
        copies: 1
      }, {
        validate: false,
        validationContext: "validateFalse2"
      }, (error, newId) => {
        const validationErrors = books.simpleSchema().namedContext("validateFalse2").validationErrors();

        expect(!!error).toBe(false);
        expect(!!newId).toBe(true);
        expect(validationErrors.length).toBe(0);

        const insertedBook = books.findOne({ title: title + " 2" });
        expect(!!insertedBook).toBe(true);

        books.update({
          _id: newId
        }, {
          $set: {
            copies: "Yes Please"
          }
        }, {
          validate: false,
          validationContext: "validateFalse3"
        }, (error, result) => {
          let updatedBook;
          const validationErrors = books.simpleSchema().namedContext("validateFalse3").validationErrors();

          if (Meteor.isClient) {
            // When validate: false on the client, we should still get a validation error and invalidKeys from the server
            expect(!!error).toBe(true);
            // There should be an `invalidKeys` property on the error, too
            expect(error.invalidKeys.length).toBe(1);
            expect(!!result).toBe(false);
            expect(validationErrors.length).toBe(1);

            updatedBook = books.findOne(newId);
            expect(!!updatedBook).toBe(true);
            // copies should still be 1 because our new value failed validation on the server
            expect(updatedBook.copies).toBe(1);
          } else {
            // When validate: false on the server, validation should be skipped
            expect(!!error).toBe(false);
            expect(!!result).toBe(true);
            expect(validationErrors.length).toBe(0);

            updatedBook = books.findOne(newId);
            expect(!!updatedBook).toBe(true);
            // copies should be changed despite being invalid because we skipped validation on the server
            expect(updatedBook.copies).toBe('Yes Please');
          }

          // now try a good one
          books.update({
            _id: newId
          }, {
            $set: {
              copies: 3
            }
          }, {
            validate: false,
            validationContext: "validateFalse4"
          }, (error, result) => {
            const validationErrors = books.simpleSchema().namedContext("validateFalse4").validationErrors();
            expect(!!error).toBe(false);
            expect(result).toBe(1);
            expect(validationErrors.length).toBe(0);

            const updatedBook = books.findOne(newId);
            expect(!!updatedBook).toBe(true);
            // copies should be changed because we used a valid value
            expect(updatedBook.copies).toBe(3);
            done();
          });
        });
      });
    });
  });

  if (Meteor.isServer) {
    it('bypassCollection2', function (done) {
      let id;

      try {
        id = books.insert({}, {bypassCollection2: true})
      } catch (error) {
        done(error);
      }

      try {
        books.update(id, {$set: {copies: 2}}, {bypassCollection2: true})
        done();
      } catch (error) {
        done(error);
      }
    });

    it('everything filtered out', function () {
      expect(function () {
        upsertTest.update({_id: '123'}, {
          $set: {
            boo: 1
          }
        });
      }).toThrow('After filtering out keys not in the schema, your modifier is now empty');
    });

    it('upsert works with schema that allows _id', function () {
      upsertTest.remove({});

      const upsertTestId = upsertTest.insert({foo: 1});

      upsertTest.update({_id: upsertTestId}, {
        $set: {
          foo: 2
        }
      }, {
        upsert: true
      });
      const doc = upsertTest.findOne(upsertTestId);
      expect(doc.foo).toBe(2);
    });
  }
}
