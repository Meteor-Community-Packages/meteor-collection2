Tinytest.addAsync('Collection2 - Reset', function (test, next) {
  Meteor.call("removeAll", next);
});

var mc = new Mongo.Collection('mc');
Tinytest.add('Collection2 - Mongo.Collection - simpleSchema', function (test) {
  delete mc._c2;
  delete mc._collection._c2;

  mc.attachSchema(new SimpleSchema({
    foo: {type: String}
  }));

  test.instanceOf(mc.simpleSchema(), SimpleSchema);

  // It should work on the LocalCollection instance, too
  if (Meteor.isClient) {
    test.instanceOf(mc._collection, LocalCollection);
    test.instanceOf(mc._collection.simpleSchema(), SimpleSchema);
  }
});

Tinytest.add('Collection2 - LocalCollection - simpleSchema', function (test) {
  var lc = new Mongo.Collection(null);

  lc.attachSchema(new SimpleSchema({
    foo: {type: String}
  }));

  test.instanceOf(lc.simpleSchema(), SimpleSchema);

  // It should work on the LocalCollection instance, too
  test.instanceOf(lc._collection, LocalCollection);
  test.instanceOf(lc._collection.simpleSchema(), SimpleSchema);
});

// Attach more than one schema
var c = new Mongo.Collection("multiSchema");
Tinytest.add('Collection2 - Attach Multiple Schemas', function (test) {
  delete c._c2;
  delete c._collection._c2;

  // Attach two different schemas
  c.attachSchema(partOne);
  c.attachSchema(partTwo);

  // Check the combined schema
  var combinedSchema = c.simpleSchema();
  test.isTrue(_.contains(combinedSchema._schemaKeys, 'one'));
  test.isTrue(_.contains(combinedSchema._schemaKeys, 'two'));
  test.equal(combinedSchema.schema('two').type, String);

  // Attach a third schema and make sure that it extends/overwrites the others
  c.attachSchema(partThree);
  combinedSchema = c.simpleSchema();
  test.isTrue(_.contains(combinedSchema._schemaKeys, 'one'));
  test.isTrue(_.contains(combinedSchema._schemaKeys, 'two'));
  test.equal(combinedSchema.schema('two').type, Number);

  // Ensure that we've only attached two deny functions
  test.length(c._validators.insert.deny, 2);
  test.length(c._validators.update.deny, 2);
});

// Test required field "copies"
Tinytest.addAsync('Collection2 - Insert Required', function (test, next) {
  var maybeNext = _.after(2, next);

  var id = books.insert({
    title: "Ulysses",
    author: "James Joyce"
  }, function (error, result) {
    //The insert will fail, error will be set,
    test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
    //and result will be false because "copies" is required.
    test.isFalse(result, 'result should be false because "copies" is required');
    //The list of errors is available by calling books.simpleSchema().namedContext().invalidKeys()
    var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
    test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

    var key = invalidKeys[0] || {};

    test.equal(key.name, 'copies', 'We expected the key "copies"');
    test.equal(key.type, 'required', 'We expected the type to be required');
    maybeNext();
  });

  test.equal(typeof id, 'string', 'We expected an ID to be returned');
  maybeNext();
});

if (Meteor.isServer) {
  //no validation when calling underlying _collection on the server
  Tinytest.addAsync("Collection2 - _collection on the server", function (test, next) {
    books._collection.insert({
      title: "Ulysses",
      author: "James Joyce",
      copies: 1,
      updatedAt: new Date()
    }, function (error) {
      test.isFalse(!!error, 'We expected the insert not to trigger an error since we are on the server');
      next();
    });
  });
}

