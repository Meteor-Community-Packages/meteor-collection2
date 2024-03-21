import SimpleSchema from "meteor/aldeed:simple-schema";

Collection2.defineValidation({
  name: 'SimpleSchema',
  is: schema => SimpleSchema.isSimpleSchema(schema),
  create: schema => new SimpleSchema(schema),
  extend: (s1, s2) => {
    if (s2.version >= 2) {
      const ss = new SimpleSchema(s1);
      ss.extend(s2);
      return ss;
    } else {
      return new SimpleSchema([s1, s2]);
    }
  },
  clean: ({ doc, modifier, schema, userId, isLocalCollection, type }) => {
    const isModifier = !Collection2.isInsertType(type);
    const target = isModifier ? modifier : doc;
    schema.clean(target, {
      mutate: true,
      isModifier,
      // We don't do these here because they are done on the client if desired
      filter: false,
      autoConvert: false,
      removeEmptyStrings: false,
      trimStrings: false,
      extendAutoValueContext: {
        isInsert: Collection2.isInsertType(type),
        isUpdate: Collection2.isUpdateType(type),
        isUpsert: Collection2.isUpdateType(type),
        userId,
        isFromTrustedCode: false,
        docId: doc?._id,
        isLocalCollection
      }
    })
  },
  validate: () => {},
  freeze: false
});
