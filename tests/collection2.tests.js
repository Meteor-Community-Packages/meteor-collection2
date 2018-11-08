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

    mc.attachSchema(new SimpleSchema({
      foo: {type: String}
    }));

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('attach and get simpleSchema for local collection', function () {
    var mc = new Mongo.Collection(null);

    mc.attachSchema(new SimpleSchema({
      foo: {type: String}
    }));

    expect(mc.simpleSchema() instanceof SimpleSchema).toBe(true);
  });

  it('handles prototype-less objects', function (done) {
      const prototypelessTest = new Mongo.Collection('prototypelessTest');

      prototypelessTest.attachSchema(new SimpleSchema({
        foo: {
          type: String
        }
      }));

      const prototypelessObject = Object.create(null);
      prototypelessObject.foo = 'bar'

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

      upsertAutoValueTest.attachSchema(new SimpleSchema({
        foo: {
          type: String
        },
        av: {
          type: String,
          autoValue() {
            times++;
            return "test";
          }
        }
      }));

      upsertAutoValueTest.remove({});

      upsertAutoValueTest.upsert({
        foo: 'bar'
      }, {
        $set: {
          av: 'abc'
        }
      }, (error, result) => {
        expect(times).toBe(1);
        done();
      });
    });
  }

  it('no errors when using a schemaless collection', function (done) {
    const noSchemaCollection = new Mongo.Collection('noSchema', {
      transform(doc) {
        doc.userFoo = 'userBar';
        return doc;
      },
    });

    noSchemaCollection.insert({
      a: 1,
      b: 2
    }, (error, newId) => {
      expect(!!error).toBe(false);
      expect(!!newId).toBe(true);

      const doc = noSchemaCollection.findOne(newId);
      expect(doc instanceof Object).toBe(true);
      expect(doc.userFoo).toBe('userBar');

      noSchemaCollection.update({
        _id: newId
      }, {
        $set: {
          a: 3,
          b: 4
        }
      }, error => {
        expect(!!error).toBe(false);
        done();
      });
    });
  });

  it('empty strings are removed but we can override', function (done) {
    const RESSchema = new SimpleSchema({
      foo: { type: String },
      bar: { type: String, optional: true }
    });

    const RES = new Mongo.Collection('RES');
    RES.attachSchema(RESSchema);

    // Remove empty strings (default)
    RES.insert({
      foo: "foo",
      bar: ""
    }, (error, newId1) => {
      expect(!!error).toBe(false);
      expect(typeof newId1).toBe('string');

      const doc = RES.findOne(newId1);
      expect(doc instanceof Object).toBe(true);
      expect(doc.bar).toBe(undefined);

      // Don't remove empty strings
      RES.insert({
        foo: "foo",
        bar: ""
      }, {
        removeEmptyStrings: false
      }, (error, newId2) => {
        expect(!!error).toBe(false);
        expect(typeof newId2).toBe('string');

        const doc = RES.findOne(newId2);
        expect(doc instanceof Object).toBe(true);
        expect(doc.bar).toBe('');

        // Don't remove empty strings for an update either
        RES.update({
          _id: newId1
        }, {
          $set: {
            bar: ''
          }
        }, {
          removeEmptyStrings: false
        }, (error, result) => {
          expect(!!error).toBe(false);
          expect(result).toBe(1);

          const doc = RES.findOne(newId1);
          expect(doc instanceof Object).toBe(true);
          expect(doc.bar).toBe('');
          done();
        });
      });
    });
  });

  it('extending a schema after attaching it, collection2 validation respects the extension', (done) => {
    const schema = new SimpleSchema({
      foo: String
    });

    const collection = new Mongo.Collection('ExtendAfterAttach');
    collection.attachSchema(schema);

    collection.insert({
      foo: "foo",
      bar: "bar"
    }, {
      filter: false
    }, (error) => {
      expect(error.invalidKeys[0].name).toBe('bar');

      schema.extend({
        bar: String
      });

      collection.insert({
        foo: "foo",
        bar: "bar"
      }, {
        filter: false
      }, (error2) => {
        expect(!!error2).toBe(false);

        done();
      });
    });
  });

  it('extending a schema with a selector after attaching it, collection2 validation respects the extension', (done) => {
    const schema = new SimpleSchema({
      foo: String
    });

    const collection = new Mongo.Collection('ExtendAfterAttach2');
    collection.attachSchema(schema, { selector: { foo: "foo" } });

    collection.insert({
      foo: "foo",
      bar: "bar"
    }, {
      filter: false
    }, (error) => {
      expect(error.invalidKeys[0].name).toBe('bar');

      schema.extend({
        bar: String
      });

      collection.insert({
        foo: "foo",
        bar: "bar"
      }, {
        filter: false
      }, (error2) => {
        expect(!!error2).toBe(false);

        done();
      });
    });
  });

  addBooksTests();
  addContextTests();
  addDefaultValuesTests();
  addMultiTests();
});