Tinytest.addAsync("Collection2 - AutoValue Context", function (test, next) {
  contextCheck.insert({}, function (error, testId) {
    test.isFalse(!!error, 'insert failed: ' + (error && error.message));
    var ctx = contextCheck.findOne({
      _id: testId
    });
    test.isTrue(ctx.context.isInsert, 'expected isInsert to be true');
    test.isFalse(ctx.context.isUpdate, 'expected isUpdate to be false');
    test.isNull(ctx.context.userId, 'expected userId to be null');
    test.isUndefined(ctx.context.docId, 'expected docId to be undefined');
    if (Meteor.isClient) {
      test.isFalse(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be false');
    } else {
      test.isTrue(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be true');
    }

    contextCheck.update({
      _id: testId
    }, {
      $set: {
        foo: "bar"
      }
    }, function () {
      ctx = contextCheck.findOne({
        _id: testId
      });
      test.equal(ctx.foo, 'bar', "update failed");
      test.isTrue(ctx.context.isUpdate, 'expected isUpdate to be true');
      test.isFalse(ctx.context.isInsert, 'expected isInsert to be false');
      test.isNull(ctx.context.userId, 'expected userId to be null');
      test.equal(ctx.context.docId, testId, 'expected docId to be ' + testId);
      if (Meteor.isClient) {
        test.isFalse(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be false');
      } else {
        test.isTrue(ctx.context.isFromTrustedCode, 'expected isFromTrustedCode to be true');
      }

      // make sure docId works with `_id` direct, too
      contextCheck.update(testId, {
        $set: {
          foo: "bar"
        }
      }, function () {
        ctx = contextCheck.findOne({
          _id: testId
        });
        test.equal(ctx.context.docId, testId, 'expected docId to be ' + testId);
        next();
      });
    });
  });
});

Tinytest.addAsync("Collection2 - DefaultValue Update", function (test, next) {
  // Base case
  defaultValues.insert({}, function (err, testId) {
    var p = defaultValues.findOne({
      _id: testId
    });
    test.equal(p.bool1, false);

    // Ensure that default values do not mess with inserts and updates of the field
    defaultValues.insert({
      bool1: true
    }, function (err, testId) {
      var p = defaultValues.findOne({
        _id: testId
      });
      test.equal(p.bool1, true);
      defaultValues.update({
        _id: testId
      }, {
        $set: {
          bool1: true
        }
      }, function () {
        p = defaultValues.findOne({
          _id: testId
        });
        test.equal(p.bool1, true);
        next();
      });
    });
  });
});

if (Meteor.isServer) {
  Tinytest.addAsync('Collection2 - Upsert - Valid', function (test, next) {
    books.remove({});

    books.upsert({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        title: "Ulysses",
        author: "James Joyce",
        copies: 1
      }
    }, function (error, result) {

      test.isFalse(!!error, 'We expected the upsert not to trigger an error since the doc is valid for an insert');
      test.equal(result.numberAffected, 1, 'Upsert should update one record');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert as update should update entity by _id - Valid', function (test, next) {
    books.remove({});

    var id = books.insert({title: 'new', author: 'author new', copies: 2});

    books.upsert({
      _id: id
    }, {
      $set: {
        title: "Ulysses",
        author: "James Joyce",
        copies: 1
      }
    }, function (error, result) {

      test.isFalse(!!error, 'We expected the upsert not to trigger an error since the doc is valid for an insert');
      test.equal(result.numberAffected, 1, 'Upsert should update one record');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert as Update - Valid', function (test, next) {
    books.remove({});

    books.update({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        title: "Ulysses",
        author: "James Joyce",
        copies: 1
      }
    }, {
      upsert: true
    }, function (error, result) {

      test.isFalse(!!error, 'We expected the upsert not to trigger an error since the doc is valid for an insert');
      test.equal(result, 1, 'Upsert should update one record');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert - Invalid', function (test, next) {
    books.remove({});

    books.upsert({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        copies: -1
      }
    }, function (error, result) {

      //upserts are server only when this package is used
      test.isTrue(!!error, 'We expected the upsert to trigger an error since the doc is invalid for an insert');
      test.isFalse(result, 'Upsert should update no records');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert as Update - Invalid', function (test, next) {
    books.remove({});

    books.update({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        copies: -1
      }
    }, {
      upsert: true
    }, function (error, result) {

      test.isTrue(!!error, 'We expected the upsert to trigger an error since the doc is invalid for an insert');
      test.isFalse(result, 'Upsert should update no records');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 1, 'We should get one invalidKey back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert - Valid with Selector', function (test, next) {
    books.remove({});

    books.upsert({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        copies: 1
      }
    }, function (error, result) {
      test.isFalse(!!error,
        'We expected the upsert to trigger an error since the doc is valid for an insert with selector');
      test.equal(result.numberAffected, 1, 'Upsert should update one record');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      next();
    });
  });

  Tinytest.addAsync('Collection2 - Upsert as Update - Valid with Selector', function (test, next) {
    books.remove({});

    books.update({
      title: "Ulysses",
      author: "James Joyce"
    }, {
      $set: {
        copies: 1
      }
    }, {
      upsert: true
    }, function (error, result) {
      test.isFalse(!!error,
        'We expected the upsert to trigger an error since the doc is valid for an insert with selector');
      test.equal(result, 1, 'Upsert should update one record');

      var invalidKeys = books.simpleSchema().namedContext().invalidKeys();
      test.equal(invalidKeys.length, 0, 'We should get no invalidKeys back');

      next();
    });
  });

  // https://github.com/aldeed/meteor-collection2/issues/243
  var upsertAutoValueTest = new Mongo.Collection("upsertAutoValueTest");
  Tinytest.addAsync('Collection2 - Upsert - Runs autoValue only once', function (test, next) {
    var times = 0;

    delete upsertAutoValueTest._c2;
    delete upsertAutoValueTest._collection._c2;
    upsertAutoValueTest.attachSchema(new SimpleSchema({
      foo: {
        type: String
      },
      av: {
        type: String,
        autoValue: function () {
          times++;
          return "test";
        }
      }
    }));

    upsertAutoValueTest.remove({});

    upsertAutoValueTest.upsert({
      foo: 'bar'
    }, {
      $set: {
        av: 'abc'
      }
    }, function (error, result) {
      test.equal(times, 1, 'AutoValue functions should run only once for an upsert');
      next();
    });
  });
}

// Ensure that there are no errors when using a schemaless collection
Tinytest.addAsync("Collection2 - No Schema", function (test, next) {
  noSchemaCollection.insert({
    a: 1,
    b: 2
  }, function (error, newId) {
    test.isFalse(!!error, 'There should be no error since there is no schema');
    test.isTrue(!!newId, 'result should be the inserted ID');

    var doc = noSchemaCollection.findOne({
      _id: newId
    });
    test.instanceOf(doc, Object);
    test.equal(doc.userFoo, "userBar", "User-supplied transforms are lost");

    noSchemaCollection.update({
      _id: newId
    }, {
      $set: {
        a: 3,
        b: 4
      }
    }, function (error) {
      test.isFalse(!!error, 'There should be no error since there is no schema');
      //result is undefined for some reason, but it's happening for apps without
      //C2 as well, so must be a Meteor bug
      //test.isTrue(typeof result === "number", 'result should be the number of records updated');
      next();
    });
  });
});

// By default, empty strings are removed, but we can override
Tinytest.addAsync("Collection2 - removeEmptyStrings", function (test, next) {
  // Remove empty strings (default)
  RES.insert({
    foo: "foo",
    bar: ""
  }, function (error, newId1) {
    test.isFalse(!!error, 'There should be no error');
    test.isTrue(!!newId1, 'result should be the inserted ID');

    var doc = RES.findOne({
      _id: newId1
    });
    test.instanceOf(doc, Object);
    test.isUndefined(doc.bar);

    // Don't remove empty strings
    RES.insert({
      foo: "foo",
      bar: ""
    }, {
      removeEmptyStrings: false
    }, function (error, newId2) {
      test.isFalse(!!error, 'There should be no error');
      test.isTrue(!!newId2, 'result should be the inserted ID');

      var doc = RES.findOne({
        _id: newId2
      });
      test.instanceOf(doc, Object);
      test.equal(doc.bar, "");

      // Don't remove empty strings for an update either
      RES.update({
        _id: newId1
      }, {
        $set: {
          bar: ""
        }
      }, {
        removeEmptyStrings: false
      }, function (error, result) {
        test.isFalse(!!error, 'There should be no error');
        test.equal(result, 1, 'should have updated 1 record');

        var doc = RES.findOne({
          _id: newId1
        });
        test.instanceOf(doc, Object);
        test.equal(doc.bar, "");
        next();
      });
    });
  });
});

Tinytest.addAsync('Collection2 - Validate False', function (test, next) {
  var title;
  if (Meteor.isClient) {
    title = "Validate False Client";
  } else {
    title = "Validate False Server";
  }

  books.insert({
    title: title,
    author: "James Joyce"
  }, {
    validate: false,
    validationContext: "validateFalse"
  }, function (error, result) {
    var insertedBook;
    var invalidKeys = books.simpleSchema().namedContext("validateFalse").invalidKeys();

    if (Meteor.isClient) {
      // When validate: false on the client, we should still get a validation error and invalidKeys back from the server
      test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
      // There should be an `invalidKeys` property on the error, too
      test.equal(error.invalidKeys.length, 1, 'There should be 1 invalidKey on the Error object');
      test.isFalse(!!result, 'result should be falsy because "copies" is required');
      test.equal(invalidKeys.length, 1,
        'There should be 1 invalidKey since validation happened on the server and errors were sent back');

      insertedBook = books.findOne({
        title: title
      });
      test.isFalse(!!insertedBook, 'Book should not have been inserted because validation failed on server');
    } else {
      // When validate: false on the server, validation should be skipped
      test.isFalse(!!error, 'We expected no error because we skipped validation');
      test.isTrue(!!result, 'result should be set because we skipped validation');
      test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

      insertedBook = books.findOne({
        title: title
      });
      test.isTrue(!!insertedBook, 'Book should have been inserted because we skipped validation on server');
    }

    // do a good one to set up update test
    books.insert({
      title: title + " 2",
      author: "James Joyce",
      copies: 1
    }, {
      validate: false,
      validationContext: "validateFalse2"
    }, function (error, newId) {
      var invalidKeys = books.simpleSchema().namedContext("validateFalse2").invalidKeys();

      test.isFalse(!!error, "We expected no error because it's valid");
      test.isTrue(!!newId, "result should be set because it's valid");
      test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

      var insertedBook = books.findOne({
        title: title + " 2"
      });
      test.isTrue(!!insertedBook, 'Book should have been inserted because it was valid');

      books.update({
        _id: newId
      }, {
        $set: {
          copies: "Yes Please"
        }
      }, {
        validate: false,
        validationContext: "validateFalse3"
      }, function (error, result) {
        var updatedBook;
        var invalidKeys = books.simpleSchema().namedContext("validateFalse3").invalidKeys();

        if (Meteor.isClient) {
          // When validate: false on the client, we should still get a validation error and invalidKeys from the server
          test.isTrue(!!error, 'We expected the insert to trigger an error since field "copies" are required');
          // There should be an `invalidKeys` property on the error, too
          test.equal(error.invalidKeys.length, 1, 'There should be 1 invalidKey on the Error object');
          test.isFalse(!!result, 'result should be falsy because "copies" is required');
          test.equal(invalidKeys.length, 1,
            'There should be 1 invalidKey since validation happened on the server and invalidKeys were sent back');

          updatedBook = books.findOne({
            _id: newId
          });
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, 1,
            'copies should still be 1 because our new value failed validation on the server');
        } else {
          // When validate: false on the server, validation should be skipped
          test.isFalse(!!error, 'We expected no error because we skipped validation');
          test.isTrue(!!result, 'result should be set because we skipped validation');
          test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

          updatedBook = books.findOne({
            _id: newId
          });
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, "Yes Please",
            'copies should be changed despite being invalid because we skipped validation on the server');
        }

        // now try a good one
        books.update({
          _id: newId
        }, {
          $set: {
            copies: 3
          }
        }, {
          validate: false,
          validationContext: "validateFalse4"
        }, function (error, result) {
          var invalidKeys = books.simpleSchema().namedContext("validateFalse4").invalidKeys();
          test.isFalse(!!error, "We expected no error because it's valid");
          test.equal(result, 1, "result should be set because it's valid");
          test.equal(invalidKeys.length, 0, 'There should be no invalidKeys');

          var updatedBook = books.findOne({
            _id: newId
          });
          test.isTrue(!!updatedBook, 'Book should still be there');
          test.equal(updatedBook.copies, 3, 'copies should be changed because we used a valid value');

          next();
        });
      });
    });
  });
});

// Test denyAll
if (Meteor.isClient) {
  Tinytest.addAsync('Collection2 - Insert Deny Failure', function (test, next) {
    Meteor.call("denyAll", function () {
      books.insert({
        title: "Ulysses",
        author: "James Joyce",
        copies: 1
      }, function (error, result) {
        test.isTrue(!!error, 'We expected this to fail since access has to be set explicitly');

        test.isFalse(result, 'result should be false');

        test.equal((error || {}).error, 403, 'We should get Access denied');

        // Clear denyAll settings so that tests work correctly if client
        // page is reloaded
        Meteor.call("allowAll", function () {
          next();
        });
      });
    });
  });
}

// bypassCollection2
if (Meteor.isServer) {
  Tinytest.add('Collection2 - bypassCollection2', function (test) {
    var id;
    
    try {
      id = books.insert({}, {bypassCollection2: true})
      test.ok();
    } catch (error) {
      test.fail(error.message);
    }
    
    try {
      books.update(id, {$set: {copies: 2}}, {bypassCollection2: true})
      test.ok();
    } catch (error) {
      test.fail(error.message);
    }
  });
}

if (Meteor.isServer) {
  var upsertTest = new Mongo.Collection('upsertTest');
  upsertTest.attachSchema(new SimpleSchema({
    _id: {type: String},
    foo: {type: Number, decimal: true}
  }));
  var upsertTestId = upsertTest.insert({foo: 1});

  Tinytest.add('Collection2 - upsert with schema that allows _id', function (test) {
    var num = Math.random();
    upsertTest.update({_id: upsertTestId}, {
      $set: {
        foo: num
      }
    }, {
      upsert: true
    });
    var doc = upsertTest.findOne(upsertTestId);
    test.equal(doc.foo, num);
  });

  Tinytest.add('Collection2 - everything filtered out', function (test) {
    test.throws(function () {
      upsertTest.update({_id: upsertTestId}, {
        $set: {
          boo: 1
        }
      });
    }, 'After filtering out keys not in the schema, your modifier is now empty');
  });
}
