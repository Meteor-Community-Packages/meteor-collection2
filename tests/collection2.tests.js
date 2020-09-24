import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';
import { _ } from 'meteor/underscore';

import addMultiTests from './multi.tests.js';
import addBooksTests from './books.tests.js';
import addContextTests from './context.tests.js';
import addDefaultValuesTests from './default.tests.js';

describe('collection2', function () {
  it('attach and get simpleSchema for normal collection', function () {
    var mc = new Mongo.Collection('mc');

    mc.attachSchema(
      new SimpleSchema({
        foo: { type: String },
      })
    );

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('attach and get simpleSchema for local collection', function () {
    var mc = new Mongo.Collection(null);

    mc.attachSchema(
      new SimpleSchema({
        foo: { type: String },
      })
    );

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('handles prototype-less objects', function (done) {
    const prototypelessTest = new Mongo.Collection('prototypelessTest');

    prototypelessTest.attachSchema(
      new SimpleSchema({
        foo: {
          type: String,
        },
      })
    );

    const prototypelessObject = Object.create(null);
    prototypelessObject.foo = 'bar';

    prototypelessTest.insert(prototypelessObject, (error, newId) => {
      expect(!!error).toBe(false);
      done();
    });
  });

  if (Meteor.isServer) {
    // https://github.com/aldeed/meteor-collection2/issues/243
    it('upsert runs autoValue only once', function (done) {
      const upsertAutoValueTest = new Mongo.Collection('upsertAutoValueTest');
      let times = 0;

      upsertAutoValueTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String,
          },
          av: {
            type: String,
            autoValue() {
              times++;
              return 'test';
            },
          },
        })
      );

      upsertAutoValueTest.remove({});

      upsertAutoValueTest.upsert(
        {
          foo: 'bar',
        },
        {
          $set: {
            av: 'abc',
          },
        },
        (error, result) => {
          expect(times).toBe(1);
          done();
        }
      );
    });

    // https://forums.meteor.com/t/simpl-schema-update-error-while-using-lte-operator-when-calling-update-by-the-field-of-type-date/50414/3
    it('upsert can handle query operators in the selector', function () {
      const upsertQueryOperatorsTest = new Mongo.Collection(
        'upsertQueryOperatorsTest'
      );

      upsertQueryOperatorsTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: Date,
            optional: true,
          },
          bar: Number,
          baz: Number,
        })
      );

      upsertQueryOperatorsTest.remove({});
      const oneDayInMs = 1000 * 60 * 60 * 24;
      const yesterday = new Date(Date.now() - oneDayInMs);
      const tomorrow = new Date(Date.now() + oneDayInMs);

      const { numberAffected, insertedId } = upsertQueryOperatorsTest.upsert(
        {
          foo: { $gte: yesterday, $lte: tomorrow },
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        }
      );

      expect(numberAffected).toBe(1);
      const doc = upsertQueryOperatorsTest.findOne();
      expect(insertedId).toBe(doc._id);
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });

    it('upsert with schema can handle query operator which contains undefined or null', function (done) {
      const upsertQueryOperatorUndefinedTest = new Mongo.Collection(
        'upsertQueryOperatorUndefinedTest'
      );

      upsertQueryOperatorUndefinedTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String,
            optional: true,
          },
          bar: Number,
          baz: Number,
        })
      );

      // Let's try for undefined.
      upsertQueryOperatorUndefinedTest.remove({});

      upsertQueryOperatorUndefinedTest.upsert(
        {
          foo: undefined,
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        },
        (error, result) => {
          expect(error).toBe(null);

          expect(result.numberAffected).toBe(1);
          const doc = upsertQueryOperatorUndefinedTest.findOne();
          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo).toBe(undefined);
          expect(doc.bar).toBe(2);
          expect(doc.baz).toBe(4);

          // Let's try for null.
          upsertQueryOperatorUndefinedTest.remove({});

          upsertQueryOperatorUndefinedTest.upsert(
            {
              foo: null,
            },
            {
              $set: {
                bar: 2,
              },
              $inc: {
                baz: 4,
              },
            },
            (error2, result2) => {
              expect(error2).toBe(null);

              expect(result2.numberAffected).toBe(1);
              const doc = upsertQueryOperatorUndefinedTest.findOne();
              expect(result2.insertedId).toBe(doc._id);
              expect(doc.foo).toBe(null);
              expect(doc.bar).toBe(2);
              expect(doc.baz).toBe(4);

              done();
            }
          );
        }
      );
    });

    it('upsert with schema can handle query operator "eq" correctly in the selector when property is left out in $set or $setOnInsert', function (done) {
      const upsertQueryOperatorEqTest = new Mongo.Collection(
        'upsertQueryOperatorEqTest'
      );

      upsertQueryOperatorEqTest.attachSchema(
        new SimpleSchema({
          foo: String,
          bar: Number,
          baz: Number,
        })
      );

      upsertQueryOperatorEqTest.remove({});

      upsertQueryOperatorEqTest.upsert(
        {
          foo: { $eq: 'test' },
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        },
        (error, result) => {
          expect(error).toBe(null);

          expect(result.numberAffected).toBe(1);
          const doc = upsertQueryOperatorEqTest.findOne();
          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo).toBe('test');
          expect(doc.bar).toBe(2);
          expect(doc.baz).toBe(4);

          done();
        }
      );
    });

    it('upsert with schema can handle query operator "in" with one element correctly in the selector when property is left out in $set or $setOnInsert', function (done) {
      const upsertQueryOperatorInSingleTest = new Mongo.Collection(
        'upsertQueryOperatorInSingleTest'
      );

      upsertQueryOperatorInSingleTest.attachSchema(
        new SimpleSchema({
          foo: String,
          bar: Number,
          baz: Number,
        })
      );

      upsertQueryOperatorInSingleTest.remove({});

      upsertQueryOperatorInSingleTest.upsert(
        {
          foo: { $in: ['test'] },
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        },
        (error, result) => {
          expect(error).toBe(null);

          expect(result.numberAffected).toBe(1);
          const doc = upsertQueryOperatorInSingleTest.findOne();
          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo).toBe('test');
          expect(doc.bar).toBe(2);
          expect(doc.baz).toBe(4);

          done();
        }
      );
    });

    it('upsert with schema can handle query operator "in" with multiple elements correctly in the selector when property is left out in $set or $setOnInsert', function (done) {
      const upsertQueryOperatorInMultiTest = new Mongo.Collection(
        'upsertQueryOperatorInMultiTest'
      );

      upsertQueryOperatorInMultiTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String,
            optional: true,
          },
          bar: Number,
          baz: Number,
        })
      );

      upsertQueryOperatorInMultiTest.remove({});

      upsertQueryOperatorInMultiTest.upsert(
        {
          foo: { $in: ['test', 'test2'] },
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        },
        (error, result) => {
          expect(error).toBe(null);

          expect(result.numberAffected).toBe(1);
          const doc = upsertQueryOperatorInMultiTest.findOne();
          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo).toBe(undefined);
          expect(doc.bar).toBe(2);
          expect(doc.baz).toBe(4);

          done();
        }
      );
    });

    // https://github.com/Meteor-Community-Packages/meteor-collection2/issues/408
    it('upsert with schema can handle nested objects correctly', function (done) {
      const upsertQueryOperatorNestedObject = new Mongo.Collection(
        'upsertQueryOperatorNestedObject'
      );

      upsertQueryOperatorNestedObject.attachSchema(
        new SimpleSchema({
          foo: {
            type: new SimpleSchema({
              bar: {
                type: String,
              },
              baz: {
                type: String,
              },
            }),
          },
          test: {
            type: Date,
          },
        })
      );

      upsertQueryOperatorNestedObject.remove({});

      const testDateValue = new Date();
      upsertQueryOperatorNestedObject.upsert(
        {
          test: '1',
        },
        {
          $set: {
            foo: {
              bar: '1',
              baz: '2',
            },
            test: testDateValue,
          },
        },
        (error, result) => {
          expect(error).toBe(null);
          expect(result.numberAffected).toBe(1);

          const doc = upsertQueryOperatorNestedObject.findOne({
            _id: result.insertedId,
          });

          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo.bar).toBe('1');
          expect(doc.foo.baz).toBe('2');
          expect(doc.test).toEqual(testDateValue);

          done();
        }
      );
    });

    it('upsert with schema can handle query operator "$and" including inner nested selectors correctly when properties is left out in $set or $setOnInsert', function (done) {
      const upsertQueryOperatorAndTest = new Mongo.Collection(
        'upsertQueryOperatorAndTest'
      );

      upsertQueryOperatorAndTest.attachSchema(
        new SimpleSchema({
          foo: String,
          test1: String,
          test2: String,
          bar: Number,
          baz: Number,
        })
      );

      upsertQueryOperatorAndTest.remove({});

      upsertQueryOperatorAndTest.upsert(
        {
          foo: 'test',
          $and: [{ test1: 'abc' }, { $and: [{ test2: { $in: ['abc'] } }] }],
        },
        {
          $set: {
            bar: 2,
          },
          $inc: {
            baz: 4,
          },
        },
        (error, result) => {
          expect(error).toBe(null);

          expect(result.numberAffected).toBe(1);
          const doc = upsertQueryOperatorAndTest.findOne();
          expect(result.insertedId).toBe(doc._id);
          expect(doc.foo).toBe('test');
          expect(doc.test1).toBe('abc');
          expect(doc.test2).toBe('abc');
          expect(doc.bar).toBe(2);
          expect(doc.baz).toBe(4);

          done();
        }
      );
    });
  }

  it('no errors when using a schemaless collection', function (done) {
    const noSchemaCollection = new Mongo.Collection('noSchema', {
      transform(doc) {
        doc.userFoo = 'userBar';
        return doc;
      },
    });

    noSchemaCollection.insert(
      {
        a: 1,
        b: 2,
      },
      (error, newId) => {
        expect(!!error).toBe(false);
        expect(!!newId).toBe(true);

        const doc = noSchemaCollection.findOne(newId);
        expect(doc instanceof Object).toBe(true);
        expect(doc.userFoo).toBe('userBar');

        noSchemaCollection.update(
          {
            _id: newId,
          },
          {
            $set: {
              a: 3,
              b: 4,
            },
          },
          (error) => {
            expect(!!error).toBe(false);
            done();
          }
        );
      }
    );
  });

  it('empty strings are removed but we can override', function (done) {
    const RESSchema = new SimpleSchema({
      foo: { type: String },
      bar: { type: String, optional: true },
    });

    const RES = new Mongo.Collection('RES');
    RES.attachSchema(RESSchema);

    // Remove empty strings (default)
    RES.insert(
      {
        foo: 'foo',
        bar: '',
      },
      (error, newId1) => {
        expect(!!error).toBe(false);
        expect(typeof newId1).toBe('string');

        const doc = RES.findOne(newId1);
        expect(doc instanceof Object).toBe(true);
        expect(doc.bar).toBe(undefined);

        // Don't remove empty strings
        RES.insert(
          {
            foo: 'foo',
            bar: '',
          },
          {
            removeEmptyStrings: false,
          },
          (error, newId2) => {
            expect(!!error).toBe(false);
            expect(typeof newId2).toBe('string');

            const doc = RES.findOne(newId2);
            expect(doc instanceof Object).toBe(true);
            expect(doc.bar).toBe('');

            // Don't remove empty strings for an update either
            RES.update(
              {
                _id: newId1,
              },
              {
                $set: {
                  bar: '',
                },
              },
              {
                removeEmptyStrings: false,
              },
              (error, result) => {
                expect(!!error).toBe(false);
                expect(result).toBe(1);

                const doc = RES.findOne(newId1);
                expect(doc instanceof Object).toBe(true);
                expect(doc.bar).toBe('');
                done();
              }
            );
          }
        );
      }
    );
  });

  it('extending a schema after attaching it, collection2 validation respects the extension', (done) => {
    const schema = new SimpleSchema({
      foo: String,
    });

    const collection = new Mongo.Collection('ExtendAfterAttach');
    collection.attachSchema(schema);

    collection.insert(
      {
        foo: 'foo',
        bar: 'bar',
      },
      {
        filter: false,
      },
      (error) => {
        expect(error.invalidKeys[0].name).toBe('bar');
        schema.extend({
          bar: String,
        });

        collection.insert(
          {
            foo: 'foo',
            bar: 'bar',
          },
          {
            filter: false,
          },
          (error2) => {
            expect(!!error2).toBe(false);

            done();
          }
        );
      }
    );
  });

  it('extending a schema with a selector after attaching it, collection2 validation respects the extension', (done) => {
    const schema = new SimpleSchema({
      foo: String,
    });

    const collection = new Mongo.Collection('ExtendAfterAttach2');
    collection.attachSchema(schema, { selector: { foo: 'foo' } });

    collection.insert(
      {
        foo: 'foo',
        bar: 'bar',
      },
      {
        filter: false,
      },
      (error) => {
        expect(error.invalidKeys[0].name).toBe('bar');

        schema.extend({
          bar: String,
        });

        collection.insert(
          {
            foo: 'foo',
            bar: 'bar',
          },
          {
            filter: false,
          },
          (error2) => {
            expect(!!error2).toBe(false);

            done();
          }
        );
      }
    );
  });

  it('pick or omit schema fields when options are provided', function () {
    const collectionSchema = new SimpleSchema({
      foo: { type: String },
      bar: { type: String, optional: true },
    });

    const collection = new Mongo.Collection('pickOrOmit');
    collection.attachSchema(collectionSchema);

    // Test error from including both pick and omit
    let errorThrown = false;

    try {
      collection.insert(
        { foo: 'foo', bar: '' },
        { pick: ['foo'], omit: ['foo'] }
      );
    } catch (error) {
      expect(error.message).toBe(
        'pick and omit options are mutually exclusive'
      );
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);

    // Omit required field 'foo'
    collection.insert({ bar: 'test' }, { omit: ['foo'] }, (error, newId2) => {
      expect(!!error).toBe(false);
      expect(typeof newId2).toBe('string');

      const doc = collection.findOne(newId2);
      expect(doc instanceof Object).toBe(true);
      expect(doc.foo).toBe(undefined);
      expect(doc.bar).toBe('test');

      // Pick only 'foo'
      collection.update(
        { _id: newId2 },
        { $set: { foo: 'test', bar: 'changed' } },
        { pick: ['foo'] },
        (error, result) => {
          expect(!!error).toBe(false);
          expect(result).toBe(1);

          const doc = collection.findOne(newId2);
          expect(doc instanceof Object).toBe(true);
          expect(doc.foo).toBe('test');
          expect(doc.bar).toBe('test');
        }
      );
    });
  });

  addBooksTests();
  addContextTests();
  addDefaultValuesTests();
  addMultiTests();
});
