/* eslint-env mocha */
import Ajv from 'ajv'
import expect from 'expect'
import { callMongoMethod } from './helper'
import { ajvImpl } from './libraries'

describe('using ajv', () => {
  before(() => {
    Collection2.defineValidation(ajvImpl());
  })

  it('attach and get ajv for normal collection', function () {
    ['ajvMc1', null].forEach(name => {
      const mc = new Mongo.Collection(name, Meteor.isClient ? { connection: null } : undefined);

      mc.attachSchema({
        type: "object",
        properties: { foo: { type: "string" } },
        required: ["foo"],
        additionalProperties: false,
      });

      expect(mc.c2Schema() instanceof Ajv).toBe(true);
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