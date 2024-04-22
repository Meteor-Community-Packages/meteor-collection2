import Ajv from 'ajv'
import SimpleSchema from 'meteor/aldeed:simple-schema'
import { Collection2 } from 'meteor/aldeed:collection2'
export const ajvImpl = () => ({
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
})

export const simpleSchemaImpl = () => ({
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
  validate: ({}) => {

  },
  getErrors: () => {

  },
  freeze: false
})