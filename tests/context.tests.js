/* eslint-env mocha */
import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from "meteor/aldeed:simple-schema";
import { Meteor } from 'meteor/meteor';
import { callMongoMethod } from './helper';
import { Collection2 } from 'meteor/aldeed:collection2'
import { simpleSchemaImpl } from './libraries'


const contextCheckSchema = new SimpleSchema({
  foo: {
    type: String,
    optional: true
  },
  context: {
    type: Object,
    optional: true,
    defaultValue: {}
  },
  'context.userId': {
    type: String,
    optional: true,
    autoValue() {
      return this.userId;
    }
  },
  'context.isFromTrustedCode': {
    type: Boolean,
    optional: true,
    autoValue() {
      return this.isFromTrustedCode;
    }
  },
  'context.isInsert': {
    type: Boolean,
    optional: true,
    autoValue() {
      return this.isInsert;
    }
  },
  'context.isUpdate': {
    type: Boolean,
    optional: true,
    autoValue() {
      return this.isUpdate;
    }
  },
  'context.docId': {
    type: String,
    optional: true,
    autoValue() {
      return this.docId;
    }
  }
});

const contextCheck = new Mongo.Collection('contextCheck');


describe('context tests', () => {
  before(() => {
    Collection2.defineValidation(simpleSchemaImpl())
    contextCheck.attachSchema(contextCheckSchema);
  })

  it('AutoValue Context', async function () {
    const testId = await callMongoMethod(contextCheck, 'insert', [{}]);

    let ctx = await callMongoMethod(contextCheck, 'findOne', [testId]);
    expect(ctx.context.isInsert).toBe(true);
    expect(ctx.context.isUpdate).toBe(false);
    expect(ctx.context.userId).toBe(null);
    expect(ctx.context.docId).toBe(undefined);
    expect(ctx.context.isFromTrustedCode).toBe(!Meteor.isClient);

    await callMongoMethod(contextCheck, 'update', [
      {
        _id: testId
      },
      {
        $set: {
          context: {},
          foo: 'bar'
        }
      }
    ]);

    ctx = await callMongoMethod(contextCheck, 'findOne', [testId]);
    expect(ctx.foo).toBe('bar');
    expect(ctx.context.isUpdate).toBe(true);
    expect(ctx.context.isInsert).toBe(false);
    expect(ctx.context.userId).toBe(null);
    expect(ctx.context.docId).toBe(testId);
    expect(ctx.context.isFromTrustedCode).toBe(!Meteor.isClient);

    // make sure docId works with `_id` direct, too
    await callMongoMethod(contextCheck, 'update', [
      testId,
      {
        $set: {
          context: {},
          foo: 'bar'
        }
      }
    ]);

    ctx = await callMongoMethod(contextCheck, 'findOne', [testId]);
    expect(ctx.context.docId).toBe(testId);
  });
});
