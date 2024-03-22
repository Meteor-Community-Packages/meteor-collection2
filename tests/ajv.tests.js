/* eslint-env mocha */
import Ajv from 'ajv'
import expect from 'expect'
import { callMongoMethod } from './helper'

describe('using ajv', () => {
  before(() => {
    Collection2.defineValidation({
      name: 'ajv',
      is: schema => schema instanceof Ajv,
      create: schema => {
        const instance = new Ajv()
        instance.definition = schema
        return instance
      },
      extend: (s1, s2) => {
        // not impl
        return s2
      },
      clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
        // not impl
      },
      validate: () => {},
      freeze: false
    });
  })

  it('attach and get simpleSchema for normal collection', function () {
    ;['ajvMc1', null].forEach(name => {
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
  it('handles prototype-less objects', async function () {
    const prototypelessTest = new Mongo.Collection(
      'prototypelessTestAjv',
      Meteor.isClient ? { connection: null } : undefined
    );

    prototypelessTest.attachSchema({
      type: "object",
      properties: { foo: { type: "string" } },
      required: ["foo"],
      additionalProperties: false,
    });

    const prototypelessObject = Object.create(null);
    prototypelessObject.foo = 'bar';

    await callMongoMethod(prototypelessTest, 'insert', [prototypelessObject]);
  });
})