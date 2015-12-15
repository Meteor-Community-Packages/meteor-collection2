// Extend the schema options allowed by SimpleSchema
SimpleSchema.extendOptions({
  denyInsert: Match.Optional(Boolean),
  denyUpdate: Match.Optional(Boolean),
});

// Define validation error messages
SimpleSchema.messages({
  insertNotAllowed: "[label] cannot be set during an insert",
  updateNotAllowed: "[label] cannot be set during an update"
});

Collection2.on('schema.attached', function (collection, ss) {
  ss.validator(function() {
    var def = this.definition;
    var val = this.value;
    var op = this.operator;

    if (def.denyInsert && val !== void 0 && !op) {
      // This is an insert of a defined value into a field where denyInsert=true
      return "insertNotAllowed";
    }

    if (def.denyUpdate && op) {
      // This is an insert of a defined value into a field where denyUpdate=true
      if (op !== "$set" || (op === "$set" && val !== void 0)) {
        return "updateNotAllowed";
      }
    }

    return true;
  });
});
