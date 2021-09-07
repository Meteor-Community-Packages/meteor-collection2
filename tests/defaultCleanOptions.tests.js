import expect from 'expect';
import Collection2 from 'meteor/aldeed:collection2';

describe('cleanOptions', function () {
  it('comes preloaded with default values', function() {
      expect(Collection2.cleanOptions).toEqual({
        filter: true,
        autoConvert: true,
        removeEmptyStrings: true,
        trimStrings: true,
        removeNullsFromArrays: false,
      });
    });

  it('allows setting cleanOptions', function () {
      const cleanOptions = {
        filter: false,
        autoConvert: false,
        removeEmptyStrings: false,
        trimStrings: false,
        removeNullsFromArrays: false,
      };

      Collection2.cleanOptions = cleanOptions;
      expect(Collection2.cleanOptions).toEqual(cleanOptions);
    });
  }); 