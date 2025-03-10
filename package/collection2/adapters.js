/**
 * Re-export adapters from their individual files
 * This maintains backward compatibility while allowing for a more modular structure
 */

// Import adapters
import { createSimpleSchemaAdapter as simpleSchemaAdapter } from './adapters/simpleSchema';
import { createZodAdapter as zodAdapter } from './adapters/zod';
import { createAjvAdapter as ajvAdapter } from './adapters/ajv';

// Re-export adapters
export { simpleSchemaAdapter, zodAdapter, ajvAdapter };
export const SimpleSchemaAdapter = simpleSchemaAdapter;
export const ZodAdapter = zodAdapter;
export const AjvAdapter = ajvAdapter;
