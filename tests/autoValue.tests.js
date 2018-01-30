import { Meteor } from 'meteor/meteor';
import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const collection = new Mongo.Collection('autoValueTestCollection');
const localCollection = new Mongo.Collection('autoValueTestLocalCollection', { connection: null });

[collection, localCollection].forEach((c) => {
  c.attachSchema(new SimpleSchema({
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
        if (Meteor.isClient) return;
        return (this.value || 0) + 1;
      }
    }
  }));
});

if (Meteor.isClient) {
  describe('autoValue on client', function () {
    it('for client insert, autoValues should be added on the server only (added to only a validated clone of the doc on client)', function (done) {
      collection.insert({}, (error, id) => {
        const doc = collection.findOne(id);
        expect(doc.clientAV).toBe(undefined);
        expect(doc.serverAV).toBe(1);
        done();
      });
    });

    it('runs function once for LocalCollection', function (done) {
      localCollection.insert({}, (error, id) => {
        const doc = localCollection.findOne(id);
        expect(doc.clientAV).toBe(1);
        expect(doc.serverAV).toBe(undefined);
        done();
      });
    });

    it('with getAutoValues false, does not run function for LocalCollection', function (done) {
      localCollection.insert({}, { getAutoValues: false }, (error, id) => {
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
    it('runs function once', function () {
      const id = collection.insert({});
      const doc = collection.findOne(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function', function () {
      const id = collection.insert({}, { getAutoValues: false });
      const doc = collection.findOne(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });

    it('runs function once for LocalCollection', function () {
      const id = localCollection.insert({});
      const doc = localCollection.findOne(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(1);
    });

    it('with getAutoValues false, does not run function for LocalCollection', function () {
      const id = localCollection.insert({}, { getAutoValues: false });
      const doc = localCollection.findOne(id);
      expect(doc.clientAV).toBe(undefined);
      expect(doc.serverAV).toBe(undefined);
    });
  });
}
