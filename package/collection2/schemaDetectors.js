import { Meteor } from 'meteor/meteor';

/**
 * Schema detectors for different validation libraries
 * These functions provide a consistent way to detect schema types
 * across the Collection2 package
 */

/**
 * Determines if a schema is a SimpleSchema schema
 * @param {Object} schema - The schema to check
 * @returns {Boolean} True if the schema is a SimpleSchema schema
 */
export const isSimpleSchema = (schema) => {
  // Check if SimpleSchema.isSimpleSchema exists and use it
  if (typeof SimpleSchema !== 'undefined' && typeof SimpleSchema.isSimpleSchema === 'function') {
    return SimpleSchema.isSimpleSchema(schema);
  }
  
  // Fallback to property-based detection
  return schema && 
         typeof schema === 'object' && 
         typeof schema.schema === 'function' && 
         typeof schema.validator === 'function' && 
         typeof schema.clean === 'function' && 
         typeof schema.namedContext === 'function';
};

/**
 * Determines if a schema is a Zod schema
 * @param {Object} schema - The schema to check
 * @returns {Boolean} True if the schema is a Zod schema
 */
export const isZodSchema = (schema) => {
  return schema && 
         typeof schema === 'object' && 
         schema._def && 
         schema.safeParse && 
         schema.parse && 
         typeof schema.safeParse === 'function' && 
         typeof schema.parse === 'function';
};

/**
 * Determines if a schema is an AJV schema
 * @param {Object} schema - The schema to check
 * @returns {Boolean} True if the schema is an AJV schema
 */
export const isAjvSchema = (schema) => {
  return schema && 
         typeof schema === 'object' && 
         ((schema.compile && schema.validate && 
           typeof schema.compile === 'function' && 
           typeof schema.validate === 'function') ||
          (schema.type === 'object' && schema.properties && 
           typeof schema.properties === 'object'));
};

/**
 * Detects the type of schema
 * @param {Object} schema - The schema to check
 * @returns {String} The type of schema ('SimpleSchema', 'zod', 'ajv', or 'unknown')
 */
export const detectSchemaType = (schema) => {
  if (isSimpleSchema(schema)) {
    return 'SimpleSchema';
  }
  
  if (isZodSchema(schema)) {
    return 'zod';
  }
  
  if (isAjvSchema(schema)) {
    return 'ajv';
  }
  
  return 'unknown';
};
