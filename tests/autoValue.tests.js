/* eslint-env mocha */
import 'meteor/aldeed:collection2/static';
import { Meteor } from 'meteor/meteor';
import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { callMongoMethod } from './helper';

const collection = new Mongo.Collection('autoValueTestCollection');
const localCollection = new Mongo.Collection('autoValueTestLocalCollection', {
  connection: null
});



[collection, localCollection].forEach((c) => {
  c.attachSchema(
    new SimpleSchema({
      clientAV: {
        type: SimpleSchema.Integer,
        optional: true,
        async autoValue() {
          await collection.findOneAsync();
          if (Meteor.isServer) return;
          return (this.value || 0) + 1;
        }
      },
      serverAV: {
        type: SimpleSchema.Integer,
        optional: true,
        async autoValue() {
          await collection.findOneAsync();
          if (Meteor.isClient) return;
          return (this.value || 0) + 1;
        }
      }
    })
  );
});

if (Meteor.isClient) {
  describe('autoValue on client', function() {
    it('for client insert, autoValues should be added on the server only (added to only a validated ' +
      'clone of the doc on client)', async function() {
      const id = await collection.insertAsync({});
      const doc = await collection.findOneAsync(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('runs function once for LocalCollection', async function() {
      const id = await localCollection.insertAsync({});
      const doc = await localCollection.findOneAsync(id);
      expect(doc.clientAV).toBe(1);
      expect(doc.serverAV).toBe(undefined);
    });

    it('with getAutoValues false, does not run function for LocalCollection', async function() {
      const id = await localCollection.insertAsync({},{ getAutoValues: false });
      const doc = await localCollection.findOneAsync(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });
  });
}

if (Meteor.isServer) {
  describe('autoValue on server', function() {
    it('runs function once', async function() {
      const id = await callMongoMethod(collection, 'insert', [{}]);
      const doc = await callMongoMethod(collection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function', async function() {
      const id = await callMongoMethod(collection, 'insert', [{}, { getAutoValues: false }]);
      const doc = await callMongoMethod(collection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });

    it('runs function once for LocalCollection', async function() {
      const id = await callMongoMethod(localCollection, 'insert', [{}]);
      const doc = await callMongoMethod(localCollection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function for LocalCollection', async function() {
      const id = await callMongoMethod(localCollection, 'insert', [{}, { getAutoValues: false }]);
      const doc = await callMongoMethod(localCollection, 'findOne', [id]);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });
  });
}
