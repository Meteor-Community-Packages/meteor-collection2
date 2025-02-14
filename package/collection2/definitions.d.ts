import { Mongo } from 'meteor/mongo'
import SimpleSchema from 'meteor/aldeed:simple-schema'

declare module 'meteor/aldeed:collection2' {
  namespace collection2 {
    var load: () => void
  }
}

interface Collection2Options {
  transform?: boolean
  replace?: boolean
  selector?: SimpleSchema | object
}

declare module 'meteor/mongo' {
  export namespace Mongo {
    interface Collection<T> {
      attachSchema(schema: SimpleSchema | object, options?: Collection2Options): void
    }
  }
}
