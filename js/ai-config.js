'use strict';
/* =====================================================================
   AI 설정: 가중치, 상수, 전술 프로필
   규칙 수치가 아니라 AI 판단에만 쓰는 값.
   ===================================================================== */
/*
 * 전술 프로필. 키가 프로필 id (UI·simulateGames 에서 사용). 이름·설명은 STRINGS 'profile.<id>.name' / '.desc'
 *   weights   : 기본 가중치 세트 (noise = 점수 노이즈, risk = 위험 회피 배수)
 *   features  : 켜는 기능 (공격 측 진영일 때만 동작)
 *     crossingPlan  한 축 집중 도하 (집결 전 도하 금지, 축 고정, 도하 위험 판단)
 *     spreadCrossing 산개 도하 (포탄 위협, 응집, staging → crossing → assault)
 *     signalFocus   통신 반경 안에서 싸움, 적 통신 우선 표적
 *     reconSpotting 정찰 먼저 행동해 포병 사거리 안을 밝힘
 *     artyHunt      적 포병 우선 제거 (접근, 대포병 사격, 표적 가치)
 *   constants : 기능별 상수 (지도에 묶인 값 AXES, SPREAD.PRIOR_ROWS 는 시나리오 aiConstants 에서 합쳐짐)
 *   extends   : 다른 프로필을 바탕으로 함 (weights/features 는 지정하면 대체, constants 는 깊은 병합)
 * 새 전술은 여기에 프로필 객체만 추가하면 AI·시작 화면·기록에 반영된다.
 */
const TACTIC_PROFILES = {
  easy: {
    weights: { noise: 3.0, risk: 0.5 }, features: [], constants: {},
  },
  normal: {
    weights: { noise: 1.0, risk: 1.0 }, features: [], constants: {},
  },
  hard: {
    weights: { noise: 0.3, risk: 1.4 },
    features: ['crossingPlan', 'signalFocus', 'reconSpotting', 'artyHunt'],
    constants: {
      UNIT_ORDER: ['recon', 'artillery', 'mortar', 'armor', 'infantry', 'signal', 'antitank'],   // 정찰이 먼저 시야 확보 → 포병 사격
      MASS_MIN: 5,                    // 이 수 이상 모이기 전에는 강에 들어가지 않음
      MASS_TYPES: ['infantry', 'armor', 'antitank'],   // 집결 수에 세는 병종
      STAGE_RADIUS: 3,                // 집결 칸(아군 쪽 강변, 축 열)으로부터 이 거리 안이면 집결로 셈
      AXIS_WIDTH: 1,                  // 축 열에서 이 거리 안의 강 칸만 사용
      AXIS_SWITCH_MARGIN: 2,          // 다른 축이 이 점수 이상 나을 때만 축 변경 (도하 시작 후에는 고정)
      AXIS_ENEMY_RADIUS: 3,           // 축 평가: 건너편 출구 칸 주변 적 전력 반경
      AXIS_OBJECTIVE_RADIUS: 4,       // 축 평가: 출구 칸 주변 거점 수 반경
      GATE_EXEMPT: ['recon'],         // 집결/축 제한을 받지 않는 병종
      ARTY_MEMORY_AGE: 3,             // 적 포병 위치 기억 유효 라운드
      ARTY_NEUTRAL_HP: 1,             // 이 HP 이하인 적 포병은 무력화로 간주
      DANGER_DECAY_START: 8,          // 이 라운드부터 도하 위험 감점을 줄이기 시작 (시간 압박)
      DANGER_DECAY_END: 16,
      DANGER_MIN_FACTOR: 0.3,
      COVERED_FACTOR: 0.35,           // 아군 포병이 그 적 포병을 사격할 수 있으면 감점 배수
      MASSED_FACTOR: 0.6,             // 집결 완료 시 감점 배수
      ASSUMED_CONFIDENCE: 0.6,        // 배치 위치로 추정한 적 포병에 대한 대포병 사격 신뢰도
      TARGET_MULT: { signal: 2.5, artillery: 2.0 },   // 표적 가치 추가 배수
      HUNT_ARTY_RADIUS: 6,            // 보병/기갑: 이 거리 안의 적 포병에게 접근
      HUNT_TYPES: ['infantry', 'armor'],
      WEIGHTS: {
        riverGate: 30,         // 집결 전 강 진입
        offAxis: 30,           // 축이 아닌 곳으로 도하
        retreat: 10,           // 도하를 시작한 유닛이 아군 강변으로 되돌아감
        crossingDanger: 8,     // 적 포병 사거리 안의 강 칸 (포병 1기당)
        inSignalRange: 2.5,    // 공격 유닛: 통신 반경 안 (기본 가중치 대신)
        spotForArty: 0.35,     // 정찰: 아직 사격 전인 아군 포병 사거리 안에서 새로 보는 칸 1개당
        huntArtillery: 1.2,    // 보병/기갑: 적 포병 접근 (거리 1당)
        counterBattery: 2.5,   // 포병: 적 포병(추정 포함)을 사격/파편으로 칠 수 있는 위치
        axisObjective: 1.5,    // 축 평가: 출구 주변 거점 1개당
        axisDistance: 0.1,     // 축 평가: 아군 유닛의 집결 칸까지 거리 1당
      },
    },
  },
  hardSpread: {
    extends: 'hard',
    features: ['spreadCrossing', 'signalFocus', 'reconSpotting', 'artyHunt'],
    constants: {
      SPREAD: {
        ARTY_MEMORY_AGE: 5,          // 목격한 적 포병 위치를 정밀 위협으로 쓰는 기간 (라운드)
        ASSUMED_SPOT_DEPTH: 3,       // 적 강변 첫 행에서 이 행 수 안쪽은 적이 볼 수 있다고 가정 (시야 밖 보정 추정)
        CROSS_TYPES: ['infantry', 'armor'],   // 강을 건널 때까지 '도하 최우선'으로 움직이는 병종
        MIN_GAP: 3,                  // 도하 칸끼리 이 거리 이상이면 더 좋음 (전진 정도가 같을 때만 비교)
        COHESION_RADIUS: 5,          // 이 거리 안에 아군이 없으면 고립 감점
        JITTER: 0.25,                // 매 판 산개 가중치 변주 폭 (±25%)
        WEIGHTS: {
          shellThreat: 2.0,          // 이동 후 대형의 포탄 위협 (예상 피해 1당)
          isolation: 3.0,            // 고립 감점
          backward: 10,              // 아직 못 건넌 보병·기갑이 건너편에서 멀어지는 칸 1당 (막혔을 때 뒷걸음 방지)
          exitBlock: 4,              // 건넌 유닛이 다리 출구 칸에 머묾 (다른 유닛이 건너는 중일 때)
        },
      },
    },
  },
};
/** 기능이 필요로 하는 지도 요소. 시나리오에 없으면 그 기능은 꺼진다 (예: 강 줄기가 없는 지도의 도하 전술) */
const TACTIC_FEATURE_NEEDS = { crossingPlan: 'river', spreadCrossing: 'river' };

