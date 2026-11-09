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
      UNIT_ORDER: ['recon', 'artillery', 'armor', 'infantry', 'signal', 'antitank'],   // 정찰이 먼저 시야 확보 → 포병 사격
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
  UNIT_ORDER: ['artillery', 'armor', 'infantry', 'recon', 'signal', 'antitank'],
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
  UNIT_VALUE: { infantry: 1.0, armor: 1.6, artillery: 1.4, recon: 0.8, signal: 2.0, antitank: 1.3 },   // 통신은 고가치 표적
  // 병종별 보정 종류 (aiScorePosition 참고)
  TYPE_BONUS: { artillery: 'rear', signal: 'supportBehind', recon: 'vision', armor: 'crossing', antitank: 'huntArmor' },
  WEIGHTS: {
    damage: 3.0,             // w1 예상 피해
    kill: 4.0,               // 격파 기대 보너스
    threat: 1.0,             // w2 예상 피격
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
  },
  DEFAULT_PROFILE: 'normal',
  TACTIC_PROFILES,
};
