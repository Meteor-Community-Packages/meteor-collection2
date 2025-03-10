/**
 * Re-export adapters from their individual files
 * This maintains backward compatibility while allowing for a more modular structure
 */

// Import adapters
import { createSimpleSchemaAdapter } from './adapters/simpleSchema';
import { createZodAdapter } from './adapters/zod';
import { createAjvAdapter } from './adapters/ajv';

// Re-export adapters
export const SimpleSchemaAdapter = createSimpleSchemaAdapter;
export const ZodAdapter = createZodAdapter;
export const AjvAdapter = createAjvAdapter;

// Export a function to get the validation context from the appropriate adapter
export const getValidationContextFromAdapter = (schema, validationContext) => {
  // Determine which adapter to use based on the schema type
  const { isSimpleSchema } = require('./schemaDetectors');
  const { isZodSchema } = require('./schemaDetectors');
  const { isAjvSchema } = require('./schemaDetectors');
  
  if (isSimpleSchema(schema)) {
    return SimpleSchemaAdapter().getValidationContext(schema, validationContext);
  }
  
  if (isZodSchema(schema)) {
    return ZodAdapter().getValidationContext(schema, validationContext);
  }
  
  if (isAjvSchema(schema)) {
    return AjvAdapter().getValidationContext(schema, validationContext);
  }
  
  // If we can't determine the schema type, fall back to the default behavior
  if (validationContext && typeof validationContext === 'object') {
    return validationContext;
  }
  
  return schema.namedContext(validationContext);
};
