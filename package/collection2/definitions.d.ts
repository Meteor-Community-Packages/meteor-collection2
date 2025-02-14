import type { Mongo } from 'meteor/mongo'
import SimpleSchema from 'meteor/aldeed:simple-schema'

declare module 'meteor/aldeed:collection2' {
  namespace collection2 {
    var load: () => void
  }
}

interface Collection2Options {
  transform?: boolean
  replace?: boolean
  selector?: typeof SimpleSchema | object
}

declare module 'meteor/mongo' {
  namespace Mongo {
    var Collection: Collection2Collection
    interface Collection2Collection extends Mongo.CollectionStatic {
      attachSchema: (schema: typeof SimpleSchema | object, options?: Collection2Options) => void
    }
  }
}
