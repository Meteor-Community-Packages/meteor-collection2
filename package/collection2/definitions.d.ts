import { Mongo } from 'meteor/mongo'
import SimpleSchema from 'meteor/aldeed:simple-schema'

declare module 'meteor/aldeed:collection2' {
  interface AutoValueContext {
    key: string
    value: unknown
    isSet: boolean
    isModifier: boolean
    operator: string | null
    isInsert: boolean
    isUpdate: boolean
    isUpsert: boolean
    userId: string | null
    isFromTrustedCode: boolean
    docId?: string
    isLocalCollection: boolean
    field(name: string): { isSet: boolean; operator: string | null; value: unknown }
    siblingField(name: string): { isSet: boolean; operator: string | null; value: unknown }
    parentField(): { isSet: boolean; operator: string | null; value: unknown }
    unset(): void
  }

  type AutoValueResult<T> = T | { [operator: `$${string}`]: T } | undefined

  export function autoValue<T extends object>(
    schema: T,
    fn: (
      this: AutoValueContext,
      document: Record<string, unknown>
    ) => AutoValueResult<unknown> | Promise<AutoValueResult<unknown>>
  ): T

  export const Collection2: {
    load(): Promise<void>
    autoValue<T extends object>(
      schema: T,
      fn: (
        this: AutoValueContext,
        document: Record<string, unknown>
      ) => AutoValueResult<unknown> | Promise<AutoValueResult<unknown>>
    ): T
  }

  export default Collection2
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
      c2Schema(doc?: object, options?: object, query?: object): SimpleSchema | object | null
      simpleSchema(doc?: object, options?: object, query?: object): SimpleSchema | object | null
    }
  }
}
