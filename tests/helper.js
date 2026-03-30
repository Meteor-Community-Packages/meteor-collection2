import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

let ASYNC_FRIENDLY = false;

if (Mongo.Collection.prototype.insertAsync) {
  ASYNC_FRIENDLY = true;
}

const getMethodNameByMeteorVersion = (methodName) =>
  ASYNC_FRIENDLY ? `${methodName}Async` : methodName;

export function callMongoMethod(collection, method, args) {
  const methodName = getMethodNameByMeteorVersion(method);

  return new Promise((resolve, reject) => {
    if (ASYNC_FRIENDLY) {
      try {
        //console.log(`calling method ${methodName} with args ${JSON.stringify(args)}`);
        resolve(collection[methodName](...args));
      } catch (error) {
        reject(error);
      }
    } else {
      collection[methodName](...args)
        .then(resolve)
        .catch(reject);
    }
  });
}

export function callMeteorFetch(collection, selector) {
  return new Promise((resolve, reject) => {
    if (ASYNC_FRIENDLY) {
      resolve(collection.find(selector).fetchAsync());
    } else {
      resolve(collection.find(selector).fetch());
    }
  });
}
