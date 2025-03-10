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
