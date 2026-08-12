import 'meteor/aldeed:collection2/static';
import { Mongo } from 'meteor/mongo';
import expect from 'expect';
import SimpleSchema from 'meteor/aldeed:simple-schema';

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('SimpleSchema 3 async validation', function () {
  it('awaits async autoValues before writing', async function () {
    const gate = deferred();
    let calls = 0;
    const collection = new Mongo.Collection(null);
    collection.attachSchema(
      new SimpleSchema({
        name: String,
        generated: {
          type: String,
          async autoValue() {
            calls++;
            await gate.promise;
            return 'ready';
          }
        }
      })
    );

    const insert = collection.insertAsync({ name: 'test' });
    await Promise.resolve();
    expect(await collection.find().countAsync()).toBe(0);

    gate.resolve();
    const id = await insert;
    expect((await collection.findOneAsync(id)).generated).toBe('ready');
    expect(calls).toBe(1);
  });

  it('awaits async field validators and rejects invalid writes', async function () {
    const gate = deferred();
    const collection = new Mongo.Collection(null);
    collection.attachSchema(
      new SimpleSchema({
        name: {
          type: String,
          async custom() {
            await gate.promise;
            return this.value === 'valid' ? undefined : 'notAllowed';
          }
        }
      })
    );

    const insert = collection.insertAsync({ name: 'invalid' });
    await Promise.resolve();
    expect(await collection.find().countAsync()).toBe(0);

    gate.resolve();
    await expect(insert).rejects.toMatchObject({ name: 'ValidationError' });
    expect(await collection.find().countAsync()).toBe(0);
  });

  it('awaits async whole-document validators', async function () {
    const gate = deferred();
    const collection = new Mongo.Collection(null);
    const schema = new SimpleSchema({ name: String });
    schema.addDocValidator(async function (doc) {
      await gate.promise;
      return doc.name === 'valid'
        ? []
        : [{ name: 'name', type: 'notAllowed', value: doc.name }];
    });
    collection.attachSchema(schema);

    const insert = collection.insertAsync({ name: 'invalid' });
    await Promise.resolve();
    expect(await collection.find().countAsync()).toBe(0);

    gate.resolve();
    await expect(insert).rejects.toMatchObject({ name: 'ValidationError' });
    expect(await collection.find().countAsync()).toBe(0);
  });

  it('requires async mutation methods for SimpleSchema 3', function () {
    const collection = new Mongo.Collection(null);
    collection.attachSchema(new SimpleSchema({ name: String }));

    expect(() => collection.insert({ name: 'test' })).toThrow(/async mutation methods/);
  });
});
