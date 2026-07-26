import expect from 'expect';
import {
  flattenSelector,
  mergeSelectorAndSet
} from 'meteor/aldeed:collection2/lib';

/* global describe, it */

describe('collection2 selector projection helpers', function () {
  it('projects nested equality-like $and selectors without mutating the input', function () {
    const selector = {
      topLevel: 'value',
      $and: [
        { equality: 'first' },
        {
          $and: [
            { equalOperator: { $eq: 'second' } },
            { singleInOperator: { $in: ['third'] } }
          ]
        }
      ]
    };
    const originalSelector = JSON.parse(JSON.stringify(selector));

    expect(flattenSelector(selector)).toEqual({
      topLevel: 'value',
      equality: 'first',
      equalOperator: 'second',
      singleInOperator: 'third'
    });
    expect(selector).toEqual(originalSelector);
  });

  it('copies special field names as own data properties without changing prototypes', function () {
    const selector = JSON.parse(
      '{"__proto__":{"polluted":"selector"},"constructor":"selector","prototype":"selector","ordinary":"selector"}'
    );
    const set = JSON.parse(
      '{"__proto__":{"polluted":"modifier"},"constructor":"modifier","prototype":"modifier","ordinary":"modifier"}'
    );

    const result = mergeSelectorAndSet(selector, set);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(true);
    expect(result.__proto__).toEqual({ polluted: 'modifier' });
    expect(result.constructor).toBe('modifier');
    expect(result.prototype).toBe('modifier');
    expect(result.ordinary).toBe('modifier');
    expect({}.polluted).toBe(undefined);
  });
});
