import { distanceMeters, isValidLatLng } from './geo';

describe('distanceMeters', () => {
  it('같은 점은 0', () => {
    expect(distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(0);
  });

  it('위도 0.001도는 약 111m', () => {
    const d = distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('서울시청 → 강남역은 약 8.9km', () => {
    const d = distanceMeters({ lat: 37.5663, lng: 126.9779 }, { lat: 37.4979, lng: 127.0276 });
    expect(d).toBeGreaterThan(8500);
    expect(d).toBeLessThan(9300);
  });

  it('날짜변경선을 건너도 짧은 거리', () => {
    const d = distanceMeters({ lat: 0, lng: 179.9995 }, { lat: 0, lng: -179.9995 });
    expect(d).toBeLessThan(120);
  });
});

describe('isValidLatLng', () => {
  it('범위와 타입 검사', () => {
    expect(isValidLatLng(37, 127)).toBe(true);
    expect(isValidLatLng(null, 127)).toBe(false);
    expect(isValidLatLng(undefined, undefined)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
  });
});
