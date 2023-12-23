import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';
import { Meteor } from 'meteor/meteor';
import { callMongoMethod } from './helper';

/* global describe it */

let collection;

if (Meteor.isClient) {
  collection = new Mongo.Collection('cleanTests', { connection: null });
} else {
  collection = new Mongo.Collection('cleanTests');
}

describe('clean options', function () {
  describe('filter', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            filter: false
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: 'name', bad: 'prop' }])
        .then(() => {
          done(new Error('Should not have inserted'));
        })
        .catch(() => {
          done();
        });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            filter: true
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [
        { name: 'name', bad: 'prop' },
        { filter: false }
      ])
        .then(() => {
          done(new Error('Should not have inserted'));
        })
        .catch(() => {
          done();
        });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: 'name', bad: 'prop' }])
        .then(() => {
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  describe('autoConvert', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            autoConvert: false
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: 1 }])
        .then(() => {
          done(new Error('Should not have inserted'));
        })
        .catch(() => {
          done();
        });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            autoConvert: true
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [
        { name: 1 },
        { autoConvert: false }
      ])
        .then(() => {
          done(new Error('Should not have inserted'));
        })
        .catch(() => {
          done();
        });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: 1 }])
        .then(() => {
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  describe('removeEmptyStrings', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String,
          other: Number
        },
        {
          clean: {
            removeEmptyStrings: false
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: '', other: 1 }])
        .then(() => {
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String,
          other: Number
        },
        {
          clean: {
            removeEmptyStrings: true
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [
        { name: '', other: 1 },
        { removeEmptyStrings: false }
      ])
        .then(() => {
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String, other: Number });

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: '', other: 1 }])
        .then(() => {
          done(new Error('Should not have inserted'));
        })
        .catch(() => {
          done();
        });
    });
  });

  describe('trimStrings', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            trimStrings: false
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: ' foo ' }])
        .then(async (_id) => {
          const data = await callMongoMethod(collection, 'findOne', [_id]);
          expect(data).toEqual({ _id, name: ' foo ' });
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema(
        {
          name: String
        },
        {
          clean: {
            trimStrings: true
          }
        }
      );

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [
        { name: ' foo ' },
        { trimStrings: false }
      ])
        .then(async (_id) => {
          const data = await callMongoMethod(collection, 'findOne', [_id]);
          expect(data).toEqual({ _id, name: ' foo ' });
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      callMongoMethod(collection, 'insert', [{ name: ' foo ' }])
        .then(async (_id) => {
          const data = await callMongoMethod(collection, 'findOne', [_id]);
          expect(data).toEqual({ _id, name: 'foo' });
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });
});
