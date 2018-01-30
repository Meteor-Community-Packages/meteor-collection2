import expect from 'expect';
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const defaultValuesSchema = new SimpleSchema({
  bool1: {
    type: Boolean,
    defaultValue: false
  }
});

const defaultValues = new Mongo.Collection('dv');
defaultValues.attachSchema(defaultValuesSchema);

export default function addDefaultValuesTests() {
  it('defaultValues', function (done) {
    let p;

    // Base case
    defaultValues.insert({}, (error, testId1) => {
      p = defaultValues.findOne(testId1);
      expect(p.bool1).toBe(false);

      // Ensure that default values do not mess with inserts and updates of the field
      defaultValues.insert({
        bool1: true
      }, (err, testId2) => {
        p = defaultValues.findOne(testId2);
        expect(p.bool1).toBe(true);

        defaultValues.update(testId1, {
          $set: {
            bool1: true
          }
        }, () => {
          p = defaultValues.findOne(testId1);
          expect(p.bool1).toBe(true);
          done();
        });
      });
    });
  });
};
