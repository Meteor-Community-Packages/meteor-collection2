import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

let collection;

if (Meteor.isClient) {
  collection = new Mongo.Collection('cleanTests', { connection: null });
} else {
  collection = new Mongo.Collection('cleanTests');
}

describe('clean options', function () {
  describe('filter', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          filter: false,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 'name', bad: 'prop' }, (error) => {
        expect(error instanceof Error).toBe(true);
        done();
      });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          filter: true,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 'name', bad: 'prop' }, { filter: false }, (error) => {
        expect(error instanceof Error).toBe(true);
        done();
      });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 'name', bad: 'prop' }, (error) => {
        expect(error).toBe(null);
        done();
      });
    });
  });

  describe('autoConvert', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          autoConvert: false,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 1 }, (error) => {
        expect(error instanceof Error).toBe(true);
        done();
      });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          autoConvert: true,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 1 }, { autoConvert: false }, (error) => {
        expect(error instanceof Error).toBe(true);
        done();
      });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: 1 }, (error) => {
        expect(error).toBe(null);
        done();
      });
    });
  });

  describe('removeEmptyStrings', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
        other: Number
      }, {
        clean: {
          removeEmptyStrings: false,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: '', other: 1 }, (error) => {
        expect(error).toBe(null);
        done();
      });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
        other: Number,
      }, {
        clean: {
          removeEmptyStrings: true,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: '', other: 1 }, { removeEmptyStrings: false }, (error) => {
        expect(error).toBe(null);
        done();
      });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String, other: Number });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: '', other: 1 }, (error) => {
        expect(error instanceof Error).toBe(true);
        done();
      });
    });
  });

  describe('trimStrings', function () {
    it('keeps default schema clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          trimStrings: false,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: ' foo ' }, (error, _id) => {
        expect(error).toBe(null);
        expect(collection.findOne(_id)).toEqual({ _id, name: ' foo ' });
        done();
      });
    });

    it('keeps operation clean options', function (done) {
      const schema = new SimpleSchema({
        name: String,
      }, {
        clean: {
          trimStrings: true,
        },
      });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: ' foo ' }, { trimStrings: false }, (error, _id) => {
        expect(error).toBe(null);
        expect(collection.findOne(_id)).toEqual({ _id, name: ' foo ' });
        done();
      });
    });

    it('has clean option on by default', function (done) {
      const schema = new SimpleSchema({ name: String });

      collection.attachSchema(schema, { replace: true });

      collection.insert({ name: ' foo ' }, (error, _id) => {
        expect(error).toBe(null);
        expect(collection.findOne(_id)).toEqual({ _id, name: 'foo' });
        done();
      });
    });
  });
});
