import type {
  CorrectionRequest,
  ManagerAlert,
  Recipe,
  ShiftAssignment,
  ShiftTypeDef,
  StaffMember,
  StaffingRequirement,
  WorkReport,
} from './types';
import { addDays, formatMonthDayWeekday, startOfDay, toISODate, weekdayIndexMonFirst } from './format';

export const DEMO_CAFE_NAME = 'Mirawi Cafe';
export const DEMO_CAFE_NAME_JA = 'ミラウィ カフェ';

/** The staff member the public staff demo is viewed as. */
export const CURRENT_STAFF_ID = 's3';

/** Fixed headline stat requested for the staff demo screen. */
export const CURRENT_STAFF_DEMO_WORKED_HOURS = 68.5;

/** Kept intentionally short: 1 / 2 / 3 / 通 / 休暇 — the only values the shift table cells show (plus "-" for no assignment). */
export const SHIFT_TYPES: ShiftTypeDef[] = [
  { id: 'shift1', label: '1', startTime: '07:00', endTime: '15:00' },
  { id: 'shift2', label: '2', startTime: '10:00', endTime: '18:00' },
  { id: 'shift3', label: '3', startTime: '13:00', endTime: '21:00' },
  { id: 'full', label: '通', startTime: '07:00', endTime: '21:00' },
  { id: 'dayoff', label: '休暇', isTimeOff: true },
];

/** required staffing by weekday: 月 火 水 木 金 土 日 -> 3 3 3 3 3 2 4 */
export const STAFFING_REQUIREMENTS: StaffingRequirement[] = [3, 3, 3, 3, 3, 2, 4].map(
  (requiredCount, weekday) => ({ weekday, requiredCount }),
);

export const MAX_MONTHLY_HOURS = 160;

interface StaffSeed extends StaffMember {
  /** weekday index (0=月..6=日) this staff regularly has off in the demo pattern. */
  dayOffWeekday: number;
}

export const STAFF: StaffSeed[] = [
  { id: 's1', name: '田中 愛', role: 'manager', hourlyWageYen: 1300, defaultTransportYen: 300, submittedPreference: true, dayOffWeekday: 6 },
  { id: 's2', name: '佐藤 健', role: 'staff', hourlyWageYen: 1100, defaultTransportYen: 250, submittedPreference: true, dayOffWeekday: 0 },
  { id: 's3', name: '鈴木 舞', role: 'staff', hourlyWageYen: 1080, defaultTransportYen: 200, submittedPreference: true, dayOffWeekday: 1 },
  { id: 's4', name: '高橋 大輝', role: 'staff', hourlyWageYen: 1150, defaultTransportYen: 320, submittedPreference: false, dayOffWeekday: 2 },
  { id: 's5', name: '伊藤 さくら', role: 'staff', hourlyWageYen: 1050, defaultTransportYen: 180, submittedPreference: false, dayOffWeekday: 4 },
  { id: 's6', name: '渡辺 陸', role: 'staff', hourlyWageYen: 1120, defaultTransportYen: 260, submittedPreference: false, dayOffWeekday: 6 },
];

const WORKING_SHIFT_POOL = ['shift1', 'shift2', 'shift3', 'full'];

/** 14-day window: 7 days up to and including today, then 7 future days. */
export function buildDemoDateRange(today: Date = new Date()): string[] {
  const base = startOfDay(today);
  const dates: string[] = [];
  for (let offset = -6; offset <= 7; offset += 1) {
    dates.push(toISODate(addDays(base, offset)));
  }
  return dates;
}

function startOfWeekMonFirst(date: Date): Date {
  return addDays(startOfDay(date), -weekdayIndexMonFirst(date));
}

/**
 * One Mon–Sun week of ISO dates. `weekOffset` 0 = the week containing
 * `today`, -1 = the previous week, +1 = the next week — used to drive the
 * staff screen's 前の週 / 今日 / 次の週 weekly carousel.
 */
export function buildWeekDateRange(weekOffset: number, today: Date = new Date()): string[] {
  const monday = startOfWeekMonFirst(addDays(startOfDay(today), weekOffset * 7));
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

/** All ISO dates in the calendar month containing `today` — used by the manager's 月間レポート (monthly report), which is month-scoped rather than tied to the currently displayed week. */
export function buildMonthDateRange(today: Date = new Date()): string[] {
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, month, i + 1)));
}

function isFutureDate(date: string, todayIso: string): boolean {
  return date > todayIso;
}

