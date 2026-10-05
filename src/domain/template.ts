// AI를 쓸 수 없을 때 채우는 템플릿 문장(SPEC F3).
// 장소명 → 동 이름 → 사진 수 순서로 고른다.

export type TemplateInput = {
  placeNames: readonly (string | null | undefined)[]; // 시간순 스톱 장소명
  region?: string | null; // 동 단위 지역명
  photoCount: number;
};

const SHOWN_NAMES = 2;

function distinctNames(names: TemplateInput['placeNames']): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function templateSummary(input: TemplateInput): string {
  const names = distinctNames(input.placeNames);
  if (names.length > 0) {
    const head = names.slice(0, SHOWN_NAMES).join(' · ');
    return names.length > SHOWN_NAMES ? `${head} · ${names.length}곳` : head;
  }
  const region = input.region?.trim();
  if (region) return `${region}에서`;
  return `사진 ${input.photoCount}장`;
}
