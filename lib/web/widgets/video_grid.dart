import 'package:flutter/material.dart';

import '../../models/video_meta.dart';
import '../services/archive_api.dart';
import 'video_card.dart';

/// Responsive grid of web video cards.
class WebVideoGrid extends StatelessWidget {
  final List<VideoMeta> videos;
  final ArchiveApi api;
  final void Function(VideoMeta video)? onVideoTap;
  final void Function(VideoMeta video)? onVideoLongPress;
  final Widget Function(VideoMeta video)? overlayBuilder;

  const WebVideoGrid({
    super.key,
    required this.videos,
    required this.api,
    this.onVideoTap,
    this.onVideoLongPress,
    this.overlayBuilder,
  });

  int _crossAxisCount(double width) {
    if (width < 600) return 1;
    if (width < 900) return 2;
    if (width < 1200) return 3;
    return 4;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = _crossAxisCount(constraints.maxWidth);
        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 16,
            mainAxisSpacing: 12,
            childAspectRatio: 1.05,
          ),
          itemCount: videos.length,
          itemBuilder: (context, index) {
            final video = videos[index];
            return WebVideoCard(
              video: video,
              api: api,
              onTap: onVideoTap != null ? () => onVideoTap!(video) : null,
              onLongPress: onVideoLongPress != null ? () => onVideoLongPress!(video) : null,
              overlay: overlayBuilder?.call(video),
            );
          },
        );
      },
    );
  }
}
