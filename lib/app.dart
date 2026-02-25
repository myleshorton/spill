import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'models/video_meta.dart';
import 'screens/home_screen.dart';
import 'screens/my_videos_screen.dart';
import 'screens/player_screen.dart';
import 'screens/publish_screen.dart';
import 'screens/settings_screen.dart';
import 'services/p2p_service.dart';
import 'theme/spill_theme.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/player/:id',
      builder: (context, state) {
        final video = state.extra as VideoMeta?;
        if (video == null) {
          return const HomeScreen();
        }
        return PlayerScreen(video: video);
      },
    ),
    GoRoute(
      path: '/my-videos',
      builder: (context, state) => const MyVideosScreen(),
    ),
    GoRoute(
      path: '/publish',
      builder: (context, state) => const PublishScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
  ],
);

class SpillApp extends StatelessWidget {
  final P2pService p2pService;

  const SpillApp({super.key, required this.p2pService});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: p2pService,
      child: MaterialApp.router(
        title: 'Spill',
        debugShowCheckedModeBanner: false,
        theme: SpillTheme.theme,
        routerConfig: router,
      ),
    );
  }
}