/**
 * Deterministic mock schedule generator (no Math.random, so server/client
 * render the same demo data). Past + today are fully staffed per the fixed
 * weekly pattern. Future dates are intentionally left unscheduled for
 * everyone except the manager, so the demo can show a realistic
 * "not yet planned" state that 自動シフト作成 then fills in.
 */
export function generateAssignments(dates: string[], todayIso: string): ShiftAssignment[] {
  const assignments: ShiftAssignment[] = [];

  dates.forEach((date, dayIndex) => {
    const weekday = weekdayIndexMonFirst(new Date(`${date}T00:00:00`));
    const future = isFutureDate(date, todayIso);

    STAFF.forEach((staff, staffIndex) => {
      const isDayOff = weekday === staff.dayOffWeekday;

      if (future && staff.role !== 'manager') {
        // Not yet planned — surfaces as a staffing gap until auto-schedule runs.
        assignments.push({ staffId: staff.id, date, shiftTypeId: null });
        return;
      }

      if (isDayOff) {
        assignments.push({ staffId: staff.id, date, shiftTypeId: 'dayoff' });
        return;
      }

      const shiftTypeId =
        staff.role === 'manager' ? 'full' : WORKING_SHIFT_POOL[(staffIndex + dayIndex) % WORKING_SHIFT_POOL.length]!;
      assignments.push({ staffId: staff.id, date, shiftTypeId });
    });
  });

  return assignments;
}

/**
 * Runs staffing-requirement-aware auto-schedule over the *future* dates only,
 * filling every non-manager staff member in on their non-day-off dates.
 * Mirrors what a real auto-scheduler would do, simplified for the demo.
 */
export function autoScheduleFutureAssignments(
  assignments: ShiftAssignment[],
  dates: string[],
  todayIso: string,
): ShiftAssignment[] {
  return assignments.map((assignment) => {
    if (!isFutureDate(assignment.date, todayIso)) return assignment;

    const staff = STAFF.find((candidate) => candidate.id === assignment.staffId);
    if (!staff || staff.role === 'manager') return assignment;

    const weekday = weekdayIndexMonFirst(new Date(`${assignment.date}T00:00:00`));
    if (weekday === staff.dayOffWeekday) {
      return { ...assignment, shiftTypeId: 'dayoff' };
    }

    const dayIndex = dates.indexOf(assignment.date);
    const staffIndex = STAFF.findIndex((candidate) => candidate.id === staff.id);
    const shiftTypeId = WORKING_SHIFT_POOL[(staffIndex + dayIndex) % WORKING_SHIFT_POOL.length]!;
    return { ...assignment, shiftTypeId };
  });
}

