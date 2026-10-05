import { templateSummary } from './template';

describe('templateSummary', () => {
  it('장소명이 3곳 이상이면 앞의 둘과 곳 수를 쓴다', () => {
    expect(
      templateSummary({ placeNames: ['카페A', '서울숲', '파스타집'], photoCount: 9 }),
    ).toBe('카페A · 서울숲 · 3곳');
  });

  it('장소 1곳이면 이름만 쓴다', () => {
    expect(templateSummary({ placeNames: ['서울숲'], region: '성수동', photoCount: 4 })).toBe(
      '서울숲',
    );
  });

  it('장소 2곳이면 둘을 이어 쓴다', () => {
    expect(templateSummary({ placeNames: ['카페A', '서울숲'], photoCount: 4 })).toBe(
      '카페A · 서울숲',
    );
  });

  it('중복·빈 이름은 한 번만 센다', () => {
    expect(
      templateSummary({ placeNames: ['서울숲', ' 서울숲 ', null, '', '카페A'], photoCount: 5 }),
    ).toBe('서울숲 · 카페A');
    expect(templateSummary({ placeNames: ['서울숲', '서울숲', '서울숲'], photoCount: 5 })).toBe(
      '서울숲',
    );
  });

  it('장소명이 없고 동 이름만 있으면 "동에서"', () => {
    expect(templateSummary({ placeNames: [null], region: '성수동', photoCount: 5 })).toBe(
      '성수동에서',
    );
  });

  it('아무것도 없으면 사진 수', () => {
    expect(templateSummary({ placeNames: [], photoCount: 7 })).toBe('사진 7장');
    expect(templateSummary({ placeNames: [], region: '  ', photoCount: 3 })).toBe('사진 3장');
  });
});
