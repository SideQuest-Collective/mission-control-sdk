import {
  PIPELINE_OUTPUT_UNITS,
  PIPELINE_WINDOWS,
  TELEMETRY_FAMILIES,
} from './types.js';

const VALID_AGGREGATION_TYPES = new Set([
  'count',
  'count_where',
  'avg',
  'sum',
  'p50',
  'p90',
  'max',
  'min',
  'rate',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateStringRecord(
  value: unknown,
  label: string,
  errors: string[],
): value is Record<string, string> {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      errors.push(`${label}.${key} must be a string`);
    }
  }

  return true;
}

function validateAggregation(
  aggregation: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(aggregation)) {
    errors.push(`${label} must be an object`);
    return;
  }

  if (!VALID_AGGREGATION_TYPES.has(String(aggregation.type))) {
    errors.push(`${label}.type is invalid`);
    return;
  }

  switch (aggregation.type) {
    case 'count':
      return;
    case 'count_where':
      validateStringRecord(aggregation.predicate, `${label}.predicate`, errors);
      return;
    case 'avg':
    case 'sum':
    case 'p50':
    case 'p90':
    case 'max':
    case 'min':
      if (typeof aggregation.field !== 'string' || aggregation.field.trim() === '') {
        errors.push(`${label}.field must be a non-empty string`);
      }
      return;
    case 'rate':
      validateAggregation(aggregation.numerator, `${label}.numerator`, errors);
      validateAggregation(aggregation.denominator, `${label}.denominator`, errors);
      return;
    default:
      errors.push(`${label}.type is invalid`);
  }
}

export function validatePipelineDescriptor(pipeline: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(pipeline)) {
    return ['pipeline must be an object'];
  }

  if (pipeline.version !== 1) {
    errors.push('pipeline.version must be 1');
  }

  if (!Array.isArray(pipeline.sources) || pipeline.sources.length !== 1) {
    errors.push('pipeline.sources must contain exactly one source');
  } else {
    const [source] = pipeline.sources;
    if (!isRecord(source)) {
      errors.push('pipeline.sources[0] must be an object');
    } else {
      if (!TELEMETRY_FAMILIES.includes(source.family as typeof TELEMETRY_FAMILIES[number])) {
        errors.push(`pipeline.sources[0].family "${String(source.family)}" is unsupported`);
      }
      if (source.filter !== undefined) {
        validateStringRecord(source.filter, 'pipeline.sources[0].filter', errors);
      }
    }
  }

  validateAggregation(pipeline.aggregation, 'pipeline.aggregation', errors);

  if (!PIPELINE_WINDOWS.includes(pipeline.window as typeof PIPELINE_WINDOWS[number])) {
    errors.push(`pipeline.window "${String(pipeline.window)}" is invalid`);
  }

  if (!PIPELINE_OUTPUT_UNITS.includes(
    pipeline.output_unit as typeof PIPELINE_OUTPUT_UNITS[number],
  )) {
    errors.push(`pipeline.output_unit "${String(pipeline.output_unit)}" is invalid`);
  }

  return errors;
}
