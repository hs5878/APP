import { add } from './example';

describe('add', () => {
  it('두 수를 더한다', () => {
    expect(add(1, 2)).toBe(3);
  });
});
