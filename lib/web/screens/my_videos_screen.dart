import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/video_meta.dart';
import '../../theme/colors.dart';
import '../services/archive_api.dart';
import '../widgets/video_grid.dart';

/// Screen showing only videos published by this node (web version).
class WebMyVideosScreen extends StatefulWidget {
  const WebMyVideosScreen({super.key});

  @override
  State<WebMyVideosScreen> createState() => _WebMyVideosScreenState();
}

class _WebMyVideosScreenState extends State<WebMyVideosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ArchiveApi>().fetchMyVideos();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          'My Files',
          style: Theme.of(context).textTheme.displaySmall,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<ArchiveApi>().refreshMyVideos();
            },
            tooltip: 'Refresh',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(
            height: 1,
            color: SpillColors.divider,
          ),
        ),
      ),
      body: Consumer<ArchiveApi>(
        builder: (context, api, _) {
          if (api.myVideos.isEmpty) {
            return _EmptyState();
          }

          return WebVideoGrid(
            videos: api.myVideos,
            api: api,
            onVideoTap: (video) => _openVideo(context, video),
            onVideoLongPress: (video) => _confirmDelete(context, video),
            overlayBuilder: (video) => PopupMenuButton<String>(
              icon: Icon(
                Icons.more_vert,
                color: SpillColors.textPrimary.withValues(alpha: 0.8),
              ),
              color: SpillColors.surface,
              onSelected: (value) {
                if (value == 'delete') _confirmDelete(context, video);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(
                  value: 'delete',
                  child: Row(
                    children: [
                      Icon(Icons.delete_outline, size: 18),
                      SizedBox(width: 8),
                      Text('Delete'),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: SpillColors.accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        onPressed: () => context.go('/publish'),
        child: const Icon(Icons.publish),
      ),
    );
  }

  void _openVideo(BuildContext context, VideoMeta video) {
    context.go('/player/${video.id}', extra: video);
  }

  void _confirmDelete(BuildContext context, VideoMeta video) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete File?'),
        content: Text(
          'Remove "${video.title}" from the network?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await context.read<ArchiveApi>().deleteVideo(video.id);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('File deleted'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Delete failed: $e'),
                      duration: const Duration(seconds: 3),
                    ),
                  );
                }
              }
            },
            child: Text(
              'Delete',
              style: TextStyle(color: SpillColors.error),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.video_library_outlined,
              size: 64,
              color: SpillColors.textSecondary.withValues(alpha: 0.4),
            ),
            const SizedBox(height: 24),
            Text(
              'No publications yet',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Publish a file to see it here.\nTap the publish button to get started.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
