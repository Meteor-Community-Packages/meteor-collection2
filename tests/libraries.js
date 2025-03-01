import Ajv from 'ajv'
import SimpleSchema from 'meteor/aldeed:simple-schema'
import { Collection2 } from 'meteor/aldeed:collection2'
import { z } from 'zod'

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

export const zodImpl = () => ({
  name: 'zod',
  is: schema => schema instanceof z.ZodType,
  create: schema => {
    // If this is already a Zod schema, return it directly with namedContext
    if (schema instanceof z.ZodType) {
      // We need to ensure namedContext is attached and persists
      // Use a non-enumerable property to prevent issues with schema cloning
      if (!schema.namedContext) {
        // Using Object.defineProperty to ensure the method stays attached
        Object.defineProperty(schema, 'namedContext', {
          value: function(name = 'default') {
            let errors = [];
            
            return {
              validate: (obj, options = {}) => {
                const { isModifier = false } = options;
                
                try {
                  if (isModifier) {
                    // For update operations with modifiers
                    if (obj.$set) {
                      schema.partial().parse(obj.$set);
                    }
                    // Handle other modifiers if needed
                  } else {
                    // For normal documents
                    schema.parse(obj);
                  }
                  
                  errors = []; // Clear errors if validation passes
                  return true;
                } catch (error) {
                  errors = []; // Clear previous errors
                  
                  if (error.errors) {
                    error.errors.forEach(err => {
                      errors.push({
                        name: err.path.join('.'),
                        type: err.code,
                        value: err.received,
                        message: err.message
                      });
                    });
                  }
                  return false;
                }
              },
              validationErrors: () => {
                return errors;
              },
              resetValidation: () => {
                errors = [];
              },
              isValid: () => {
                return errors.length === 0;
              },
              keyIsInvalid: (key) => {
                return errors.some(err => err.name === key);
              },
              keyErrorMessage: (key) => {
                const error = errors.find(err => err.name === key);
                return error ? error.message : '';
              }
            };
          },
          writable: false,
          configurable: false,
          enumerable: false // Make non-enumerable to prevent issues with schema cloning
        });
      }
      return schema;
    }
    
    // Convert schema definition object to Zod schema
    const zodSchema = z.object(
      Object.entries(schema).reduce((acc, [key, def]) => {
        let field;
        
        // Handle field type
        switch (def.type) {
          case String:
            field = z.string();
            break;
          case Number:
            field = z.number();
            break;
          case Boolean:
            field = z.boolean();
            break;
          case Date:
            field = z.date();
            break;
          case Object:
            field = z.object({}).passthrough();
            break;
          case Array:
            field = z.array(z.any());
            break;
          default:
            field = z.any();
        }
        
        // Handle required or optional
        if (def.optional === true) {
          field = field.optional();
        } else {
          field = field.nullable();
        }
        
        // Handle min/max for strings and numbers
        if (def.type === String) {
          if (def.min !== undefined) {
            field = field.min(def.min);
          }
          if (def.max !== undefined) {
            field = field.max(def.max);
          }
        } else if (def.type === Number) {
          if (def.min !== undefined) {
            field = field.min(def.min);
          }
          if (def.max !== undefined) {
            field = field.max(def.max);
          }
        }
        
        acc[key] = field;
        return acc;
      }, {})
    );
    
    // Attach namedContext using Object.defineProperty to ensure it persists
    Object.defineProperty(zodSchema, 'namedContext', {
      value: function(name = 'default') {
        let errors = [];
        
        return {
          validate: (obj, options = {}) => {
            const { isModifier = false } = options;
            
            try {
              if (isModifier) {
                // For update operations with modifiers
                if (obj.$set) {
                  zodSchema.partial().parse(obj.$set);
                }
                // Handle other modifiers if needed
              } else {
                // For normal documents
                zodSchema.parse(obj);
              }
              
              errors = []; // Clear errors if validation passes
              return true;
            } catch (error) {
              errors = []; // Clear previous errors
              
              if (error.errors) {
                error.errors.forEach(err => {
                  errors.push({
                    name: err.path.join('.'),
                    type: err.code,
                    value: err.received,
                    message: err.message
                  });
                });
              }
              return false;
            }
          },
          validationErrors: () => {
            return errors;
          },
          resetValidation: () => {
            errors = [];
          },
          isValid: () => {
            return errors.length === 0;
          },
          keyIsInvalid: (key) => {
            return errors.some(err => err.name === key);
          },
          keyErrorMessage: (key) => {
            const error = errors.find(err => err.name === key);
            return error ? error.message : '';
          }
        };
      },
      writable: false,
      configurable: false,
      enumerable: false // Make non-enumerable to prevent issues with schema cloning
    });
    
    return zodSchema;
  },
  extend: (s1, s2) => {
    // Check if both schemas are Zod schemas
    if (!(s1 instanceof z.ZodType) || !(s2 instanceof z.ZodType)) {
      throw new Error('Both schemas must be Zod schemas');
    }
    
    // Create a merged schema
    // For simplicity, we'll just merge the raw shapes of both schemas
    // This is a simplified approach and may need to be enhanced for complex schemas
    const mergedSchema = z.object({
      ...s1._def.shape(),
      ...s2._def.shape()
    });
    
    // Ensure namedContext is attached to the merged schema
    Object.defineProperty(mergedSchema, 'namedContext', {
      value: function(name = 'default') {
        let errors = [];
        
        return {
          validate: (obj, options = {}) => {
            const { isModifier = false } = options;
            
            try {
              if (isModifier) {
                // For update operations with modifiers
                if (obj.$set) {
                  mergedSchema.partial().parse(obj.$set);
                }
                // Handle other modifiers if needed
              } else {
                // For normal documents
                mergedSchema.parse(obj);
              }
              
              errors = []; // Clear errors if validation passes
              return true;
            } catch (error) {
              errors = []; // Clear previous errors
              
              if (error.errors) {
                error.errors.forEach(err => {
                  errors.push({
                    name: err.path.join('.'),
                    type: err.code,
                    value: err.received,
                    message: err.message
                  });
                });
              }
              return false;
            }
          },
          validationErrors: () => {
            return errors;
          },
          resetValidation: () => {
            errors = [];
          },
          isValid: () => {
            return errors.length === 0;
          },
          keyIsInvalid: (key) => {
            return errors.some(err => err.name === key);
          },
          keyErrorMessage: (key) => {
            const error = errors.find(err => err.name === key);
            return error ? error.message : '';
          }
        };
      },
      writable: false,
      configurable: false,
      enumerable: false
    });
    
    return mergedSchema;
  },
  validate: (obj, schema, options = {}) => {
    try {
      // Handle modifiers for updates
      if (options.modifier) {
        const result = schema.partial().safeParse(obj.$set || {});
        if (result.success) {
          return { isValid: true };
        } else {
          // Format errors
          const formattedErrors = result.error.errors.map(err => ({
            name: err.path.join('.'),
            type: err.code,
            value: err.received,
            message: err.message
          }));
          return {
            isValid: false,
            errors: formattedErrors
          };
        }
      } else {
        // Handle regular document validation
        const result = schema.safeParse(obj);
        if (result.success) {
          return { isValid: true };
        } else {
          // Format errors
          const formattedErrors = result.error.errors.map(err => ({
            name: err.path.join('.'),
            type: err.code,
            value: err.received,
            message: err.message
          }));
          return {
            isValid: false,
            errors: formattedErrors
          };
        }
      }
    } catch (error) {
      // Handle any unexpected errors
      const formattedErrors = error.errors ? error.errors.map(err => ({
        name: err.path.join('.'),
        type: err.code,
        value: err.received,
        message: err.message
      })) : [{ 
        name: 'unknown', 
        type: 'error', 
        message: error.message || 'Unknown validation error' 
      }];
      
      return {
        isValid: false,
        errors: formattedErrors
      };
    }
  },
  freeze: false
})