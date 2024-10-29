import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from "meteor/aldeed:simple-schema";
import { Meteor } from 'meteor/meteor';
import { callMongoMethod } from './helper';

/* global it */

const defaultValuesSchema = new SimpleSchema({
  bool1: {
    type: Boolean,
    defaultValue: false
  }
});

const defaultValues = new Mongo.Collection('dv');
defaultValues.attachSchema(defaultValuesSchema);
global.defaultValues = defaultValues;

export default function addDefaultValuesTests() {
  if (Meteor.isServer) {
    it('defaultValues', function (done) {
      let p;

      // Base case
      callMongoMethod(defaultValues, 'insert', [{}])
        .then(async (testId1) => {
          p = await callMongoMethod(defaultValues, 'findOne', [testId1]);
          expect(p.bool1).toBe(false);

          // Ensure that default values do not mess with inserts and updates of the field
          callMongoMethod(defaultValues, 'insert', [
            {
              bool1: true
            }
          ])
            .then(async (testId2) => {
              p = await callMongoMethod(defaultValues, 'findOne', [testId2]);
              expect(p.bool1).toBe(true);

              callMongoMethod(defaultValues, 'update', [
                testId1,
                {
                  $set: {
                    bool1: true
                  }
                }
              ])
                .then(async () => {
                  p = await callMongoMethod(defaultValues, 'findOne', [testId1]);
                  expect(p.bool1).toBe(true);
                  done();
                })
                .catch(done);
            })
            .catch(done);
        })
        .catch(done);
    });
  } else {
    it('defaultValues', async function () {
      // Base case
      const testId1 = await callMongoMethod(defaultValues, 'insert', [{}]);
      let p = await callMongoMethod(defaultValues, 'findOne', [testId1]);
      expect(p.bool1).toBe(false);

      // Ensure that default values do not mess with inserts and updates of the field
      const testId2 = await callMongoMethod(defaultValues, 'insert', [{ bool1: true }]);
      p = await callMongoMethod(defaultValues, 'findOne', [testId2]);
      expect(p.bool1).toBe(true);

      await callMongoMethod(defaultValues, 'update', [
        testId1,
        {
          $set: {
            bool1: true
          }
        }
      ]);
      p = await callMongoMethod(defaultValues, 'findOne', [testId1]);
      expect(p.bool1).toBe(true);
    });
  }
}
