# Fitrybe - Comprehensive Frontend Integration Guide (Page-by-Page & Feature-by-Feature)

This guide documents the API endpoints, request/response payloads, Socket.IO real-time events, and Dart service code for **every single screen and feature** in the Flutter app (`C:\VS_Code\fitrybe`).

---

## Table of Contents
1. [Base Configuration & Environment](#1-base-configuration--environment)
2. [Feature 1: Onboarding & Authentication](#feature-1-onboarding--authentication)
3. [Feature 2: Social Feed & Post Creation](#feature-2-social-feed--post-creation)
4. [Feature 3: GPS Workout Recording & Map](#feature-3-gps-workout-recording--map)
5. [Feature 4: Fitness Analytics & Goal Customization](#feature-4-fitness-analytics--goal-customization)
6. [Feature 5: Trybes (Clubs & Leaderboards)](#feature-5-trybes-clubs--leaderboards)
7. [Feature 6: Cliques (Live Group Workouts & GPS Telemetry)](#feature-6-cliques-live-group-workouts--gps-telemetry)
8. [Feature 7: Messaging & Real-Time Chat](#feature-7-messaging--real-time-chat)
9. [Feature 8: Notifications System](#feature-8-notifications-system)
10. [Feature 9: User Profile, Social Graph & Settings](#feature-9-user-profile-social-graph--settings)
11. [Feature 10: Subscriptions & Gamified Achievements](#feature-10-subscriptions--gamified-achievements)
12. [Complete Dart ApiService Implementation](#complete-dart-apiservice-implementation)

---

## 1. Base Configuration & Environment

### Base URLs
- **Android Emulator**: `http://10.0.2.2:4000/api`
- **iOS / Desktop / macOS**: `http://localhost:4000/api`
- **Physical Device**: `http://<YOUR_LOCAL_IP>:4000/api`

### Auth Header Format
```http
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

---

## Feature 1: Onboarding & Authentication

### Target Screens
- `lib/screens/welcome_screen.dart`
- `lib/screens/auth_screens.dart`
- `lib/screens/user_details_screen.dart`
- `lib/screens/health_permission_screen.dart`

### Endpoints
#### 1. Register User
- **Method & Path**: `POST /api/auth/register`
- **Request Body**:
  ```json
  {
    "email": "runner@fitrybe.app",
    "password": "Password123!"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "user": {
      "id": "u-uuid-123",
      "email": "runner@fitrybe.app",
      "onboardingCompleted": false
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
  ```

#### 2. Login User
- **Method & Path**: `POST /api/auth/login`
- **Request Body**:
  ```json
  {
    "email": "runner@fitrybe.app",
    "password": "Password123!"
  }
  ```

#### 3. Complete Onboarding Profile Details
- **Method & Path**: `PATCH /api/users/me`
- **Request Body**:
  ```json
  {
    "firstName": "Alex",
    "lastName": "Rivera",
    "dob": "1998-05-14T00:00:00.000Z",
    "gender": "MALE",
    "height": 178.5,
    "weight": 70.0,
    "fitnessGoal": "Sub 3-hour Marathon",
    "activityInterests": ["Running", "Cycling"],
    "sportInterests": ["Track", "Triathlon"],
    "onboardingCompleted": true
  }
  ```

#### 4. Change Password
- **Method & Path**: `POST /api/auth/change-password`
- **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword456!"
  }
  ```

---

## Feature 2: Social Feed & Post Creation

### Target Screens
- `lib/screens/home_screen.dart`
- `lib/screens/create_post_screen.dart`

### Endpoints
#### 1. Fetch Social Feed
- **Method & Path**: `GET /api/posts?limit=20` (Supports `authorId`, `type`, `cursor`)
- **Response (200 OK)**:
  ```json
  {
    "posts": [
      {
        "id": "post-uuid-1",
        "caption": "Crushed 7km along Golden Gate Bridge! 🏃‍♂️⚡",
        "type": "Activity",
        "locationTag": "San Francisco, CA",
        "imageUrls": ["/uploads/posts/run1.jpg"],
        "likeCount": 14,
        "commentCount": 3,
        "likedByMe": true,
        "author": {
          "id": "u-uuid-123",
          "firstName": "Alex",
          "lastName": "Rivera",
          "avatarUrl": "/uploads/avatars/alex.jpg"
        },
        "activity": {
          "id": "act-uuid-1",
          "type": "Run",
          "distance": 7200.0,
          "duration": 2100,
          "avgPace": 4.86
        }
      }
    ],
    "nextCursor": "post-uuid-2"
  }
  ```

#### 2. Create New Post (with Images)
- **Method & Path**: `POST /api/posts` (`multipart/form-data`)
- **Form Fields**:
  - `caption`: `"Great morning workout with the Trybe!"`
  - `type`: `"Photo"`
  - `locationTag`: `"Central Park"`
  - `images`: file binary (1 to 4 images supported)

#### 3. Like / Unlike Post
- **Like**: `POST /api/posts/:postId/like`
- **Unlike**: `DELETE /api/posts/:postId/like`

#### 4. Comments
- **Get Comments**: `GET /api/posts/:postId/comments`
- **Post Comment**: `POST /api/posts/:postId/comments`
  - Body: `{ "text": "Awesome run pace! 🔥" }`

---

## Feature 3: GPS Workout Recording & Map

### Target Screens
- `lib/screens/record_screen.dart`
- `lib/screens/record_map_screen.dart`

### Endpoints
#### Save Workout Activity
- **Method & Path**: `POST /api/activities`
- **Request Body**:
  ```json
  {
    "title": "Morning Golden Gate Tempo Run",
    "type": "Run",
    "duration": 2100,
    "distance": 7200.0,
    "calories": 520,
    "avgPace": 4.86,
    "maxSpeed": 16.2,
    "elevationGain": 85.0,
    "routeData": [
      { "lat": 37.7749, "lng": -122.4194, "elevation": 12.0 },
      { "lat": 37.7801, "lng": -122.4215, "elevation": 18.5 }
    ],
    "createPost": true
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "activity": {
      "id": "act-uuid-1",
      "title": "Morning Golden Gate Tempo Run",
      "type": "Run",
      "duration": 2100,
      "distance": 7200.0,
      "calories": 520,
      "avgPace": 4.86
    }
  }
  ```

---

## Feature 4: Fitness Analytics & Goal Customization

### Target Screens
- `lib/screens/activity_analytics_tab.dart`
- `lib/screens/customize_goal_screen.dart`

### Endpoints
#### 1. Fetch Analytics Summary
- **Method & Path**: `GET /api/activities/analytics`
- **Response (200 OK)**:
  ```json
  {
    "summary": {
      "totalDistanceKm": 148.5,
      "totalDurationHours": 14.2,
      "totalCalories": 9800,
      "totalWorkouts": 22
    },
    "weekly": {
      "distanceKm": 34.2,
      "durationMins": 195,
      "workoutCount": 5
    },
    "recentActivities": [...]
  }
  ```

#### 2. Get & Set Fitness Goals
- **Get Goal & Progress**: `GET /api/goals`
- **Update Goals**: `PUT /api/goals`
  - Body:
    ```json
    {
      "period": "WEEKLY",
      "targetSteps": 12000,
      "targetDistance": 35.0,
      "targetCalories": 600,
      "targetWorkouts": 4
    }
    ```

---

## Feature 5: Trybes (Clubs & Leaderboards)

### Target Screens
- `lib/screens/trybes_tab.dart`
- `lib/screens/create_trybe_screen.dart`
- `lib/screens/trybe_detail_screen.dart`

### Endpoints
#### 1. Discover & Filter Trybes
- **Method & Path**: `GET /api/trybes?category=Running&search=SF&mine=false`
- **Response**:
  ```json
  {
    "trybes": [
      {
        "id": "trybe-uuid-1",
        "name": "Bay Area Speed Demons",
        "category": "Running",
        "location": "San Francisco, CA",
        "imageUrl": "/uploads/trybes/running.jpg",
        "memberCount": 42,
        "isMember": true
      }
    ]
  }
  ```

#### 2. Create Trybe
- **Method & Path**: `POST /api/trybes` (`multipart/form-data`)
- **Fields**: `name`, `description`, `category`, `location`, `image`

#### 3. Trybe Leaderboard (Distance Ranking)
- **Method & Path**: `GET /api/trybes/:trybeId/leaderboard`
- **Response**:
  ```json
  {
    "leaderboard": [
      { "rank": 1, "userId": "u-1", "name": "Marcus Chen", "stat": "84.2 km", "distanceKm": 84.2 },
      { "rank": 2, "userId": "u-2", "name": "Elena Forge", "stat": "76.5 km", "distanceKm": 76.5 },
      { "rank": 3, "userId": "u-3", "name": "Alex Rivera", "stat": "68.1 km", "distanceKm": 68.1 }
    ]
  }
  ```

#### 4. Trybe Posts Feed
- **Method & Path**: `GET /api/trybes/:trybeId/posts`

#### 5. Join / Leave Trybe
- **Join**: `POST /api/trybes/:trybeId/join`
- **Leave**: `DELETE /api/trybes/:trybeId/join`

---

## Feature 6: Cliques (Live Group Workouts & GPS Telemetry)

### Target Screens
- `lib/screens/clique_tab.dart`
- `lib/screens/create_clique_activity_screen.dart`
- `lib/screens/clique_live_activity_screen.dart`

### Endpoints & Sockets
#### 1. Host Live Clique
- **Method & Path**: `POST /api/cliques`
- **Body**:
  ```json
  {
    "title": "SF Sunset 10k Group Ride",
    "activityType": "Cycling",
    "scheduledAt": "2026-08-15T18:00:00.000Z",
    "targetDistance": 10.0,
    "meetingLocation": "Ocean Beach Pier"
  }
  ```

#### 2. Join / Update Status
- **Join**: `POST /api/cliques/:sessionId/join`
- **Change Status** (Host starts workout): `PATCH /api/cliques/:sessionId/status`
  - Body: `{ "status": "LIVE" }` (or `"COMPLETED"`)

#### 3. Real-Time Socket GPS Telemetry
- **Join Room**: `socket.emit('clique:join', sessionId);`
- **Broadcast Telemetry**:
  ```javascript
  socket.emit('clique:telemetry', {
    sessionId: "clique-uuid-1",
    lat: 37.7749,
    lng: -122.4194,
    distance: 4250.0,
    pace: 4.85,
    calories: 320
  });
  ```
- **Listen for Participants**:
  ```javascript
  socket.on('clique:telemetry_update', (data) => {
    // data: { userId, lat, lng, distance, pace, calories, timestamp }
  });
  ```

---

## Feature 7: Messaging & Real-Time Chat

### Target Screens
- `lib/screens/messaging_screen.dart`
- `lib/screens/chat_detail_screen.dart`

### Endpoints & Sockets
#### 1. Conversations Inbox
- **Method & Path**: `GET /api/chat/conversations`
- **Response**:
  ```json
  {
    "conversations": [
      {
        "id": "conv-uuid-1",
        "type": "DIRECT",
        "title": "Marcus Chen",
        "avatarUrl": "/uploads/avatars/marcus.jpg",
        "lastMessage": {
          "text": "See you at the track tomorrow at 7 AM!",
          "createdAt": "2026-08-15T02:40:00.000Z"
        }
      }
    ]
  }
  ```

#### 2. Message History & REST Send
- **Get History**: `GET /api/chat/conversations/:id/messages`
- **Send Message**: `POST /api/chat/conversations/:id/messages`
  - Body: `{ "text": "On my way!" }`
- **Mark Read**: `POST /api/chat/conversations/:id/read`

#### 3. Socket.IO Real-Time Messaging
- **Connect**: `socket.emit('join_conversation', conversationId);`
- **Send**: `socket.emit('chat:send', { conversationId: "...", text: "Hello!" });`
- **Typing Indicator**: `socket.emit('chat:typing', { conversationId: "...", isTyping: true });`
- **Listen**:
  ```javascript
  socket.on('chat:message', (msg) => { ... });
  socket.on('chat:user_typing', (status) => { ... });
  ```

---

## Feature 8: Notifications System

### Target Screens
- `lib/screens/notifications_tab.dart`

### Endpoints
#### 1. List Notifications
- **Method & Path**: `GET /api/notifications?unreadOnly=false`
- **Response**:
  ```json
  {
    "notifications": [
      {
        "id": "notif-1",
        "type": "LIKE",
        "title": "New Like",
        "body": "Marcus Chen liked your post.",
        "isRead": false,
        "actor": {
          "firstName": "Marcus",
          "avatarUrl": "/uploads/avatars/marcus.jpg"
        }
      }
    ],
    "unreadCount": 3
  }
  ```

#### 2. Mark Read / Clear
- **Mark Read**: `PATCH /api/notifications/:id/read` (use `:id = all` for mark all)
- **Delete**: `DELETE /api/notifications/:id`

---

## Feature 9: User Profile, Social Graph & Settings

### Target Screens
- `lib/screens/profile_tab.dart`
- `lib/screens/edit_profile_screen.dart`

### Endpoints
#### 1. Get Profile Details & Stats
- **Method & Path**: `GET /api/users/:userId`
- **Response**:
  ```json
  {
    "user": {
      "id": "u-123",
      "firstName": "Alex",
      "lastName": "Rivera",
      "bio": "Marathon runner & trail enthusiast",
      "avatarUrl": "/uploads/avatars/alex.jpg",
      "bannerUrl": "/uploads/banners/banner.jpg",
      "location": "San Francisco, CA"
    },
    "stats": {
      "followerCount": 128,
      "followingCount": 94,
      "postCount": 45,
      "activityCount": 82
    },
    "isFollowing": false
  }
  ```

#### 2. Upload Avatar & Banner
- **Upload Avatar**: `POST /api/users/me/avatar` (`multipart/form-data`, file field: `avatar`)
- **Upload Banner**: `POST /api/users/me/banner` (`multipart/form-data`, file field: `banner`)

#### 3. Follow & Followers
- **Follow**: `POST /api/users/:userId/follow`
- **Unfollow**: `DELETE /api/users/:userId/follow`
- **List Followers**: `GET /api/users/:userId/followers`
- **List Following**: `GET /api/users/:userId/following`

---

## Feature 10: Subscriptions & Gamified Achievements

### Target Screens
- `lib/screens/subscription_screen.dart`
- `lib/screens/achievements_screen.dart`
- `lib/widgets/achievement_badge_widget.dart`

### Endpoints
#### 1. Pro Subscription
- **Get Status**: `GET /api/subscription/status`
  - Response (200 OK):
    ```json
    {
      "isPro": true,
      "status": "PRO_ACTIVE",
      "subscription": {
        "id": "sub-uuid-1",
        "userId": "u-123",
        "plan": "MONTHLY",
        "status": "ACTIVE",
        "startDate": "2026-08-01T00:00:00.000Z",
        "expiresAt": "2026-09-01T00:00:00.000Z"
      }
    }
    ```
- **Subscribe**: `POST /api/subscription/subscribe`
  - Body: `{ "plan": "MONTHLY" }` // Allowed: "MONTHLY", "ANNUAL", "TRIAL"
  - Response (201 Created):
    ```json
    {
      "message": "Subscription updated successfully",
      "isPro": true,
      "subscription": {
        "plan": "MONTHLY",
        "status": "ACTIVE",
        "expiresAt": "2026-09-01T00:00:00.000Z"
      }
    }
    ```
- **Cancel Subscription**: `POST /api/subscription/cancel`

#### 2. Gamified Achievements Closet
- **Get Achievements Progress**: `GET /api/achievements`
  - Response (200 OK):
    ```json
    {
      "totalCount": 37,
      "unlockedCount": 21,
      "unlockedRatio": 0.57,
      "unlockedMap": {
        "first_step": "2026-02-03T00:00:00.000Z",
        "getting_started": "2026-02-11T00:00:00.000Z",
        "on_the_move": "2026-04-06T00:00:00.000Z",
        "unstoppable": "2026-06-22T00:00:00.000Z"
      },
      "achievements": [...]
    }
    ```
- **Unlock Achievement**: `POST /api/achievements/unlock`
  - Body: `{ "achievementId": "century_club" }`
  - Response (201 Created):
    ```json
    {
      "message": "Achievement unlocked successfully",
      "achievement": {
        "id": "ach-uuid-99",
        "userId": "u-123",
        "achievementId": "century_club",
        "unlockedAt": "2026-08-15T03:25:00.000Z"
      }
    }
    ```

---

## Complete Dart ApiService Implementation

Copy & paste this updated service class into `lib/services/api_service.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static const String baseUrl = 'http://10.0.2.2:4000/api';
  static String? _token;

  static void setToken(String token) => _token = token;

  static Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  // --- Auth ---
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode == 200) _token = data['accessToken'];
    return data;
  }

  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> body) async {
    final res = await http.patch(Uri.parse('$baseUrl/users/me'), headers: _headers, body: jsonEncode(body));
    return jsonDecode(res.body);
  }

  // --- Posts & Feed ---
  static Future<List<dynamic>> getFeed({String? authorId, String? type}) async {
    final uri = Uri.parse('$baseUrl/posts').replace(queryParameters: {
      if (authorId != null) 'authorId': authorId,
      if (type != null) 'type': type,
    });
    final res = await http.get(uri, headers: _headers);
    return jsonDecode(res.body)['posts'];
  }

  static Future<bool> toggleLike(String postId, bool isLiked) async {
    final uri = Uri.parse('$baseUrl/posts/$postId/like');
    final res = isLiked ? await http.delete(uri, headers: _headers) : await http.post(uri, headers: _headers);
    return res.statusCode < 300;
  }

  // --- Workout Activities ---
  static Future<Map<String, dynamic>> logActivity(Map<String, dynamic> activityData) async {
    final res = await http.post(Uri.parse('$baseUrl/activities'), headers: _headers, body: jsonEncode(activityData));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getAnalytics() async {
    final res = await http.get(Uri.parse('$baseUrl/activities/analytics'), headers: _headers);
    return jsonDecode(res.body);
  }

  // --- Trybes ---
  static Future<List<dynamic>> getTrybeLeaderboard(String trybeId) async {
    final res = await http.get(Uri.parse('$baseUrl/trybes/$trybeId/leaderboard'), headers: _headers);
    return jsonDecode(res.body)['leaderboard'];
  }

  // --- Goals ---
  static Future<Map<String, dynamic>> updateGoals(Map<String, dynamic> goals) async {
    final res = await http.put(Uri.parse('$baseUrl/goals'), headers: _headers, body: jsonEncode(goals));
    return jsonDecode(res.body);
  }

  // --- Achievements & Subscriptions ---
  static Future<Map<String, dynamic>> getAchievements() async {
    final res = await http.get(Uri.parse('$baseUrl/achievements'), headers: _headers);
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> unlockAchievement(String achievementId) async {
    final res = await http.post(Uri.parse('$baseUrl/achievements/unlock'), headers: _headers, body: jsonEncode({'achievementId': achievementId}));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getSubscriptionStatus() async {
    final res = await http.get(Uri.parse('$baseUrl/subscription/status'), headers: _headers);
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> subscribe(String plan) async {
    final res = await http.post(Uri.parse('$baseUrl/subscription/subscribe'), headers: _headers, body: jsonEncode({'plan': plan}));
    return jsonDecode(res.body);
  }
}
```
