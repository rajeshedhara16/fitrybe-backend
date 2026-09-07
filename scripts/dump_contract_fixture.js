/**
 * Drives the real API the way the app does — sets goals, logs workouts — then
 * writes the exact payloads the analytics screen receives to a fixture.
 *
 *     node scripts/dump_contract_fixture.js
 *
 * The Flutter side replays that fixture through GoalProgress in
 * test/api_contract_test.dart, so the two halves are checked against each
 * other rather than each against its own assumptions.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { signAccessToken } = require('../src/utils/jwt');

const OUT = path.resolve(
  __dirname,
  '../../fitrybe/test/fixtures/api_contract.json'
);

async function main() {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;

  const tag = `contract-${Date.now()}`;
  const user = await prisma.user.create({
    data: { email: `${tag}@example.test`, passwordHash: 'x', firstName: 'a' },
  });
  const token = signAccessToken(user.id);

  const api = (p, opts = {}) =>
    fetch(`${url}/api${p}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

  // ---- exactly what customize_goal_screen sends ----
  const goals = [
    { activity: 'Running', metric: 'Distance', targetValue: 5, unit: 'Km', frequency: 'Daily', period: 'DAILY' },
    { activity: 'Cycling', metric: 'Distance', targetValue: 50, unit: 'Km', frequency: 'Weekly', period: 'WEEKLY' },
    { activity: 'Swimming', metric: 'Sessions', targetValue: 8, unit: 'Sessions', frequency: 'Monthly', period: 'MONTHLY' },
  ];
  for (const g of goals) {
    const res = await api('/goals', { method: 'PUT', body: JSON.stringify(g) });
    if (res.status !== 200) throw new Error(`goal save failed: ${res.status}`);
  }

  // ---- exactly what the recorder sends ----
  const workouts = [
    { title: 'Morning run', type: 'Running', duration: 1800, distance: 6000, calories: 420, avgPace: 5 },
    // Deliberately a different activity: a walk must not satisfy a Running
    // goal, and must not become the Running distance record.
    { title: 'Long walk', type: 'Walking', duration: 5400, distance: 20000, calories: 1400, avgPace: 4.5 },
    { title: 'Long ride', type: 'Cycling', duration: 5400, distance: 60000, calories: 900, avgPace: 1.5 },
    { title: 'Pool', type: 'Swimming', duration: 1800, distance: 1500, calories: 350 },
    { title: 'Pool', type: 'Swimming', duration: 1500, distance: 1200, calories: 300 },
    { title: 'Pool', type: 'Swimming', duration: 1200, distance: 1000, calories: 250 },
    // No distance, so the server has nothing to derive a pace from. This is
    // the case the Best Pace record has to skip.
    { title: 'Weights', type: 'Gym Workout', duration: 2700, distance: 0, calories: 300 },
  ];
  for (const w of workouts) {
    const res = await api('/activities', { method: 'POST', body: JSON.stringify(w) });
    if (res.status !== 201) {
      throw new Error(`activity failed: ${res.status} ${await res.text()}`);
    }
  }

  // ---- exactly what the analytics screen fetches ----
  const goalsPayload = await (await api('/goals')).json();
  const analyticsPayload = await (await api('/activities/analytics')).json();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'Captured from the live API by scripts/dump_contract_fixture.js.',
        goals: goalsPayload,
        analytics: analyticsPayload,
      },
      null,
      2
    )
  );

  console.log(`wrote ${OUT}`);
  console.log(`  /goals keys     : ${Object.keys(goalsPayload).join(', ')}`);
  console.log(`  /analytics keys : ${Object.keys(analyticsPayload).join(', ')}`);
  console.log(`  goals returned  : ${goalsPayload.goals.length}`);
  console.log(`  activities      : ${analyticsPayload.recentActivities.length}`);
  console.log(`  record rows     : ${analyticsPayload.records.length}`);

  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  server.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
