const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Fitrybe database...');

  // Hash password
  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Users
  const alex = await prisma.user.upsert({
    where: { email: 'alex@fitrybe.app' },
    update: {},
    create: {
      email: 'alex@fitrybe.app',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Rivera',
      bio: 'Marathon runner & trail enthusiast. Always pushing limits!',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      bannerUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200',
      location: 'San Francisco, CA',
      activityInterests: ['Running', 'Cycling', 'Trail Running'],
      sportInterests: ['Track', 'Triathlon'],
      onboardingCompleted: true,
      height: 178,
      weight: 70,
      targetWeight: 68,
      fitnessGoal: 'Sub 3-hour Marathon',
      stepTarget: 12000,
      weeklyDistanceTarget: 35.0,
      caloriesTarget: 600,
    },
  });

  const marcus = await prisma.user.upsert({
    where: { email: 'marcus@fitrybe.app' },
    update: {},
    create: {
      email: 'marcus@fitrybe.app',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Chen',
      bio: 'HIIT addict & Fitrybe Captain. Join my morning sprints!',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
      location: 'London, UK',
      activityInterests: ['HIIT', 'Running', 'CrossFit'],
      sportInterests: ['Functional Training'],
      onboardingCompleted: true,
    },
  });

  const elena = await prisma.user.upsert({
    where: { email: 'elena@fitrybe.app' },
    update: {},
    create: {
      email: 'elena@fitrybe.app',
      passwordHash,
      firstName: 'Elena',
      lastName: 'Forge',
      bio: 'Ultra cyclist & mountain seeker 🚴‍♀️⚡',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      location: 'Boulder, CO',
      activityInterests: ['Cycling', 'Hiking'],
      sportInterests: ['Road Cycling'],
      onboardingCompleted: true,
    },
  });

  console.log(`Created users: ${alex.firstName}, ${marcus.firstName}, ${elena.firstName}`);

  // 2. Follow relationships
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: alex.id, followingId: marcus.id } },
    create: { followerId: alex.id, followingId: marcus.id },
    update: {},
  });
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: alex.id, followingId: elena.id } },
    create: { followerId: alex.id, followingId: elena.id },
    update: {},
  });

  // 3. Create Trybes
  const sfRunners = await prisma.trybe.create({
    data: {
      name: 'Bay Area Speed Demons',
      description: 'Weekly tempo runs and track workouts in SF Embarcadero.',
      category: 'Running',
      location: 'San Francisco, CA',
      activityInterests: ['Running', 'Sprint'],
      creatorId: alex.id,
      imageUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800',
      members: {
        create: [
          { userId: alex.id, role: 'CREATOR' },
          { userId: marcus.id, role: 'CAPTAIN' },
          { userId: elena.id, role: 'MEMBER' },
        ],
      },
    },
  });

  console.log(`Created Trybe: ${sfRunners.name}`);

  // 4. Create Activities
  const runActivity = await prisma.activity.create({
    data: {
      userId: alex.id,
      title: 'Morning Golden Gate Tempo Run',
      type: 'Run',
      duration: 2100, // 35 minutes
      distance: 7200, // 7.2 km
      calories: 520,
      avgPace: 4.86,
      maxSpeed: 16.2,
      elevationGain: 85,
      routeData: [
        { lat: 37.7749, lng: -122.4194, elevation: 12 },
        { lat: 37.7801, lng: -122.4215, elevation: 18 },
        { lat: 37.7885, lng: -122.4310, elevation: 32 },
        { lat: 37.7950, lng: -122.4400, elevation: 45 },
      ],
    },
  });

  console.log(`Created Activity: ${runActivity.title}`);

  // 5. Create Posts
  const post = await prisma.post.create({
    data: {
      authorId: alex.id,
      caption: 'Crushed the 7km morning run along Golden Gate bridge! Cool breeze & clear skies 🏃‍♂️✨',
      type: 'Activity',
      audience: 'EVERYONE',
      locationTag: 'Golden Gate Park, SF',
      activityId: runActivity.id,
      imageUrls: [
        'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800',
      ],
      likes: {
        create: [
          { userId: marcus.id },
          { userId: elena.id },
        ],
      },
      comments: {
        create: [
          { authorId: marcus.id, text: 'Awesome pace Alex! 🔥' },
          { authorId: elena.id, text: 'Beautiful view, keep it up!' },
        ],
      },
    },
  });

  console.log(`Created Post: ${post.id}`);

  // 6. Create Live Clique Session
  const cliqueSession = await prisma.cliqueSession.create({
    data: {
      title: 'SF Sunset 10k Group Ride',
      description: 'Casual group bike ride along Ocean Beach.',
      activityType: 'Cycling',
      creatorId: elena.id,
      status: 'UPCOMING',
      scheduledAt: new Date(Date.now() + 3600000 * 4), // 4 hours from now
      targetDistance: 10.0,
      targetDuration: 2400,
      meetingLocation: 'Ocean Beach Pier',
      participants: {
        create: [
          { userId: elena.id, role: 'HOST', status: 'JOINED' },
          { userId: alex.id, role: 'PARTICIPANT', status: 'JOINED' },
        ],
      },
    },
  });

  console.log(`Created Clique Session: ${cliqueSession.title}`);

  // 7. Create Direct Message Conversation
  const conversation = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [
          { userId: alex.id },
          { userId: marcus.id },
        ],
      },
      messages: {
        create: [
          { senderId: marcus.id, text: 'Hey Alex! Are we running at 7 AM tomorrow?' },
          { senderId: alex.id, text: 'Yes! Meeting at Embarcadero clock tower.' },
        ],
      },
    },
  });

  console.log(`Created Conversation: ${conversation.id}`);

  // 8. Notifications
  await prisma.notification.create({
    data: {
      recipientId: alex.id,
      actorId: marcus.id,
      type: 'LIKE',
      title: 'New Like',
      body: 'liked your Morning Golden Gate Tempo Run post.',
      entityId: post.id,
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