function shiftHours(shiftTypeId: string | null): number {
  const shiftType = SHIFT_TYPES.find((type) => type.id === shiftTypeId);
  if (!shiftType || shiftType.isTimeOff || !shiftType.startTime || !shiftType.endTime) return 0;
  const [startH, startM] = shiftType.startTime.split(':').map(Number) as [number, number];
  const [endH, endM] = shiftType.endTime.split(':').map(Number) as [number, number];
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

/** Scheduled hours for a staff member across the given assignments (used for the labor cost summary). */
export function scheduledHoursForStaff(assignments: ShiftAssignment[], staffId: string): number {
  return assignments
    .filter((assignment) => assignment.staffId === staffId)
    .reduce((total, assignment) => total + shiftHours(assignment.shiftTypeId), 0);
}

/** Second demo staff member with a flagged (JA-only) correction request — see `generateWorkReports`. */
const SECOND_CORRECTION_STAFF_ID = 's4';
/** Demo staff member with a plain (non-correction) flagged message — see `generateWorkReports`. */
const MESSAGE_ONLY_STAFF_ID = 's5';

/**
 * Builds one WorkReport per staff member per past working day (skips 休暇).
 * Three specific staff/date combinations are seeded with realistic demo
 * messages so both the staff app and the manager dashboard have concrete
 * "!" content to show instead of a placeholder — see
 * docs/phase-1j-2-cafe-workforce-demo-to-production-plan.md §"demo
 * translation UX" for why `messageTranslated` is static, not auto-translated.
 */
export function generateWorkReports(
  dates: string[],
  assignments: ShiftAssignment[],
  todayIso: string,
): WorkReport[] {
  const pastDates = dates.filter((date) => date < todayIso);
  const reports: WorkReport[] = [];

  STAFF.forEach((staff) => {
    pastDates.forEach((date, index) => {
      const assignment = assignments.find((a) => a.staffId === staff.id && a.date === date);
      const shiftType = SHIFT_TYPES.find((type) => type.id === assignment?.shiftTypeId);
      if (!shiftType || shiftType.isTimeOff) return;

      const isPrimaryCorrectionDay = staff.id === CURRENT_STAFF_ID && index === pastDates.length - 2;
      const isSecondCorrectionDay = staff.id === SECOND_CORRECTION_STAFF_ID && index === pastDates.length - 3;
      const isMessageOnlyDay = staff.id === MESSAGE_ONLY_STAFF_ID && index === pastDates.length - 3;

      const breakMinutes = 45;
      const scheduledHours = shiftHours(assignment!.shiftTypeId);

      const actualClockIn: string | null = shiftType.startTime!;
      let actualClockOut: string | null = shiftType.endTime!;
      let actualWorkedHours: number | null = Math.round((scheduledHours - breakMinutes / 60) * 10) / 10;
      let message = '';
      let messageTranslated: string | undefined;
      let hasCorrectionRequest = false;
      let correctionRequest: CorrectionRequest | undefined;

      if (isPrimaryCorrectionDay) {
        // Forgot to press the clock-out button — the system has no recorded clock-out, hence the correction request.
        actualClockOut = null;
        actualWorkedHours = null;
        message = 'I forgot to clock out. I actually worked until 17:30.';
        messageTranslated = '退勤ボタンを押し忘れました。実際は17:30まで勤務しました。';
        hasCorrectionRequest = true;
        correctionRequest = {
          requestedClockIn: '08:30',
          requestedClockOut: '17:30',
          requestedBreakMinutes: 60,
          reason: messageTranslated,
          status: 'pending',
        };
      } else if (isSecondCorrectionDay) {
        message = '出勤時間を08:30に修正してください。';
        hasCorrectionRequest = true;
        correctionRequest = {
          requestedClockIn: '08:30',
          requestedBreakMinutes: breakMinutes,
          reason: message,
          status: 'pending',
        };
      } else if (isMessageOnlyDay) {
        message = '本日の業務で共有事項があります。';
      }

      reports.push({
        staffId: staff.id,
        date,
        plannedLabel: `${shiftType.label}（${shiftType.startTime}-${shiftType.endTime}）`,
        actualClockIn,
        breakMinutes,
        actualClockOut,
        actualWorkedHours,
        transportYen: staff.defaultTransportYen,
        message,
        messageTranslated,
        hasCorrectionRequest,
        correctionRequest,
      });
    });
  });

  return reports;
}

export interface ShortageInfo {
  date: string;
  weekdaySlotLabel: string;
  scheduledCount: number;
  requiredCount: number;
}

function scheduledCountForDate(assignments: ShiftAssignment[], date: string): number {
  return assignments.filter(
    (a) => a.date === date && a.shiftTypeId && !SHIFT_TYPES.find((t) => t.id === a.shiftTypeId)?.isTimeOff,
  ).length;
}

/** Finds the nearest date whose scheduled headcount is below the weekday requirement. */
export function findNearestShortage(
  dates: string[],
  assignments: ShiftAssignment[],
  todayIso: string,
  requirements: StaffingRequirement[] = STAFFING_REQUIREMENTS,
): ShortageInfo | null {
  for (const date of dates) {
    if (date < todayIso) continue;
    const weekday = weekdayIndexMonFirst(new Date(`${date}T00:00:00`));
    const requirement = requirements[weekday]!.requiredCount;

    const dayAssignments = assignments.filter((a) => a.date === date);
    const amCount = dayAssignments.filter((a) => a.shiftTypeId === 'shift1' || a.shiftTypeId === 'full').length;
    const pmCount = dayAssignments.filter(
      (a) => a.shiftTypeId === 'shift2' || a.shiftTypeId === 'shift3' || a.shiftTypeId === 'full',
    ).length;
    const scheduledCount = scheduledCountForDate(assignments, date);

    if (scheduledCount < requirement) {
      const weekdaySlotLabel = amCount <= pmCount ? '午前' : '午後';
      return { date, weekdaySlotLabel, scheduledCount, requiredCount: requirement };
    }
  }
  return null;
}

/** All dates (in the given window) whose scheduled headcount is below the weekday requirement — used for table header indicators. */
export function computeShortageDateSet(
  dates: string[],
  assignments: ShiftAssignment[],
  requirements: StaffingRequirement[] = STAFFING_REQUIREMENTS,
): Set<string> {
  const shortageDates = new Set<string>();
  dates.forEach((date) => {
    const weekday = weekdayIndexMonFirst(new Date(`${date}T00:00:00`));
    const requirement = requirements[weekday]!.requiredCount;
    if (scheduledCountForDate(assignments, date) < requirement) shortageDates.add(date);
  });
  return shortageDates;
}

export function computeManagerAlerts(
  dates: string[],
  assignments: ShiftAssignment[],
  workReports: WorkReport[],
  todayIso: string,
  requirements: StaffingRequirement[] = STAFFING_REQUIREMENTS,
): ManagerAlert[] {
  const alerts: ManagerAlert[] = [];

  const correctionCount = workReports.filter(
    (report) => report.hasCorrectionRequest && (report.correctionRequest?.status ?? 'pending') === 'pending',
  ).length;
  if (correctionCount > 0) {
    alerts.push({ id: 'correction', label: `勤務時間修正依頼: ${correctionCount}件`, tone: 'warning' });
  }

  const unsubmittedCount = STAFF.filter((staff) => !staff.submittedPreference).length;
  if (unsubmittedCount > 0) {
    alerts.push({ id: 'unsubmitted', label: `シフト希望未提出: ${unsubmittedCount}人`, tone: 'warning' });
  }

  const shortage = findNearestShortage(dates, assignments, todayIso, requirements);
  if (shortage) {
    alerts.push({
      id: 'shortage',
      label: `人手不足: ${formatMonthDayWeekday(new Date(`${shortage.date}T00:00:00`))} ${shortage.weekdaySlotLabel} (${shortage.scheduledCount}/${shortage.requiredCount})`,
      tone: 'danger',
    });
  }

  return alerts;
}

export const RECIPES: Recipe[] = [
  {
    id: 'r1',
    name: 'カフェラテ',
    category: 'ドリンク',
    badges: ['人気'],
    icon: '☕',
    image: '/demo/cafe/recipes/latte.png',
    description: 'エスプレッソとスチームミルクの定番ドリンク。安定した味を出すためミルクの温度管理がポイントです。',
    ingredients: ['エスプレッソ 1shot', '牛乳 180ml', '（お好みで）バニラシロップ'],
    steps: ['エスプレッソを抽出する', 'ミルクを65℃までスチームする', 'カップに注ぎラテアートを仕上げる'],
    nameEn: 'Caffe Latte',
    descriptionEn: 'A classic espresso and steamed milk drink. Getting the milk temperature right is key to a consistent taste.',
    ingredientsEn: ['Espresso, 1 shot', 'Milk, 180ml', 'Vanilla syrup (optional)'],
    stepsEn: ['Pull the espresso shot.', 'Steam the milk to about 65°C.', 'Pour into the cup and finish with latte art.'],
  },
  {
    id: 'r2',
    name: '季節のフルーツタルト',
    category: 'デザート',
    badges: ['季節限定', 'New'],
    icon: '🍰',
    description: '季節ごとに変わるフルーツを使ったタルト。仕入れ状況に応じてフルーツの種類を入れ替えます。',
    ingredients: ['タルト生地', 'カスタードクリーム', '季節のフルーツ', 'ナパージュ（つや出し）'],
    steps: ['タルト生地を焼き上げる', 'カスタードクリームを詰める', '季節のフルーツを盛り付ける'],
    nameEn: 'Seasonal Fruit Tart',
    descriptionEn: 'A tart topped with whatever fruit is in season. The fruit changes depending on what is currently available.',
    ingredientsEn: ['Tart shell', 'Pastry cream', 'Seasonal fruit', 'Glaze (for shine)'],
    stepsEn: ['Bake the tart shell.', 'Fill with pastry cream.', 'Arrange the seasonal fruit on top.'],
  },
  {
    id: 'r3',
    name: 'アイスキャラメルマキアート',
    category: 'ドリンク',
    badges: ['人気'],
    icon: '🧊',
    image: '/demo/cafe/recipes/caramel-macchiato.png',
    description: '甘さと苦みのバランスが人気の冷たいドリンク。キャラメルソースは提供直前にかけます。',
    ingredients: ['エスプレッソ 1shot', '牛乳 150ml', 'バニラシロップ', '氷', 'キャラメルソース'],
    steps: ['グラスに氷を入れる', 'ミルクとバニラシロップを注ぐ', 'エスプレッソを注ぎキャラメルソースをかける'],
    nameEn: 'Iced Caramel Macchiato',
    descriptionEn: 'A popular cold drink balancing sweetness and bitterness. Add the caramel sauce right before serving.',
    ingredientsEn: ['Espresso, 1 shot', 'Milk, 150ml', 'Vanilla syrup', 'Ice', 'Caramel sauce'],
    stepsEn: ['Fill the glass with ice.', 'Pour in the milk and vanilla syrup.', 'Add the espresso and drizzle with caramel sauce.'],
  },
  {
    id: 'r4',
    name: 'クロックムッシュ',
    category: 'フード',
    badges: [],
    icon: '🥪',
    description: 'ハムとチーズを挟んで焼き上げる、ランチタイムの定番フードメニューです。',
    ingredients: ['食パン 2枚', 'ベシャメルソース', 'ハム', 'チーズ'],
    steps: ['パンにベシャメルソースを塗る', 'ハムとチーズを挟む', 'チーズをのせてオーブンで焼く'],
    nameEn: 'Croque Monsieur',
    descriptionEn: 'A baked ham and cheese sandwich — a lunchtime staple.',
    ingredientsEn: ['Bread, 2 slices', 'Béchamel sauce', 'Ham', 'Cheese'],
    stepsEn: ['Spread béchamel sauce on the bread.', 'Add the ham and cheese.', 'Top with cheese and bake until golden.'],
  },
  {
    id: 'r5',
    name: '抹茶ラテ',
    category: 'ドリンク',
    badges: ['季節限定'],
    icon: '🍵',
    image: '/demo/cafe/recipes/matcha-latte.png',
    description: '当店自慢のラテは、ミルクの甘さと抹茶の香りを合わせた一杯です。',
    ingredients: ['抹茶液 50g', 'ミルク 160g', 'シロップ 10g', '氷'],
    steps: [
      '提供用カップを準備する。',
      'シロップとミルクを入れて軽く混ぜる。',
      '氷を入れる。',
      '抹茶液を作る（Standard または Ceremonia）。',
      '抹茶液をゆっくり注ぎ、美しい抹茶の層を作る。',
      '提供前にフタ、ストロー、カップの汚れを確認する。',
    ],
    memoTitle: '抹茶液の作り方',
    memo: '小さなカップに抹茶パウダー7gを入れ、80℃のお湯30gを加えてダマがなくなるまで混ぜる。冷水20gを加え、色と泡が整うまでしっかり混ぜる。',
    nameEn: 'Matcha Latte',
    descriptionEn: 'Our signature latte pairing sweet milk with the aroma of matcha.',
    ingredientsEn: ['Matcha liquid, 50g', 'Milk, 160g', 'Syrup, 10g', 'Ice'],
    stepsEn: [
      'Prepare the serving cup.',
      'Add the syrup and milk and stir gently.',
      'Add ice.',
      'Prepare the matcha liquid (Standard or Ceremonia).',
      'Slowly pour in the matcha liquid to create a clean layered look.',
      'Before serving, check the lid, straw, and cup for any mess.',
    ],
    memoTitleEn: 'How to make the matcha liquid',
    memoEn:
      'Put 7g of matcha powder in a small cup and add 30g of 80°C hot water, mixing until no lumps remain. Add 20g of cold water and mix well until the color and foam look right.',
  },
  {
    id: 'r6',
    name: '本日のスープ',
    category: 'フード',
    badges: ['New'],
    icon: '🥣',
    description: '日替わりで具材を変える野菜スープ。仕込み時間を短縮できるシンプルな手順です。',
    ingredients: ['季節の野菜', 'スープストック', '塩・コショウ'],
    steps: ['野菜を炒める', 'スープストックを加えて煮込む', '塩コショウで味を調える'],
    nameEn: 'Soup of the Day',
    descriptionEn: 'A vegetable soup with ingredients that change daily. A simple process that keeps prep time short.',
    ingredientsEn: ['Seasonal vegetables', 'Soup stock', 'Salt & pepper'],
    stepsEn: ['Sauté the vegetables.', 'Add the stock and simmer.', 'Season with salt and pepper.'],
  },
  {
    id: 'r7',
    name: 'バニラシフォンケーキ',
    category: 'デザート',
    badges: [],
    icon: '🍮',
    description: 'ふんわり軽い食感が特徴のシフォンケーキ。メレンゲの立て方で仕上がりが変わります。',
    ingredients: ['卵', '薄力粉', '砂糖', 'サラダ油', 'バニラエッセンス'],
    steps: ['卵白をメレンゲにする', '生地と合わせて型に流す', '焼き上げて冷ましてから切り分ける'],
    nameEn: 'Vanilla Chiffon Cake',
    descriptionEn: 'A light, fluffy chiffon cake. How you whip the meringue changes the final texture.',
    ingredientsEn: ['Eggs', 'Cake flour', 'Sugar', 'Vegetable oil', 'Vanilla extract'],
    stepsEn: ['Whip the egg whites into meringue.', 'Fold into the batter and pour into the mold.', 'Bake, let cool, then slice.'],
  },
  {
    id: 'r8',
    name: 'ホットチョコレート',
    category: 'ドリンク',
    badges: [],
    icon: '🍫',
    description: '寒い季節に人気の濃厚なホットドリンク。仕上げのマシュマロはお好みで調整できます。',
    ingredients: ['チョコレート', '牛乳 180ml', 'マシュマロ'],
    steps: ['チョコレートをミルクで溶かす', '弱火で温めながら混ぜる', 'カップに注ぎマシュマロを添える'],
    nameEn: 'Hot Chocolate',
    descriptionEn: 'A rich hot drink popular in the cold season. Adjust the marshmallow topping to taste.',
    ingredientsEn: ['Chocolate', 'Milk, 180ml', 'Marshmallows'],
    stepsEn: ['Melt the chocolate with the milk.', 'Warm gently over low heat, stirring.', 'Pour into a cup and top with marshmallows.'],
  },
  {
    id: 'r9',
    name: 'アイス紅茶',
    category: 'ドリンク',
    badges: [],
    icon: '🫖',
    image: '/demo/cafe/recipes/img03.png',
    description: '香り高い茶葉を使ったすっきり飲みやすいアイスティー。氷を先に入れて濃さを均一に保ちます。',
    ingredients: ['アイス紅茶（抽出済み） 200ml', 'シロップ 10g', '氷'],
    steps: ['グラスに氷をたっぷり入れる', '抽出した紅茶を注ぐ', 'お好みでシロップを加えて軽く混ぜる'],
    nameEn: 'Iced Tea',
    descriptionEn: 'A refreshing, easy-drinking iced tea made with fragrant tea leaves. Add the ice first to keep the strength consistent.',
    ingredientsEn: ['Brewed iced tea, 200ml', 'Syrup, 10g', 'Ice'],
    stepsEn: ['Fill the glass generously with ice.', 'Pour in the brewed tea.', 'Add syrup to taste and stir gently.'],
  },
  {
    id: 'r10',
    name: 'アイスベリーティーラテ',
    category: 'ドリンク',
    badges: ['New'],
    icon: '🍓',
    image: '/demo/cafe/recipes/img04.png',
    description: 'ベリーの酸味とミルクの優しい甘さを重ねた見た目も華やかな一杯。層が崩れないようゆっくり注ぐのがポイントです。',
    ingredients: ['ベリーティー（抽出済み） 120ml', 'ミルク 100g', 'シロップ 10g', '氷'],
    steps: ['グラスに氷を入れミルクとシロップを注ぐ', 'ベリーティーをゆっくり注ぎ層を作る', 'お好みでベリーソースを添える'],
    nameEn: 'Iced Berry Tea Latte',
    descriptionEn: 'A colorful drink layering berry tartness with gentle milky sweetness. Pour slowly to keep the layers from mixing.',
    ingredientsEn: ['Berry tea (brewed), 120ml', 'Milk, 100g', 'Syrup, 10g', 'Ice'],
    stepsEn: [
      'Fill the glass with ice, then add the milk and syrup.',
      'Slowly pour in the berry tea to form a layer.',
      'Top with berry sauce if desired.',
    ],
  },
  {
    id: 'r11',
    name: 'カプチーノ',
    category: 'ドリンク',
    badges: ['人気'],
    icon: '☕',
    description: 'エスプレッソにきめ細かいフォームミルクをのせた王道の一杯。ミルクの泡立て具合で口当たりが変わります。',
    ingredients: ['エスプレッソ 1shot', '牛乳 120ml'],
    steps: ['エスプレッソを抽出する', 'ミルクをきめ細かく泡立てる', 'カップに注ぎ厚めのフォームを仕上げる'],
    nameEn: 'Cappuccino',
    descriptionEn: 'A classic espresso drink topped with finely textured foam. The foam texture changes the mouthfeel.',
    ingredientsEn: ['Espresso, 1 shot', 'Milk, 120ml'],
    stepsEn: ['Pull the espresso shot.', 'Froth the milk to a fine microfoam.', 'Pour into the cup and finish with a thick layer of foam.'],
  },
  {
    id: 'r12',
    name: 'アメリカーノ',
    category: 'ドリンク',
    badges: [],
    icon: '☕',
    description: 'エスプレッソをお湯で割ったすっきりした味わい。豆の風味を楽しみたいお客様におすすめです。',
    ingredients: ['エスプレッソ 1shot', 'お湯 150ml'],
    steps: ['カップにお湯を注ぐ', 'エスプレッソを抽出してゆっくり注ぐ', '軽く混ぜて提供する'],
    nameEn: 'Americano',
    descriptionEn: "Espresso diluted with hot water for a clean taste — great for guests who want to enjoy the bean's flavor.",
    ingredientsEn: ['Espresso, 1 shot', 'Hot water, 150ml'],
    stepsEn: ['Pour hot water into the cup.', 'Pull the espresso shot and pour it in slowly.', 'Stir gently and serve.'],
  },
  {
    id: 'r13',
    name: 'ハニーレモンスカッシュ',
    category: 'ドリンク',
    badges: ['季節限定'],
    icon: '🍋',
    description: '爽やかなレモンとはちみつの甘さが引き立つ炭酸ドリンク。暑い季節に人気のメニューです。',
    ingredients: ['レモン果汁 30ml', 'はちみつシロップ 20g', '炭酸水 150ml', '氷'],
    steps: ['グラスに氷を入れる', 'レモン果汁とはちみつシロップを注ぐ', '炭酸水を静かに注いで軽く混ぜる'],
    nameEn: 'Honey Lemon Squash',
    descriptionEn: 'A sparkling drink where refreshing lemon meets honey sweetness. Popular during the hot season.',
    ingredientsEn: ['Lemon juice, 30ml', 'Honey syrup, 20g', 'Sparkling water, 150ml', 'Ice'],
    stepsEn: ['Fill the glass with ice.', 'Pour in the lemon juice and honey syrup.', 'Gently top with sparkling water and stir lightly.'],
  },
  {
    id: 'r14',
    name: 'ロイヤルミルクティー',
    category: 'ドリンク',
    badges: [],
    icon: '🫖',
    description: '茶葉をミルクでじっくり煮出した濃厚な味わい。茶葉の量と煮出し時間で風味が決まります。',
    ingredients: ['紅茶葉 大さじ1', '牛乳 180ml', '水 50ml', '砂糖 お好みで'],
    steps: ['水と茶葉を煮出す', '牛乳を加えて弱火で温める', '茶こしで濾してカップに注ぐ'],
    nameEn: 'Royal Milk Tea',
    descriptionEn: 'Tea leaves slowly simmered in milk for a rich flavor. The amount of tea and brewing time determine the taste.',
    ingredientsEn: ['Black tea leaves, 1 tbsp', 'Milk, 180ml', 'Water, 50ml', 'Sugar, to taste'],
    stepsEn: ['Simmer the water with the tea leaves.', 'Add the milk and warm over low heat.', 'Strain through a tea strainer into a cup.'],
  },
  {
    id: 'r15',
    name: 'ほうじ茶ラテ',
    category: 'ドリンク',
    badges: ['季節限定'],
    icon: '🍵',
    description: '香ばしいほうじ茶とミルクを合わせた優しい味わいのラテです。',
    ingredients: ['ほうじ茶液 60g', 'ミルク 160g', 'シロップ 10g'],
    steps: ['ほうじ茶液を作る', 'カップにミルクとシロップを入れて混ぜる', 'ほうじ茶液を注いで仕上げる'],
    nameEn: 'Hojicha Latte',
    descriptionEn: 'A gentle latte combining fragrant roasted hojicha tea with milk.',
    ingredientsEn: ['Hojicha liquid, 60g', 'Milk, 160g', 'Syrup, 10g'],
    stepsEn: ['Prepare the hojicha liquid.', 'Add the milk and syrup to the cup and stir.', 'Pour in the hojicha liquid to finish.'],
  },
  {
    id: 'r16',
    name: 'バナナブレッド',
    category: 'デザート',
    badges: [],
    icon: '🍌',
    description: '熟したバナナをたっぷり使ったしっとり食感の焼き菓子です。',
    ingredients: ['バナナ 3本', '薄力粉', '砂糖', 'バター', '卵'],
    steps: ['バナナを潰して生地に混ぜ込む', '型に流し入れる', 'オーブンでじっくり焼き上げる'],
    nameEn: 'Banana Bread',
    descriptionEn: 'A moist baked treat made with plenty of ripe banana.',
    ingredientsEn: ['Bananas, 3', 'Cake flour', 'Sugar', 'Butter', 'Eggs'],
    stepsEn: ['Mash the bananas and mix into the batter.', 'Pour into the mold.', 'Bake slowly until done.'],
  },
  {
    id: 'r17',
    name: 'ベイクドチーズケーキ',
    category: 'デザート',
    badges: ['人気'],
    icon: '🍰',
    description: '濃厚でなめらかな口どけが人気の定番チーズケーキです。',
    ingredients: ['クリームチーズ', '砂糖', '卵', '生クリーム', 'ビスケット台'],
    steps: ['生地を混ぜ合わせる', '型に流してオーブンで焼く', '粗熱を取り冷蔵庫でしっかり冷やす'],
    nameEn: 'Baked Cheesecake',
    descriptionEn: 'A popular, rich and smooth classic cheesecake.',
    ingredientsEn: ['Cream cheese', 'Sugar', 'Eggs', 'Heavy cream', 'Biscuit base'],
    stepsEn: ['Mix the batter together.', 'Pour into the mold and bake.', 'Let cool, then chill thoroughly in the fridge.'],
  },
  {
    id: 'r18',
    name: 'ミックスサンドイッチ',
    category: 'フード',
    badges: [],
    icon: '🥪',
    description: '定番の具材を組み合わせた食べやすいサンドイッチ。断面が綺麗に見えるようカットに注意します。',
    ingredients: ['食パン', 'ハム', '卵', 'レタス', 'マヨネーズ'],
    steps: ['具材を挟んでラップで包む', '軽く押さえてなじませる', '耳を落として食べやすくカットする'],
    nameEn: 'Mixed Sandwich',
    descriptionEn: 'An easy-to-eat sandwich with classic fillings. Take care when cutting so the cross-section looks clean.',
    ingredientsEn: ['Bread', 'Ham', 'Egg', 'Lettuce', 'Mayonnaise'],
    stepsEn: ['Assemble the fillings and wrap in plastic wrap.', 'Press gently to let it settle.', 'Trim the crusts and cut into easy-to-eat pieces.'],
  },
  {
    id: 'r19',
    name: 'キッシュ・ロレーヌ',
    category: 'フード',
    badges: ['New'],
    icon: '🥧',
    description: 'ベーコンとチーズの入った香ばしい卵生地の焼き込み料理。ランチメニューとして人気です。',
    ingredients: ['パイ生地', 'ベーコン', '卵', '生クリーム', 'チーズ'],
    steps: ['パイ生地を型に敷く', '具材と卵液を流し入れる', 'オーブンで焼き色がつくまで焼く'],
    nameEn: 'Quiche Lorraine',
    descriptionEn: 'A savory baked egg dish with bacon and cheese — a popular lunch item.',
    ingredientsEn: ['Pie crust', 'Bacon', 'Eggs', 'Heavy cream', 'Cheese'],
    stepsEn: ['Line the mold with the pie crust.', 'Add the filling and egg mixture.', 'Bake until golden brown.'],
  },
  {
    id: 'r20',
    name: 'アボカドチキンバゲットサンド',
    category: 'フード',
    badges: [],
    icon: '🥖',
    description: 'アボカドとチキンを挟んだボリューム満点のバゲットサンド。断面の彩りも意識して盛り付けます。',
    ingredients: ['バゲット', 'チキン', 'アボカド', 'レタス', 'ソース'],
    steps: ['バゲットに切り込みを入れる', 'ソースを塗り具材を挟む', '半分にカットして提供する'],
    nameEn: 'Avocado Chicken Baguette Sandwich',
    descriptionEn: 'A hearty baguette sandwich packed with avocado and chicken. Plated with attention to a colorful cross-section.',
    ingredientsEn: ['Baguette', 'Chicken', 'Avocado', 'Lettuce', 'Sauce'],
    stepsEn: ['Slice open the baguette.', 'Spread the sauce and add the fillings.', 'Cut in half and serve.'],
  },
];
