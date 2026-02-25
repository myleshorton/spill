import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/video_meta.dart';
import '../theme/spill_theme.dart';
import 'screens/home_screen.dart';
import 'screens/my_videos_screen.dart';
import 'screens/player_screen.dart';
import 'screens/publish_screen.dart';
import 'screens/settings_screen.dart';
import 'services/archive_api.dart';

/// Web app with GoRouter — full-featured, matching desktop.
class ArchiveApp extends StatelessWidget {
  final ArchiveApi api;

  const ArchiveApp({super.key, required this.api});

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const WebHomeScreen(),
        ),
        GoRoute(
          path: '/player/:id',
          builder: (context, state) {
            final video = state.extra as VideoMeta;
            return WebPlayerScreen(video: video);
          },
        ),
        GoRoute(
          path: '/my-videos',
          builder: (context, state) => const WebMyVideosScreen(),
        ),
        GoRoute(
          path: '/publish',
          builder: (context, state) => const WebPublishScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const WebSettingsScreen(),
        ),
      ],
    );

    return ChangeNotifierProvider<ArchiveApi>.value(
      value: api,
      child: MaterialApp.router(
        title: 'Spill',
        theme: SpillTheme.theme,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
