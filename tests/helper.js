import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

let strategy = null
if (Mongo.Collection.prototype.insertAsync && Meteor.isFibersDisabled) {
  strategy = 3
} else if (Mongo.Collection.prototype.insertAsync) {
  strategy = 2
} else {
  strategy = 1
}

function getMethodNameByMeteorVersion (methodName) {
  if (strategy === 1) {
    return methodName
  }

  return `${methodName}Async`
}

export function callMongoMethod (collection, method, args) {
  const methodName = getMethodNameByMeteorVersion(method)

  return new Promise((resolve, reject) => {
    if (strategy <= 2) {
      if (Meteor.isClient && !['findOne', 'findOneAsync'].includes(methodName)) {
        collection[methodName](...args, (error, result) => {
          if (error) {
            reject(error)
          } else {
            resolve(result)
          }
        })
      } else {
        try {
          resolve(collection[methodName](...args))
        } catch (error) {
          reject(error)
        }
      }
    } else {
      collection[methodName](...args)
        .then(resolve)
        .catch(reject)
    }
  })
}

export function callMeteorFetch (collection, selector) {
  return new Promise((resolve, reject) => {
    if (strategy === 1) {
      resolve(collection.find(selector).fetch())
    } else {
      resolve(collection.find(selector).fetchAsync())
    }
  })
}
