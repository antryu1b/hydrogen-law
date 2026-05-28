export interface FamilyDisplay {
  id: 'A' | 'B' | 'C';
  emoji: string;
  shortLabel: string;
  longLabel: string;
  flow: string;
  description: string;
  highlight?: string;
  members: Array<{
    code: string;
    name: string;
  }>;
}

export const KGS_FAMILIES: FamilyDisplay[] = [
  {
    id: 'A',
    emoji: '1️⃣',
    shortLabel: '제조 기준',
    longLabel: '제조 기준 그룹 (11개)',
    flow: '제조설비 → 재료 → 구조 → 성능 → 표시 → 검사',
    description:
      '용기, 연료전지, 수전해기 등 *물건을 만들 때* 적용하는 기준입니다. 모두 비슷한 흐름의 목차 구조를 가집니다.',
    highlight:
      '이동형 연료전지 5종(드론·지게차·노면전차·항공·선박)은 목차가 100% 동일 — 적용 기계만 다르고 안전 요구사항은 같다는 뜻.',
    members: [
      { code: 'AC411', name: '고압가스용 알루미늄합금라이너 복합재료용기 제조의 시설·기술·검사 기준' },
      { code: 'AC421', name: '이동수단용 압축수소 복합재료용기 제조의 시설·기술·검사 기준' },
      { code: 'AH171', name: '수소추출설비 제조의 시설·기술·검사 기준' },
      { code: 'AH271', name: '수전해설비 제조의 시설·기술·검사 기준' },
      { code: 'AH371', name: '고정형 연료전지 제조의 시설·기술·검사 기준' },
      { code: 'AH372', name: '이동형 연료전지(지게차용) 제조의 시설·기술·검사 기준' },
      { code: 'AH373', name: '이동형 연료전지(드론용) 제조의 시설·기술·검사 기준' },
      { code: 'AH374', name: '이동형 연료전지(건설기계용) 제조의 시설·기술·검사 기준' },
      { code: 'AH375', name: '이동형 연료전지(노면전차용) 제조의 시설·기술·검사 기준' },
      { code: 'AH376', name: '이동형 연료전지(항공기용) 제조의 시설·기술·검사 기준' },
      { code: 'AH377', name: '이동형 연료전지(선박용) 제조의 시설·기술·검사 기준' },
    ],
  },
  {
    id: 'B',
    emoji: '2️⃣',
    shortLabel: '시설 기준',
    longLabel: '시설 기준 그룹 (7개)',
    flow: '배치 → 기초 → 저장 → 가스설비 → 배관 → 사고예방',
    description:
      '충전소, 저장소, 사용시설 등 *설비를 운영할 때* 적용하는 기준입니다. 시설 운영의 전 과정을 다룹니다.',
    highlight:
      '특수·특정 고압가스 사용기준 2종(FU211·FU212)은 목차가 100% 동일 — 다루는 가스 종류만 다름.',
    members: [
      { code: 'FP211', name: '고압가스 용기 및 차량에 고정된 탱크 충전의 시설·기술·검사·안전성평가 기준' },
      { code: 'FP216', name: '제조식 수소연료 충전의 시설·기술·검사 기준' },
      { code: 'FP217', name: '저장식 수소연료 충전의 시설·기술·검사 기준' },
      { code: 'FU111', name: '고압가스 저장의 시설·기술·검사·안전성평가 기준' },
      { code: 'FU211', name: '특정고압가스 사용의 시설·기술·검사 기준' },
      { code: 'FU212', name: '특수고압가스 사용의 시설·기술·검사 기준' },
      { code: 'FU671', name: '수소연료사용시설의 시설·기술·검사 기준' },
    ],
  },
  {
    id: 'C',
    emoji: '3️⃣',
    shortLabel: '재검사',
    longLabel: '재검사 그룹 (2개)',
    flow: '재검사 항목 → 재검사 방법 → 합격 판정',
    description:
      '이미 만들어진 용기·탱크를 *주기적으로 다시 검사할 때* 쓰는 기준입니다. 위 두 그룹과 구조가 달라 따로 묶었습니다.',
    members: [
      { code: 'AC116', name: '고압가스용 저장탱크 및 압력용기 재검사 기준' },
      { code: 'AC414', name: '고압가스용 복합재료용기 재검사 기준' },
    ],
  },
];

// Lookup map: code -> family id (for badge rendering)
export const CODE_TO_FAMILY: Record<string, 'A' | 'B' | 'C'> = Object.fromEntries(
  KGS_FAMILIES.flatMap((family) =>
    family.members.map((m) => [m.code, family.id])
  )
) as Record<string, 'A' | 'B' | 'C'>;
