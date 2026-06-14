import { describe, it, expect } from 'vitest';
import { getSafeString } from '../utils/stringUtils.js';

describe('stringUtils - getSafeString', () => {
    it('should return empty string for null or undefined', () => {
        expect(getSafeString(null)).toBe('');
        expect(getSafeString(undefined)).toBe('');
    });

    it('should return stringified value for numbers and booleans', () => {
        expect(getSafeString(0)).toBe('0');
        expect(getSafeString(false)).toBe('false');
        expect(getSafeString(123)).toBe('123');
    });

    it('should return first element if array is provided', () => {
        expect(getSafeString(['123', '456'])).toBe('123');
        expect(getSafeString([0])).toBe('0');
    });

    it('should return empty string for empty array or array with null/undefined', () => {
        expect(getSafeString([])).toBe('');
        expect(getSafeString([null])).toBe('');
        expect(getSafeString([undefined])).toBe('');
    });

    it('should return stringified value for objects', () => {
        expect(getSafeString({})).toBe('[object Object]');
    });
});
