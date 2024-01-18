import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from "meteor/aldeed:simple-schema";
import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { callMeteorFetch, callMongoMethod } from './helper';

/* global describe, it, beforeEach */

const booksSchema = new SimpleSchema({
  title: {
    type: String,
    label: 'Title',
    max: 200
  },
  author: {
    type: String,
    label: 'Author'
  },
  copies: {
    type: SimpleSchema.Integer,
    label: 'Number of copies',
    min: 0
  },
  lastCheckedOut: {
    type: Date,
    label: 'Last date this book was checked out',
    optional: true
  },
  summary: {
    type: String,
    label: 'Brief summary',
    optional: true,
    max: 1000
  },
  isbn: {
    type: String,
    label: 'ISBN',
    optional: true
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
    optional: true
  },
  updatedAt: {
    type: Date,
    optional: true
  }
});

const books = new Mongo.Collection('books');
books.attachSchema(booksSchema);

const upsertTest = new Mongo.Collection('upsertTest');
upsertTest.attachSchema(
  new SimpleSchema({
    _id: { type: String },
    foo: { type: Number }
  })
);

export default function addBooksTests() {
  describe('insert', function () {
    beforeEach(async function () {
      for (const book of await callMeteorFetch(books, {})) {
        await callMongoMethod(books, 'remove', [book._id]);
      }
    });

    if (Meteor.isClient) {
      it('required', function (done) {
        const maybeNext = _.after(2, done);

        const id = books.insert(
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          (error, result) => {
            // The insert will fail, error will be set,
            expect(!!error).toBe(true);
            // and the result will be false because "copies" is required.
            expect(result).toBe(false);
            // The list of errors is available by calling books.simpleSchema().namedContext().validationErrors()
            const validationErrors = books.simpleSchema().namedContext().validationErrors();
            expect(validationErrors.length).toBe(1);

            const key = validationErrors[0] || {};
            expect(key.name).toBe('copies');
            expect(key.type).toBe('required');
            maybeNext();
          }
        );

        expect(typeof id).toBe('string');
        maybeNext();
      });

      it('validate false', function (done) {
        const title = 'Validate False Client';

        callMongoMethod(books, 'insert', [
          {
            title,
            author: 'James Joyce'
          },
          {
            validate: false,
            validationContext: 'validateFalse'
          }
        ])
          .then(() => {
            done(new Error('should not get here'));
          })
          .catch(async (error) => {
            const validationErrors = books
              .simpleSchema()
              .namedContext('validateFalse')
              .validationErrors();

            // When validated: false on the client,
            // we should still get a validation error and validationErrors back from the server
            expect(!!error).toBe(true);
            // There should be an `invalidKeys` property on the error, too
            expect(error.invalidKeys.length).toBe(1);
            // expect(!!result).toBe(false)
            expect(validationErrors.length).toBe(1);

            const insertedBook = await callMongoMethod(books, 'findOne', [{ title }]);
            expect(!!insertedBook).toBe(false);

            // do a good one to set up update test
            callMongoMethod(books, 'insert', [
              {
                title: title + ' 2',
                author: 'James Joyce',
                copies: 1
              },
              {
                validate: false,
                validationContext: 'validateFalse2'
              }
            ]).then(async (newId) => {
              const validationErrors = books
                .simpleSchema()
                .namedContext('validateFalse2')
                .validationErrors();

              expect(!!newId).toBe(true);
              expect(validationErrors.length).toBe(0);

              const insertedBook = await callMongoMethod(books, 'findOne', [
                { title: title + ' 2' }
              ]);
              expect(!!insertedBook).toBe(true);

              callMongoMethod(books, 'update', [
                {
                  _id: newId
                },
                {
                  $set: {
                    copies: 'Yes Please'
                  }
                },
                {
                  validate: false,
                  validationContext: 'validateFalse3'
                }
              ])
                .then(() => {
                  done(new Error('should not get here'));
                })
                .catch(async (error) => {
                  const validationErrors = books
                    .simpleSchema()
                    .namedContext('validateFalse3')
                    .validationErrors();

                  // When validated: false on the client,
                  // we should still get a validation error and invalidKeys from the server
                  expect(!!error).toBe(true);
                  // There should be an `invalidKeys` property on the error, too
                  expect(error.invalidKeys.length).toBe(1);
                  // expect(!!result).toBe(false)
                  expect(validationErrors.length).toBe(1);

                  const updatedBook = await callMongoMethod(books, 'findOne', [newId]);
                  expect(!!updatedBook).toBe(true);
                  // copies should still be 1 because our new value failed validation on the server
                  expect(updatedBook.copies).toBe(1);

                  // now try a good one
                  callMongoMethod(books, 'update', [
                    {
                      _id: newId
                    },
                    {
                      $set: {
                        copies: 3
                      }
                    },
                    {
                      validate: false,
                      validationContext: 'validateFalse4'
                    }
                  ]).then(async (result) => {
                    const validationErrors = books
                      .simpleSchema()
                      .namedContext('validateFalse4')
                      .validationErrors();
                    expect(result).toBe(1);
                    expect(validationErrors.length).toBe(0);

                    const updatedBook = await callMongoMethod(books, 'findOne', [newId]);
                    expect(!!updatedBook).toBe(true);
                    // copies should be changed because we used a valid value
                    expect(updatedBook.copies).toBe(3);
                    done();
                  });
                });
            });
          });
      });
    }

    if (Meteor.isServer) {
      it('required 1 on server', function (done) {
        callMongoMethod(books, 'insert', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          }
        ])
          .then((result) => {
            done('should not get here');
          })
          .catch((error) => {
            // The insert will fail, error will be set,
            expect(!!error).toBe(true);
            // and result will be false because "copies" is required.
            // TODO expect(result).toBe(false);
            // The list of errors is available
            // by calling books.simpleSchema().namedContext().validationErrors()
            const validationErrors = books.simpleSchema().namedContext().validationErrors();
            expect(validationErrors.length).toBe(1);

            const key = validationErrors[0] || {};
            expect(key.name).toBe('copies');
            expect(key.type).toBe('required');
            done();
          });
      });

      it('required 2 on server', async function () {
        const title = 'Validate False Server';

        let error;
        let newId;
        let result;
        // do a good one to set up update test
        try {
          newId = await callMongoMethod(books, 'insert', [
            {
              title: title + ' 2',
              author: 'James Joyce',
              copies: 1
            },
            {
              validate: false,
              validationContext: 'validateFalse2'
            }
          ]);
        } catch (e) {
          error = e;
        }

        let validationErrors = books
          .simpleSchema()
          .namedContext('validateFalse2')
          .validationErrors();

        expect(!!error).toBe(false);
        expect(!!newId).toBe(true);
        expect(validationErrors.length).toBe(0);

        const insertedBook = await callMongoMethod(books, 'findOne', [{ title: title + ' 2' }]);
        expect(!!insertedBook).toBe(true);

        try {
          result = await callMongoMethod(books, 'update', [
            {
              _id: newId
            },
            {
              $set: {
                copies: 'Yes Please'
              }
            },
            {
              validate: false,
              validationContext: 'validateFalse3'
            }
          ]);
          error = null;
        } catch (e) {
          error = e;
        }

        let updatedBook;
        validationErrors = books.simpleSchema().namedContext('validateFalse3').validationErrors();

        // When validated: false on the server, validation should be skipped
        expect(!!error).toBe(false);
        expect(!!result).toBe(true);
        expect(validationErrors.length).toBe(0);

        updatedBook = await callMongoMethod(books, 'findOne', [newId]);

        expect(!!updatedBook).toBe(true);
        // copies should be changed despite being invalid because we skipped validation on the server
        expect(updatedBook.copies).toBe('Yes Please');

        // now try a good one
        try {
          result = await callMongoMethod(books, 'update', [
            {
              _id: newId
            },
            {
              $set: {
                copies: 3
              }
            },
            {
              validate: false,
              validationContext: 'validateFalse4'
            }
          ]);
          error = null;
        } catch (e) {
          error = e;
        }

        validationErrors = books.simpleSchema().namedContext('validateFalse4').validationErrors();
        expect(!!error).toBe(false);
        expect(result).toBe(1);
        expect(validationErrors.length).toBe(0);

        updatedBook = await callMongoMethod(books, 'findOne', [newId]);
        expect(!!updatedBook).toBe(true);
        // copies should be changed because we used a valid value
        expect(updatedBook.copies).toBe(3);
      });

      it('no validation when calling underlying _collection on the server', function (done) {
        callMongoMethod(books._collection, 'insert', [
          {
            title: 'Ulysses',
            author: 'James Joyce',
            copies: 1,
            updatedAt: new Date()
          }
        ])
          .then(() => {
            done();
          })
          .catch(done);
      });
    }
  });

  if (Meteor.isServer) {
    describe('upsert', function () {
      function getCallback(done) {
        return (result) => {
          expect(result.numberAffected).toBe(1);

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(0);

          done();
        };
      }

      function getUpdateCallback(done) {
        return (result) => {
          expect(result).toBe(1);

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(0);

          done();
        };
      }

      function getErrorCallback(done) {
        return (error) => {
          expect(!!error).toBe(true);
          // expect(!!result).toBe(false)

          const validationErrors = books.simpleSchema().namedContext().validationErrors();
          expect(validationErrors.length).toBe(1);

          done();
        };
      }

      it('valid', function (done) {
        callMongoMethod(books, 'upsert', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              title: 'Ulysses',
              author: 'James Joyce',
              copies: 1
            }
          }
        ])
          .then(getCallback(done))
          .catch(done);
      });

      it('upsert as update should update entity by _id - valid', function (done) {
        callMongoMethod(books, 'insert', [{ title: 'new', author: 'author new', copies: 2 }])
          .then((id) => {
            return callMongoMethod(books, 'upsert', [
              {
                _id: id
              },
              {
                $set: {
                  title: 'Ulysses',
                  author: 'James Joyce',
                  copies: 1
                }
              }
            ]);
          })
          .then(getCallback(done))
          .catch(done);
      });

      it('upsert as update - valid', function (done) {
        callMongoMethod(books, 'update', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              title: 'Ulysses',
              author: 'James Joyce',
              copies: 1
            }
          },
          {
            upsert: true
          }
        ])
          .then(getUpdateCallback(done))
          .catch(done);
      });

      it('upsert as update with $and', function (done) {
        callMongoMethod(books, 'update', [
          {
            $and: [{ title: 'Ulysses' }, { author: 'James Joyce' }]
          },
          {
            $set: {
              title: 'Ulysses',
              author: 'James Joyce',
              copies: 1
            }
          },
          {
            upsert: true
          }
        ])
          .then(getUpdateCallback(done))
          .catch(done);
      });

      it('upsert - invalid', function (done) {
        callMongoMethod(books, 'upsert', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              copies: -1
            }
          }
        ])
          .then(() => done(new Error('should not get here')))
          .catch(getErrorCallback(done));
      });

      it('upsert as update - invalid', function (done) {
        callMongoMethod(books, 'update', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              copies: -1
            }
          },
          {
            upsert: true
          }
        ])
          .then(() => done(new Error('should not get here')))
          .catch(getErrorCallback(done));
      });

      it('upsert - valid with selector', function (done) {
        callMongoMethod(books, 'upsert', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              copies: 1
            }
          }
        ])
          .then(getCallback(done))
          .catch(done);
      });

      it('upsert as update - valid with selector', function (done) {
        callMongoMethod(books, 'update', [
          {
            title: 'Ulysses',
            author: 'James Joyce'
          },
          {
            $set: {
              copies: 1
            }
          },
          {
            upsert: true
          }
        ])
          .then(getUpdateCallback(done))
          .catch(done);
      });
    });
  }

  if (Meteor.isServer) {
    it('validate false', function (done) {
      const title = 'Validate False Server';
      let insertedBook, error, newId;

      callMongoMethod(books, 'insert', [
        {
          title,
          author: 'James Joyce'
        },
        {
          validate: false,
          validationContext: 'validateFalse'
        }
      ])
        .then(async (result) => {
          const validationErrors = books
            .simpleSchema()
            .namedContext('validateFalse')
            .validationErrors();

          // When validated: false on the server, validation should be skipped
          expect(!!error).toBe(false);
          expect(!!result).toBe(true);
          expect(validationErrors.length).toBe(0);

          insertedBook = await callMongoMethod(books, 'findOne', [{ title }]);
          expect(!!insertedBook).toBe(true);

          return callMongoMethod(books, 'insert', [
            {
              title: title + ' 2',
              author: 'James Joyce',
              copies: 1
            },
            {
              validate: false,
              validationContext: 'validateFalse2'
            }
          ]);
        })
        .then((_newId) => {
          newId = _newId;

          const validationErrors = books
            .simpleSchema()
            .namedContext('validateFalse2')
            .validationErrors();

          expect(!!newId).toBe(true);
          expect(validationErrors.length).toBe(0);

          return callMongoMethod(books, 'findOne', [{ title: title + ' 2' }]);
        })
        .then((insertedBook) => {
          expect(!!insertedBook).toBe(true);

          return callMongoMethod(books, 'update', [
            {
              _id: newId
            },
            {
              $set: {
                copies: 'Yes Please'
              }
            },
            {
              validate: false,
              validationContext: 'validateFalse3'
            }
          ]);
        })
        .then((result) => {
          const validationErrors = books
            .simpleSchema()
            .namedContext('validateFalse3')
            .validationErrors();

          // When validated: false on the server, validation should be skipped
          expect(!!result).toBe(true);
          expect(validationErrors.length).toBe(0);
          return callMongoMethod(books, 'findOne', [newId]);
        })
        .then((updatedBook) => {
          expect(!!updatedBook).toBe(true);
          // copies should be changed despite being invalid because we skipped validation on the server
          expect(updatedBook.copies).toBe('Yes Please');

          return callMongoMethod(books, 'update', [
            {
              _id: newId
            },
            {
              $set: {
                copies: 3
              }
            },
            {
              validate: false,
              validationContext: 'validateFalse4'
            }
          ]);
        })
        .then((result) => {
          const validationErrors = books
            .simpleSchema()
            .namedContext('validateFalse4')
            .validationErrors();
          expect(result).toBe(1);
          expect(validationErrors.length).toBe(0);

          return callMongoMethod(books, 'findOne', [newId]);
        })
        .then((updatedBook) => {
          expect(!!updatedBook).toBe(true);
          // copies should be changed because we used a valid value
          expect(updatedBook.copies).toBe(3);
          done();
        })
        .catch(done);
    });
  }

  if (Meteor.isServer) {
    it('bypassCollection2 5', async function () {
      const id = await callMongoMethod(books, 'insert', [{}, { bypassCollection2: true }]);

      await callMongoMethod(books, 'update', [
        id,
        { $set: { copies: 2 } },
        { bypassCollection2: true }
      ]);
    });

    it('everything filtered out', async function () {
      try {
        await callMongoMethod(upsertTest, 'update', [
          { _id: '123' },
          {
            $set: {
              boo: 1
            }
          }
        ]);
      } catch (e) {
        expect(e.message).toBe(
          'After filtering out keys not in the schema, your modifier is now empty'
        );
      }
    });

    it('upsert works with schema that allows _id', async function () {
      await callMongoMethod(upsertTest, 'remove', [{}]);

      const upsertTestId = await callMongoMethod(upsertTest, 'insert', [{ foo: 1 }]);

      await callMongoMethod(upsertTest, 'update', [
        { _id: upsertTestId },
        {
          $set: {
            foo: 2
          }
        },
        {
          upsert: true
        }
      ]);

      const doc = await callMongoMethod(upsertTest, 'findOne', [upsertTestId]);
      expect(doc.foo).toBe(2);
    });
  }
}
