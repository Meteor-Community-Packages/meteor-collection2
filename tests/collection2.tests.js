import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';
import addMultiTests from './multi.tests.js';
import addBooksTests from './books.tests.js';
import addContextTests from './context.tests.js';
import addDefaultValuesTests from './default.tests.js';
import { Meteor } from 'meteor/meteor';
import { callMongoMethod } from './helper';

/* global describe, it */

describe('collection2', function () {
  it('attach and get simpleSchema for normal collection', function () {
    const mc = new Mongo.Collection('mc', Meteor.isClient ? { connection: null } : undefined);

    mc.attachSchema(
      new SimpleSchema({
        foo: { type: String }
      })
    );

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('attach and get simpleSchema for local collection', function () {
    const mc = new Mongo.Collection(null);

    mc.attachSchema(
      new SimpleSchema({
        foo: { type: String }
      })
    );

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('handles prototype-less objects', async function () {
    const prototypelessTest = new Mongo.Collection(
      'prototypelessTest',
      Meteor.isClient ? { connection: null } : undefined
    );

    prototypelessTest.attachSchema(
      new SimpleSchema({
        foo: {
          type: String
        }
      })
    );

    const prototypelessObject = Object.create(null);
    prototypelessObject.foo = 'bar';

    await callMongoMethod(prototypelessTest, 'insert', [prototypelessObject]);
  });

  if (Meteor.isServer) {
    // https://github.com/aldeed/meteor-collection2/issues/243
    it('upsert runs autoValue only once', async function () {
      const upsertAutoValueTest = new Mongo.Collection(
        'upsertAutoValueTest',
        Meteor.isClient ? { connection: null } : undefined
      );
      let times = 0;

      upsertAutoValueTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String
          },
          av: {
            type: String,
            autoValue() {
              times++;
              return 'test';
            }
          }
        })
      );

      await callMongoMethod(upsertAutoValueTest, 'remove', [{}]);

      await callMongoMethod(upsertAutoValueTest, 'upsert', [
        {
          foo: 'bar'
        },
        {
          $set: {
            av: 'abc'
          }
        }
      ]);
      expect(times).toBe(1);
    });

    // https://forums.meteor.com/t/simpl-schema-update-error-while-using-lte-operator-when-calling-update-by-the-field-of-type-date/50414/3
    it('upsert can handle query operators in the selector', async function () {
      const upsertQueryOperatorsTest = new Mongo.Collection(
        'upsertQueryOperatorsTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorsTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: Date,
            optional: true
          },
          bar: Number,
          baz: Number
        })
      );

      await callMongoMethod(upsertQueryOperatorsTest, 'remove', [{}]);
      const oneDayInMs = 1000 * 60 * 60 * 24;
      const yesterday = new Date(Date.now() - oneDayInMs);
      const tomorrow = new Date(Date.now() + oneDayInMs);

      const { numberAffected, insertedId } = await callMongoMethod(
        upsertQueryOperatorsTest,
        'upsert',
        [
          {
            foo: { $gte: yesterday, $lte: tomorrow }
          },
          {
            $set: {
              bar: 2
            },
            $inc: {
              baz: 4
            }
          }
        ]
      );

      expect(numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorsTest, 'findOne', []);
      expect(insertedId).toBe(doc._id);
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });

    it('upsert with schema can handle query operator which contains undefined or null', async function () {
      const upsertQueryOperatorUndefinedTest = new Mongo.Collection(
        'upsertQueryOperatorUndefinedTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorUndefinedTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String,
            optional: true
          },
          bar: Number,
          baz: Number
        })
      );

      // Let's try for undefined.
      await callMongoMethod(upsertQueryOperatorUndefinedTest, 'remove', [{}]);

      const result = await callMongoMethod(upsertQueryOperatorUndefinedTest, 'upsert', [
        {
          foo: undefined
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorUndefinedTest, 'findOne', []);
      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo).toBe(undefined);
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);

      // Let's try for null.

      await callMongoMethod(upsertQueryOperatorUndefinedTest, 'remove', [{}]);

      const result2 = await callMongoMethod(upsertQueryOperatorUndefinedTest, 'upsert', [
        {
          foo: null
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result2.numberAffected).toBe(1);

      const doc2 = await callMongoMethod(upsertQueryOperatorUndefinedTest, 'findOne', []);
      expect(result2.insertedId).toBe(doc2._id);
      expect(doc2.foo).toBe(null);
      expect(doc2.bar).toBe(2);
      expect(doc2.baz).toBe(4);
    });

    it('upsert with schema can handle query operator "eq" correctly in the selector when property is left out in $set or $setOnInsert', async function () {
      const upsertQueryOperatorEqTest = new Mongo.Collection(
        'upsertQueryOperatorEqTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorEqTest.attachSchema(
        new SimpleSchema({
          foo: String,
          bar: Number,
          baz: Number
        })
      );

      await callMongoMethod(upsertQueryOperatorEqTest, 'remove', [{}]);

      const result = await callMongoMethod(upsertQueryOperatorEqTest, 'upsert', [
        {
          foo: { $eq: 'test' }
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorEqTest, 'findOne', []);
      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo).toBe('test');
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });

    it('upsert with schema can handle query operator "in" with one element correctly in the selector when property is left out in $set or $setOnInsert', async function () {
      const upsertQueryOperatorInSingleTest = new Mongo.Collection(
        'upsertQueryOperatorInSingleTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorInSingleTest.attachSchema(
        new SimpleSchema({
          foo: String,
          bar: Number,
          baz: Number
        })
      );

      await callMongoMethod(upsertQueryOperatorInSingleTest, 'remove', [{}]);

      const result = await callMongoMethod(upsertQueryOperatorInSingleTest, 'upsert', [
        {
          foo: { $in: ['test'] }
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorInSingleTest, 'findOne', []);
      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo).toBe('test');
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });

    it('upsert with schema can handle query operator "in" with multiple elements correctly in the selector when property is left out in $set or $setOnInsert', async function () {
      const upsertQueryOperatorInMultiTest = new Mongo.Collection(
        'upsertQueryOperatorInMultiTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorInMultiTest.attachSchema(
        new SimpleSchema({
          foo: {
            type: String,
            optional: true
          },
          bar: Number,
          baz: Number
        })
      );

      await callMongoMethod(upsertQueryOperatorInMultiTest, 'remove', [{}]);

      const result = await callMongoMethod(upsertQueryOperatorInMultiTest, 'upsert', [
        {
          foo: { $in: ['test', 'test2'] }
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorInMultiTest, 'findOne', []);
      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo).toBe(undefined);
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });

    // https://github.com/Meteor-Community-Packages/meteor-collection2/issues/408
    it('upsert with schema can handle nested objects correctly', async function () {
      const upsertQueryOperatorNestedObject = new Mongo.Collection(
        'upsertQueryOperatorNestedObject',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorNestedObject.attachSchema(
        new SimpleSchema({
          foo: {
            type: new SimpleSchema({
              bar: {
                type: String
              },
              baz: {
                type: String
              }
            })
          },
          test: {
            type: Date
          }
        })
      );

      await callMongoMethod(upsertQueryOperatorNestedObject, 'remove', [{}]);

      const testDateValue = new Date();

      const result = await callMongoMethod(upsertQueryOperatorNestedObject, 'upsert', [
        {
          test: '1'
        },
        {
          $set: {
            foo: {
              bar: '1',
              baz: '2'
            },
            test: testDateValue
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorNestedObject, 'findOne', [
        {
          _id: result.insertedId
        }
      ]);

      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo.bar).toBe('1');
      expect(doc.foo.baz).toBe('2');
      expect(doc.test).toEqual(testDateValue);
    });

    it('upsert with schema can handle query operator "$and" including inner nested selectors correctly when properties is left out in $set or $setOnInsert', async function () {
      const upsertQueryOperatorAndTest = new Mongo.Collection(
        'upsertQueryOperatorAndTest',
        Meteor.isClient ? { connection: null } : undefined
      );

      upsertQueryOperatorAndTest.attachSchema(
        new SimpleSchema({
          foo: String,
          test1: String,
          test2: String,
          bar: Number,
          baz: Number
        })
      );

      await callMongoMethod(upsertQueryOperatorAndTest, 'remove', [{}]);

      const result = await callMongoMethod(upsertQueryOperatorAndTest, 'upsert', [
        {
          foo: 'test',
          $and: [{ test1: 'abc' }, { $and: [{ test2: { $in: ['abc'] } }] }]
        },
        {
          $set: {
            bar: 2
          },
          $inc: {
            baz: 4
          }
        }
      ]);

      expect(result.numberAffected).toBe(1);

      const doc = await callMongoMethod(upsertQueryOperatorAndTest, 'findOne', []);
      expect(result.insertedId).toBe(doc._id);
      expect(doc.foo).toBe('test');
      expect(doc.test1).toBe('abc');
      expect(doc.test2).toBe('abc');
      expect(doc.bar).toBe(2);
      expect(doc.baz).toBe(4);
    });
  }

  it('no errors when using a schemaless collection', async function () {
    const noSchemaCollection = new Mongo.Collection('noSchema', {
      transform(doc) {
        doc.userFoo = 'userBar';
        return doc;
      },
      connection: Meteor.isClient ? null : undefined
    });

    const newId = await callMongoMethod(noSchemaCollection, 'insert', [
      {
        a: 1,
        b: 2
      }
    ]);

    expect(!!newId).toBe(true);

    const doc = await callMongoMethod(noSchemaCollection, 'findOne', [newId]);
    expect(doc instanceof Object).toBe(true);
    expect(doc.userFoo).toBe('userBar');

    await callMongoMethod(noSchemaCollection, 'update', [
      {
        _id: newId
      },
      {
        $set: {
          a: 3,
          b: 4
        }
      }
    ]);
  });

  it('empty strings are removed but we can override', async function () {
    const RESSchema = new SimpleSchema({
      foo: { type: String },
      bar: { type: String, optional: true }
    });

    const RES = new Mongo.Collection('RES', Meteor.isClient ? { connection: null } : undefined);
    RES.attachSchema(RESSchema);

    // Remove empty strings (default)
    const newId1 = await callMongoMethod(RES, 'insert', [
      {
        foo: 'foo',
        bar: ''
      }
    ]);
    expect(typeof newId1).toBe('string');

    const doc = await callMongoMethod(RES, 'findOne', [newId1]);
    expect(doc instanceof Object).toBe(true);
    expect(doc.bar).toBe(undefined);

    // Don't remove empty strings
    const newId2 = await callMongoMethod(RES, 'insert', [
      {
        foo: 'foo',
        bar: ''
      },
      {
        removeEmptyStrings: false
      }
    ]);

    expect(typeof newId2).toBe('string');

    const doc2 = await callMongoMethod(RES, 'findOne', [newId2]);
    expect(doc2 instanceof Object).toBe(true);
    expect(doc2.bar).toBe('');

    // Don't remove empty strings for an update either
    const result = await callMongoMethod(RES, 'update', [
      {
        _id: newId1
      },
      {
        $set: {
          bar: ''
        }
      },
      {
        removeEmptyStrings: false
      }
    ]);

    expect(result).toBe(1);
    const doc3 = await callMongoMethod(RES, 'findOne', [newId1]);
    expect(doc3 instanceof Object).toBe(true);
    expect(doc3.bar).toBe('');
  });

  it('extending a schema after attaching it, collection2 validation respects the extension', async function () {
    const schema = new SimpleSchema({
      foo: String
    });

    const collection = new Mongo.Collection(
      'ExtendAfterAttach',
      Meteor.isClient ? { connection: null } : undefined
    );
    collection.attachSchema(schema);

    try {
      await callMongoMethod(collection, 'insert', [
        {
          foo: 'foo',
          bar: 'bar'
        },
        {
          filter: false
        }
      ]);
    } catch (error) {
      expect(error.invalidKeys[0].name).toBe('bar');

      schema.extend({
        bar: String
      });

      await callMongoMethod(collection, 'insert', [
        {
          foo: 'foo',
          bar: 'bar'
        },
        {
          filter: false
        }
      ]);

      return;
    }

    throw new Error('should not get here');
  });

  it('extending a schema with a selector after attaching it, collection2 validation respects the extension', async () => {
    const schema = new SimpleSchema({
      foo: String
    });

    const collection = new Mongo.Collection(
      'ExtendAfterAttach2',
      Meteor.isClient ? { connection: null } : undefined
    );
    collection.attachSchema(schema, { selector: { foo: 'foo' } });

    try {
      await callMongoMethod(collection, 'insert', [
        {
          foo: 'foo',
          bar: 'bar'
        },
        {
          filter: false
        }
      ]);
    } catch (error) {
      expect(error.invalidKeys[0].name).toBe('bar');

      schema.extend({
        bar: String
      });

      await callMongoMethod(collection, 'insert', [
        {
          foo: 'foo',
          bar: 'bar'
        },
        {
          filter: false
        }
      ]);
    }
  });

  it('pick or omit schema fields when options are provided', async function () {
    const collectionSchema = new SimpleSchema({
      foo: { type: String },
      bar: { type: String, optional: true }
    });

    const collection = new Mongo.Collection(
      'pickOrOmit',
      Meteor.isClient ? { connection: null } : undefined
    );
    collection.attachSchema(collectionSchema);

    // Test error from including both pick and omit 2
    let errorThrown = false;

    try {
      await callMongoMethod(collection, 'insert', [
        { foo: 'foo', bar: '' },
        { pick: ['foo'], omit: ['foo'] }
      ]);
    } catch (error) {
      expect(error.message).toBe('pick and omit options are mutually exclusive');
      errorThrown = true;
    }

    expect(errorThrown).toBe(true); // should have thrown error

    // Omit required field 'foo'
    const newId2 = await callMongoMethod(collection, 'insert', [
      { bar: 'test' },
      { omit: ['foo'] }
    ]);

    expect(typeof newId2).toBe('string');

    const doc = await callMongoMethod(collection, 'findOne', [newId2]);
    expect(doc instanceof Object).toBe(true);
    expect(doc.foo).toBe(undefined);
    expect(doc.bar).toBe('test');

    // Pick only 'foo'
    const result = await callMongoMethod(collection, 'update', [
      { _id: newId2 },
      { $set: { foo: 'test', bar: 'changed' } },
      { pick: ['foo'] }
    ]);

    expect(result).toBe(1);

    const doc2 = await callMongoMethod(collection, 'findOne', [newId2]);
    expect(doc2 instanceof Object).toBe(true);
    expect(doc2.foo).toBe('test');
    expect(doc2.bar).toBe('test');
  });

  addBooksTests();
  addContextTests();
  addDefaultValuesTests();
  addMultiTests();
});
