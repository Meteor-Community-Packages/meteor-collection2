import 'meteor/aldeed:collection2/static';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import expect from 'expect';
import SimpleSchema from "meteor/aldeed:simple-schema";
import { callMongoMethod } from './helper';
import { Collection2 } from 'meteor/aldeed:collection2'
import { simpleSchemaImpl } from './libraries'

const collection = new Mongo.Collection('autoValueTestCollection');
const localCollection = new Mongo.Collection('autoValueTestLocalCollection', {
  connection: null
});

const attach = () => {
  [collection, localCollection].forEach((c) => {
    c.attachSchema(
      new SimpleSchema({
        clientAV: {
          type: SimpleSchema.Integer,
          optional: true,
          autoValue() {
            if (Meteor.isServer) return;
            return (this.value || 0) + 1;
          }
        },
        serverAV: {
          type: SimpleSchema.Integer,
          optional: true,
          autoValue() {
            console.debug('get autovalues', Meteor.isClient)
            if (Meteor.isClient) return;
            return (this.value || 0) + 1;
          }
        }
      })
    );
  });
}

if (Meteor.isClient) {
  describe('autoValue on client', function () {
    before(() => {
      Collection2.defineValidation(simpleSchemaImpl());
      attach()
    })

    it('for client insert, autoValues should be added on the server only (added to only a validated clone of the doc on client)', function (done) {
      collection.insert({}, (error, id) => {
        if (error) {
          done(error);
          return;
        }
        const doc = collection.findOne(id);
        expect(doc.clientAV).toBe(undefined);
        expect(doc.serverAV).toBe(1);
        done();
      });
    });

    it('runs function once for LocalCollection', function (done) {
      localCollection.insert({}, (error, id) => {
        if (error) {
          done(error);
          return;
        }
        const doc = localCollection.findOne(id);
        expect(doc.clientAV).toBe(1);
        expect(doc.serverAV).toBe(undefined);
        done();
      });
    });

    it('with getAutoValues false, does not run function for LocalCollection', function (done) {
      localCollection.insert({}, { getAutoValues: false }, (error, id) => {
        if (error) {
          done(error);
          return;
        }
        const doc = localCollection.findOne(id);
        expect(doc.clientAV).toBe(undefined);
        expect(doc.serverAV).toBe(undefined);
        done();
      });
    });
  });
}

if (Meteor.isServer) {
  describe('autoValue on server', function () {
    before(() => {
      Collection2.defineValidation(simpleSchemaImpl())
      attach()
    })
    it('runs function once', async function () {
      const id = await callMongoMethod(collection, 'insert', [{}]);
      const doc = await callMongoMethod(collection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function', async function () {
      const id = await callMongoMethod(collection, 'insert', [{}, { getAutoValues: false }]);
      const doc = await callMongoMethod(collection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });

    it('runs function once for LocalCollection', async function () {
      const id = await callMongoMethod(localCollection, 'insert', [{}]);
      const doc = await callMongoMethod(localCollection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function for LocalCollection', async function () {
      const id = await callMongoMethod(localCollection, 'insert', [{}, { getAutoValues: false }]);
      const doc = await callMongoMethod(localCollection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });
  });
}