const AI_CONFIG = {
  UNIT_ORDER: ['artillery', 'mortar', 'armor', 'infantry', 'recon', 'signal', 'antitank'],
  TOP_K: 3,                       // 상위 몇 개 중에서 고를지
  PICK_MARGIN: 0.5,               // 점수 비례 선택 시 최하위 후보에게 주는 기본 몫
  BLIND_FIRE_MAX_AGE: 5,          // 이 라운드 수 이내에 목격한 적만 시야 밖 사격
  THREAT_MEMORY_MAX_AGE: 1,       // 위협 계산에 쓰는 기억의 최대 경과 라운드
  HQ_RUNNERS: ['recon'],          // 공격 측에서 적 본부를 직접 노리는 병종 (본부가 없으면 거점)
  HQ_GUARDS: ['recon'],           // 수비 측에서 본부 근처를 지키는 병종 (본부가 없으면 일반 수비)
  HQ_GUARD_RADIUS: 3,
  SIGNAL_BEHIND_MIN: 2,           // 통신 유닛을 전투 유닛 뒤 몇 칸에 둘지 (맨해튼)
  SIGNAL_BEHIND_MAX: 3,
  SIGNAL_BEHIND_COUNT_MAX: 3,     // 보너스를 주는 전투 유닛 최대 수
  GARRISON_TYPES: ['infantry', 'antitank'],   // 수비 측: 비어 있는 아군 거점을 채우러 가는 병종
  DEFENDER_LEASH: 2,              // 수비 측 유닛이 가장 가까운 거점에서 벗어나도 되는 거리
  HQ_ALERT_RADIUS: 6,             // 수비 측: 본부 이 거리 안에 적이 보이면 요격
  PATH_COST: { plain: 1, city: 1, mountain: 3, river: 2, forest: 2, paddy: 2 },   // 목표 거리 계산용 근사 비용 (진입 불가는 지형의 impassableFor 를 따름)
  UNIT_VALUE: { infantry: 1.0, armor: 1.6, artillery: 1.4, recon: 0.8, signal: 2.0, antitank: 1.3, mortar: 1.2 },   // 통신은 고가치 표적
  // 병종별 보정 종류 (aiScorePosition 참고)
  TYPE_BONUS: { artillery: 'rear', signal: 'supportBehind', recon: 'vision', armor: 'crossing', antitank: 'huntArmor', mortar: 'mortarRear' },
  WEIGHTS: {
    damage: 3.0,             // w1 예상 피해
    kill: 4.0,               // 격파 기대 보너스
    threat: 1.0,             // w2 예상 피격
    // 후퇴·제압 (v12, 호스토멜·춘천의 기존 AI). 대칭 AI 의 같은 항목은 SYMMETRIC.V2. 위험 항목은 난이도 위험 회피 배수(diff.risk)를 곱함
    retreatKill: 4,          // 공격: 후퇴할 곳이 없어 피해를 입히면 격파되는 적 (병종 가치 × 명중 확률)
    retreatClear: 3,         // 공격: 거점 수비 유닛을 밀어내 거점이 비게 됨 (거점 점수 1당)
    suppress: 2,             // 공격: 간접 화력 정중앙 직격으로 적을 제압
    resuppressKill: 6,       // 공격: 이번 턴 내가 이미 제압한 적을 다시 정중앙 직격 = 격파
    noRetreat: 3,            // 위치: 물러날 곳이 막힌 방향 비율 × 피격 기대 (즉사 위험)
    suppressRisk: 1.5,       // 위치: 간접 화력에 맞아 다음 턴 행동 불가가 될 위험
    terrain: 0.6,            // w3 지형 방어 (hitMod 10 당)
    approach: 1.6,           // w4 목표까지 거리 1 감소당
    capture: 12,             // 거점 점령
    hold: 6,                 // 아군 거점 위에 머묾 (공격 측)
    holdDefender: 14,        // 아군 거점 위에 머묾 (수비 측)
    hqBlock: 25,             // 수비 측: 본부가 위협받을 때 본부 칸을 막음
    hqGuard: 4,              // 수비 측: 본부가 위협받을 때 본부 인접 칸
    hqWin: 1000,             // 적 본부 진입
    friendlyFire: 4.0,       // 오폭 기대치 감점
    blindFire: 1.2,          // 시야 밖 사격 기본 점수
    artyInRange: 2.5,        // 포병: 다음 턴 사거리 안에 아는 적 (최대 2기까지)
    artyCoverCrossing: 2.0,  // 수비 측 포병: 도하 지점이 사거리 안
    artyExposed: 3.0,        // 포병: 적과 맞닿음
    signalBehind: 1.5,       // 통신: 2~3칸 앞(적 쪽)에 있는 아군 전투 유닛 1기당
    signalTooClose: 1.0,     // 통신: 아군 전투 유닛보다 앞에 나섬 (1기당 감점)
    inSignalRange: 1.0,      // 공격 유닛: 아군 통신 반경 안에 위치
    reconVision: 0.08,       // 정찰: 새로 보는 칸 1개당
    armorCrossing: 1.0,      // 기갑: 도하 지점 접근 (거리 1당)
    antitankApproach: 1.2,   // 대전차: 보이는 적 기갑 접근 (거리 1당)
    leash: 1.5,              // 수비 측: 거점 이탈 거리 1당 감점
    hqThreatTarget: 2.0,     // 수비 측: 본부를 위협하는 적 공격 시 가치 배수
    crossingFire: 1.5,       // 수비 측 포병: 도하 지점/강 위 목표 사격
    mortarClose: 6.0,        // 박격포: 보이는 적과 2칸 이하인 칸 감점 (다른 칸이 없으면 그래도 감)
    mortarBehind: 1.0,       // 박격포: 목표 쪽으로 1~3칸 앞에 있는 아군 보병 1기당 (최대 2기)
  },
  // 중립 모드 (시나리오 aiProfile 'symmetric' 전용): 양쪽이 같은 기준으로 거점을 다툼
  SYMMETRIC: {
    HOLD: 14,                // 아군이 점유한 거점 칸 위에 머묾 (점유 방식 presence: 떠나면 점유를 잃음)
    APPROACH_GROWTH: 0.1,    // 이 라운드 뒤로 1라운드마다 거점 접근 가중치 +10% (교착 방지)
    GROWTH_START: 4,
    // 새 대칭 AI (v2): 위험 지도·본 적 기억·간접 화력 활용·집결 진입·위협 제거 (js/ai-intel.js). 'v1:<난이도>' 프로필이면 위 기존 방식만
    INTEL: {
      INTEL_FROM_SETUP: true,  // 아직 못 본 상대 시작 유닛을 공개된 시작 배치 위치로 기억에 넣음
      CONF_DECAY: 0.7,         // 안 보이는 1라운드마다 신뢰도 × 이 값
      RADIUS_CAP: 8,           // 불확실 반경 상한 (칸)
      SPREAD: 0.35,            // 위치 불확실성 가중: 신뢰도 / (1 + SPREAD × 반경)
      MIN_WEIGHT: 0.05,        // 이보다 가중치가 작은 기록은 위험 계산에서 뺌
    },
    V2: {
      urgencyRelief: 0.6,      // 압박 1 일 때 위험 가중치를 이 비율만큼 줄임
      supportValue: 1.5,       // 포병·박격포·통신의 위험 가중 배수
      lowHpMult: 1.6,          // 체력 2 이하 유닛의 위험 가중 배수 (위험 구역에서 빠져나옴)
      rearDirect: 4,           // 포병·박격포·통신: 그 칸의 직접 공격 기대 피해 1당 감점
      minGarrison: 1,          // 거점마다 남길 최소 수비 유닛 수
      garrisonLeave: 10,       // 마지막 수비 유닛이 거점을 떠나는 감점
      leashRadius: 3,          // 위협을 쫓아 거점 칸에서 떨어질 수 있는 최대 거리
      leash: 2.0,              // 그보다 1칸 멀어질 때마다 감점
      clearLane: 3.0,          // 아군 포병의 표적 옆(파편 칸)에서 비켜 주는 이동 (표적 가치 1당)
      reconWatch: 0.12,        // 정찰: 거점 3칸 안의 안 보이던 칸을 새로 볼 때 1칸당
      threatKill: 6,           // 공격: 위협 점수 × 기대 피해 비율
      finish: 3,               // 체력이 낮은 위협 마무리 (격파 기대 1당)
      focus: 1.2,              // 이미 맞은 적에게 집중
      counterRadius: 3,        // 반격: 이 거리 안에서 거점에 들어온 적을 목표로
      fogMinConf: 0.25,        // 안개 속 사격 후보: 기억 신뢰도 하한
      fogMaxRadius: 4,         // 안개 속 사격 후보: 불확실 반경 상한
      likelyConf: 0.2,         // '올 가능성이 높은 칸'(상대·다툼 거점 칸) 사격 후보의 가정 신뢰도
      maxFogTargets: 6,        // 유닛당 안개 속 사격 후보 수 상한 (계산 시간)
      fireReady: { visible: 5, intel: 3, likely: 2 },
      ffAdjacent: 4,           // 포병 표적 옆 아군 1기당 감점 (이때는 fireReady 가산 없음)
      artyCover: 1.5,          // 포병·박격포 위치: 사거리 안의 (내 것이 아닌) 거점 칸 1개당 (최대 4)
      artyIntelCover: 1.5,     // 포병·박격포 위치: 사거리 안의 기억한 적 (가중치 합, 최대 3)
      artyReach: 2.5,          // 포병·박격포: 가장 가까운 (내 것이 아닌) 거점 칸이 최대 사거리보다 1칸 멀 때마다 감점
      // 후퇴·제압 (시나리오 retreat 가 켜졌을 때만 쓰임)
      retreatKill: 7,          // 공격: 후퇴할 곳이 없어 피해를 입히면 격파되는 적 (병종 가치 × 명중 확률)
      retreatClear: 4,         // 공격: 거점 수비 유닛을 밀어내 거점이 비게 됨 (거점 점수 1당)
      suppress: 3,             // 공격: 간접 화력 정중앙 직격으로 적을 제압 (병종 가치 × 명중 확률)
      resuppressKill: 9,       // 공격: 이번 턴 내가 이미 제압한 적을 다시 정중앙 직격 = 격파
      noRetreat: 6,            // 위치: 물러날 곳이 막힌 방향 비율 × 피격 기대 (즉사 위험)
      suppressRisk: 3,         // 위치: 간접 화력에 맞아 다음 턴 행동 불가가 될 위험
      indirectHoldCut: 0.8,    // 포병·박격포가 거점 칸에 설 때 점령·유지 점수에서 덜어 내는 비율   // 간접 사격 후보 가산 (보이는 적 / 기억한 위치 / 올 가능성이 높은 칸)
      // 난이도별 (프로필 id → 등급: easy / normal / hard·hardSpread)
      LEVELS: {
        easy:   { riskWeight: 1.5, highRisk: 0.6, minSupport: 0, gatePenalty: 0 },   // 위험을 거의 무시
        normal: { riskWeight: 7, highRisk: 0.35, minSupport: 2, gatePenalty: 6 },
        hard:   { riskWeight: 12, highRisk: 0.3, minSupport: 2, gatePenalty: 10 },
      },
    },
  },
  DEFAULT_PROFILE: 'normal',
  TACTIC_PROFILES,
};
