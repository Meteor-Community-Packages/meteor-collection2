/* eslint-env mocha */
import Ajv from 'ajv'
import expect from 'expect'
import { callMongoMethod } from './helper'

describe('using ajv', () => {
  it('attach and get ajv for normal collection', function () {
    ['ajvMc1', null].forEach(name => {
      const mc = new Mongo.Collection(name, Meteor.isClient ? { connection: null } : undefined);
  
      mc.attachSchema({
        type: "object",
        properties: { foo: { type: "string" } },
        required: ["foo"],
        additionalProperties: false,
      });

      // Check if the schema was correctly detected as an AJV schema
      expect(mc.c2Schema()).toBeDefined();
      expect(mc.c2Schema().type).toBe("object");
      expect(mc.c2Schema().properties.foo.type).toBe("string");
    });
  });

  // it('handles prototype-less objects', async function () {
  //   const prototypelessTest = new Mongo.Collection(
  //     'prototypelessTestAjv',
  //     Meteor.isClient ? { connection: null } : undefined
  //   );

  //   prototypelessTest.attachSchema({
  //     type: "object",
  //     properties: { foo: { type: "string" } },
  //     required: ["foo"],
  //     additionalProperties: false,
  //   });

  //   const prototypelessObject = Object.create(null);
  //   prototypelessObject.foo = 'bar';

  //   await callMongoMethod(prototypelessTest, 'insert', [prototypelessObject]);
  // });
})